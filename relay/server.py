#!/usr/bin/env python3
"""
Vox Relay Desktop — Servidor proxy de cache e espelho local para o ecossistema Vox.
Roda em localhost (padrão 127.0.0.1:3920) e acelera consultas para clientes locais (PWA).
Dependências: Nenhuma (usa apenas a biblioteca padrão do Python 3).
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from relay import inbox
from relay import mirror_validate

DEFAULT_PORT = 3920
DEFAULT_HOST = "127.0.0.1"


def resolve_listen_port(env=None, default=DEFAULT_PORT):
    raw = str((env if env is not None else os.environ).get("VOX_RELAY_PORT") or "").strip()
    return int(raw) if raw.isdigit() else default


CACHE_DIR = Path(__file__).resolve().parent / ".cache"
UPSTREAM_GATEWAYS = [
    "https://arweave.net",
    "https://turbo-gateway.com/raw",
]

TX_ID_REGEX = re.compile(r"^[A-Za-z0-9_-]{43}$")

def ensure_cache_dir():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

def count_cached_items():
    if not CACHE_DIR.exists():
        return 0
    return len([f for f in CACHE_DIR.glob("*") if f.is_file() and not f.name.startswith("index_")])


def list_community_indexes():
    if not CACHE_DIR.exists():
        return []
    return sorted(
        f.stem.replace("index_", "", 1)
        for f in CACHE_DIR.glob("index_*.json")
        if f.is_file()
    )


def cache_dir_bytes():
    if not CACHE_DIR.exists():
        return 0
    total = 0
    for f in CACHE_DIR.glob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


def max_cache_bytes():
    raw = os.environ.get("VOX_RELAY_MAX_CACHE_MB", "").strip()
    if not raw:
        return None
    try:
        return int(float(raw)) * 1024 * 1024
    except ValueError:
        return None

class VoxRelayHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        
        # 1. Health check
        if path == "/health" or path == "":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._set_cors_headers()
            self.end_headers()
            indexes = list_community_indexes()
            cache_bytes = cache_dir_bytes()
            max_b = max_cache_bytes()
            payload = {
                "status": "ok",
                "app": "vox-relay",
                "version": "0.2.1",
                "cachedCount": count_cached_items(),
                "communityIndexes": indexes,
                "communityIndexCount": len(indexes),
                "cacheBytes": cache_bytes,
                "maxCacheBytes": max_b,
                "cacheDir": str(CACHE_DIR),
            }
            self.wfile.write(json.dumps(payload).encode("utf-8"))
            return

        # 2. Proxy de Transação: /tx/<txId>
        if path.startswith("/tx/"):
            tx_id = path[4:]
            if not TX_ID_REGEX.match(tx_id):
                self.send_response(400)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(b"TX ID invalido")
                return

            ensure_cache_dir()
            cache_file = CACHE_DIR / tx_id

            # Cache HIT
            if cache_file.is_file():
                try:
                    data = cache_file.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("X-Vox-Cache", "HIT")
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except Exception:
                    pass

            # Cache MISS -> busca nos gateways upstream
            fetched_data = None
            for gw in UPSTREAM_GATEWAYS:
                url = f"{gw}/{tx_id}"
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "VoxRelay/0.2"})
                    with urllib.request.urlopen(req, timeout=8) as resp:
                        if resp.status == 200:
                            fetched_data = resp.read()
                            break
                except Exception:
                    continue

            if fetched_data is not None:
                # Salva no cache local em disco
                try:
                    cache_file.write_bytes(fetched_data)
                except Exception:
                    pass

                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("X-Vox-Cache", "MISS")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(fetched_data)
                return

            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(b"Transacao nao encontrada nos gateways upstream")
            return

        # 3. Espelho de comunidade: /vox/index/<communityId>.json
        if path.startswith("/vox/index/") and path.endswith(".json"):
            comm_slug = path[len("/vox/index/"):-5]
            ensure_cache_dir()
            index_file = CACHE_DIR / f"index_{comm_slug}.json"
            if index_file.is_file():
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("X-Vox-Cache", "HIT")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(index_file.read_bytes())
                return
            else:
                self.send_response(404)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Espelho de comunidade nao encontrado"}).encode("utf-8"))
                return

        # 4. Inbox efêmero de mensagens diretas (Fase 4): /inbox/<toAddress>
        if path.startswith("/inbox/"):
            to_addr = path[len("/inbox/"):].split("/")[0]
            envelopes = inbox.get_envelopes(to_addr)
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"envelopes": envelopes}).encode("utf-8"))
            return

        # 5. Rota desconhecida
        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(b"Rota nao encontrada no Vox Relay")

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        
        # Salva espelho local de comunidade
        if path == "/vox/mirror":
            content_length = int(self.headers.get("Content-Length", 0))
            try:
                body = self.rfile.read(content_length)
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

            ok, payload, err, status = mirror_validate.validate_mirror_body(body)
            if not ok:
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(err).encode("utf-8"))
                return

            comm_id = str(payload.get("communityId", "")).strip()
            try:
                ensure_cache_dir()
                max_b = max_cache_bytes()
                if max_b is not None and cache_dir_bytes() + len(body) > max_b:
                    self.send_response(507)
                    self._set_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "quota de cache excedida"}).encode("utf-8"))
                    return
                index_file = CACHE_DIR / f"index_{comm_id}.json"
                index_file.write_bytes(body)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "mirrored", "communityId": comm_id}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        # Inbox efêmero: POST /inbox/<toAddress>
        if path.startswith("/inbox/"):
            to_addr = path[len("/inbox/"):].split("/")[0]
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > inbox.MAX_ENVELOPE_SIZE:
                self.send_response(413)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(b"Envelope excede limite maximo de 32 KB")
                return
            body = self.rfile.read(content_length)
            try:
                envelope = json.loads(body.decode("utf-8"))
                res = inbox.store_envelope(to_addr, envelope)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode("utf-8"))
                return
            except Exception as e:
                self.send_response(400)
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()

    def do_DELETE(self):
        path = self.path.split("?")[0].rstrip("/")
        if path.startswith("/inbox/"):
            parts = path[len("/inbox/"):].split("/")
            to_addr = parts[0] if len(parts) > 0 else ""
            msg_id = parts[1] if len(parts) > 1 else ""
            if inbox.delete_envelope(to_addr, msg_id):
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"status": "deleted", "id": msg_id}).encode("utf-8"))
                return
            self.send_response(404)
            self._set_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Envelope nao encontrado"}).encode("utf-8"))
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()

def run_server(host=DEFAULT_HOST, port=DEFAULT_PORT):
    ensure_cache_dir()
    server_address = (host, port)
    httpd = HTTPServer(server_address, VoxRelayHandler)
    print(f"======================================================")
    print(f"  Vox Relay Desktop — Nó Local de Espelho & Cache")
    print(f"  Escutando em: http://{host}:{port}")
    print(f"  Verificação de status: http://{host}:{port}/health")
    print(f"  Diretório de cache: {CACHE_DIR}")
    print(f"  Pressione Ctrl+C para encerrar.")
    print(f"======================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando Vox Relay Desktop...")
        httpd.server_close()

if __name__ == "__main__":
    default_port = resolve_listen_port()
    parser = argparse.ArgumentParser(description="Vox Relay Desktop Server")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host/IP para escutar (padrão 127.0.0.1)")
    parser.add_argument("--port", type=int, default=default_port, help=f"Porta para escutar (padrão {default_port})")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
