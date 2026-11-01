#!/usr/bin/env python3
"""
Vox Relay Desktop — Servidor proxy de cache e espelho local para o ecossistema Vox.
Roda em localhost (padrão 127.0.0.1:3920) e acelera consultas para clientes locais (PWA).
Dependências: Nenhuma (usa apenas a biblioteca padrão do Python 3).
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import tempfile
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


def resolve_cache_dir(env=None):
    raw = str((env if env is not None else os.environ).get("VOX_RELAY_CACHE_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    return Path(__file__).resolve().parent / ".cache"


CACHE_DIR = resolve_cache_dir()


def set_cache_dir(path):
    global CACHE_DIR
    CACHE_DIR = Path(path).resolve()
    return CACHE_DIR

UPSTREAM_GATEWAYS = [
    "https://arweave.net",
    "https://turbo-gateway.com/raw",
]

TX_ID_REGEX = re.compile(r"^[A-Za-z0-9_-]{43}$")
CACHE_HASH_SUFFIX = ".sha256"
INTEGRITY_FAILURES = 0

def ensure_cache_dir():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

def count_cached_items():
    if not CACHE_DIR.exists():
        return 0
    return len([
        f for f in CACHE_DIR.glob("*")
        if f.is_file()
        and not f.name.startswith(("index_", ".vox-"))
        and not f.name.endswith(CACHE_HASH_SUFFIX)
    ])


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


def cache_hash_path(cache_file):
    return cache_file.with_name(cache_file.name + CACHE_HASH_SUFFIX)


def atomic_write(path, content):
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=CACHE_DIR, prefix=".vox-", suffix=".tmp", delete=False) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def write_cache_entry(cache_file, data):
    digest = hashlib.sha256(data).hexdigest().encode("ascii")
    atomic_write(cache_file, data)
    atomic_write(cache_hash_path(cache_file), digest)


def remove_cache_entry(cache_file):
    for path in (cache_file, cache_hash_path(cache_file)):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def read_verified_cache_entry(cache_file):
    global INTEGRITY_FAILURES
    try:
        data = cache_file.read_bytes()
        expected = cache_hash_path(cache_file).read_text(encoding="ascii").strip()
        actual = hashlib.sha256(data).hexdigest()
        if len(expected) != 64 or not hmac.compare_digest(expected, actual):
            INTEGRITY_FAILURES += 1
            remove_cache_entry(cache_file)
            return None
        os.utime(cache_file, None)
        return data
    except (OSError, UnicodeError):
        INTEGRITY_FAILURES += 1
        remove_cache_entry(cache_file)
        return None
def evict_cache_if_needed(incoming_bytes=0):
    max_b = max_cache_bytes()
    if max_b is None or not CACHE_DIR.exists():
        return
    current_bytes = cache_dir_bytes()
    if current_bytes + incoming_bytes <= max_b:
        return
    _evict_cache_entries(_cache_candidates(), current_bytes, incoming_bytes, max_b)

def _cache_candidates():
    files = []
    for f in CACHE_DIR.glob("*"):
        if not f.is_file():
            continue
        try:
            if f.name.endswith(CACHE_HASH_SUFFIX):
                data_file = f.with_name(f.name[:-len(CACHE_HASH_SUFFIX)])
                if data_file.is_file():
                    continue
                files.append((f.stat().st_mtime, f.stat().st_size, f, None))
                continue
            hash_file = cache_hash_path(f)
            hash_size = hash_file.stat().st_size if hash_file.is_file() else 0
            files.append((f.stat().st_mtime, f.stat().st_size + hash_size, f, hash_file if hash_size else None))
        except OSError:
            pass
    files.sort(key=lambda x: x[0])
    return files

def _evict_cache_entries(files, current_bytes, incoming_bytes, max_bytes):
    for _, size, f, hash_file in files:
        if current_bytes + incoming_bytes <= max_bytes:
            break
        try:
            f.unlink()
            if hash_file:
                hash_file.unlink(missing_ok=True)
            current_bytes -= size
        except OSError:
            pass

class VoxRelayHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def _get_content_length(self):
        try:
            cl = int(self.headers.get("Content-Length", 0))
            return max(0, cl)
        except (ValueError, TypeError):
            return 0

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/health", ""):
            self._handle_health()
        elif path.startswith("/tx/"):
            self._handle_transaction(path[4:])
        elif path.startswith("/vox/index/") and path.endswith(".json"):
            self._handle_index(path[len("/vox/index/"):-5])
        elif path.startswith("/inbox/"):
            self._handle_inbox_get(path[len("/inbox/"):].split("/")[0])
        else:
            self._reply_not_found(b"Rota nao encontrada no Vox Relay")

    def _handle_health(self):
        self._send_json(self._health_payload())

    def _health_payload(self):
        indexes = list_community_indexes()
        return {
            "status": "ok",
            "app": "vox-relay",
            "version": "0.2.1",
            "cachedCount": count_cached_items(),
            "communityIndexes": indexes,
            "communityIndexCount": len(indexes),
            "cacheBytes": cache_dir_bytes(),
            "maxCacheBytes": max_cache_bytes(),
            "cacheDir": str(CACHE_DIR),
            "cacheIntegrity": {
                "algorithm": "sha256",
                "verifiedReads": True,
                "failures": INTEGRITY_FAILURES,
            },
        }

    def _handle_transaction(self, tx_id):
        if not TX_ID_REGEX.match(tx_id):
            self._reply_not_found(b"TX ID invalido", 400)
            return

        ensure_cache_dir()
        cache_file = CACHE_DIR / tx_id
        data = read_verified_cache_entry(cache_file) if cache_file.is_file() else None
        if data is not None:
            self._reply_transaction(data, "HIT")
            return

        data = self._fetch_transaction(tx_id)
        if data is None:
            self._reply_not_found(b"Transacao nao encontrada nos gateways upstream")
            return
        self._cache_transaction(cache_file, data)
        self._reply_transaction(data, "MISS")

    def _fetch_transaction(self, tx_id):
        for gateway in UPSTREAM_GATEWAYS:
            try:
                request = urllib.request.Request(
                    f"{gateway}/{tx_id}", headers={"User-Agent": "VoxRelay/0.2"}
                )
                with urllib.request.urlopen(request, timeout=8) as response:
                    if response.status == 200:
                        return response.read()
            except Exception:
                continue
        return None

    def _cache_transaction(self, cache_file, data):
        try:
            ensure_cache_dir()
            hash_bytes = len(hashlib.sha256(data).hexdigest())
            incoming_bytes = len(data) + hash_bytes
            evict_cache_if_needed(incoming_bytes)
            limit = max_cache_bytes()
            if limit is None or cache_dir_bytes() + incoming_bytes <= limit:
                write_cache_entry(cache_file, data)
        except Exception:
            pass

    def _reply_transaction(self, data, cache_state):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Vox-Cache", cache_state)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def _handle_index(self, comm_slug):
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
        self._send_json({"error": "Espelho de comunidade nao encontrado"}, 404)

    def _handle_inbox_get(self, to_addr):
        self._send_json({"envelopes": inbox.get_envelopes(to_addr)})

    def _send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _reply_not_found(self, message=b"Rota nao encontrada no Vox Relay", status=404):
        self.send_response(status)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(message)

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        if path == "/vox/mirror":
            self._handle_mirror_post()
        elif path.startswith("/inbox/"):
            self._handle_inbox_post(path[len("/inbox/"):].split("/")[0])
        else:
            self._reply_not_found(b"")

    def _handle_mirror_post(self):
        try:
            body = self.rfile.read(self._get_content_length())
        except Exception as error:
            self._send_json({"error": str(error)}, 500)
            return
        ok, payload, error, status = mirror_validate.validate_mirror_body(body)
        if not ok:
            self._send_json(error, status)
            return
        self._store_mirror(body, str(payload.get("communityId", "")).strip())

    def _store_mirror(self, body, comm_id):
        try:
            ensure_cache_dir()
            evict_cache_if_needed(len(body))
            limit = max_cache_bytes()
            if limit is not None and cache_dir_bytes() + len(body) > limit:
                self._send_json({"error": "quota de cache excedida"}, 507)
                return
            (CACHE_DIR / f"index_{comm_id}.json").write_bytes(body)
            self._send_json({"status": "mirrored", "communityId": comm_id})
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_inbox_post(self, to_addr):
        content_length = self._get_content_length()
        if content_length > inbox.MAX_ENVELOPE_SIZE:
            self._reply_not_found(b"Envelope excede limite maximo de 32 KB", 413)
            return
        try:
            body = self.rfile.read(content_length)
            envelope = json.loads(body.decode("utf-8"))
            self._send_json(inbox.store_envelope(to_addr, envelope))
        except Exception as error:
            self._send_json({"error": str(error)}, 400)
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
    parser.add_argument("--bind", dest="host", help="Alias retrocompatível para --host")
    parser.add_argument("--port", type=int, default=default_port, help=f"Porta para escutar (padrão {default_port})")
    parser.add_argument("--cache-dir", default=None, help="Diretório de cache (sobrescreve VOX_RELAY_CACHE_DIR)")
    args = parser.parse_args()
    if args.cache_dir:
        os.environ["VOX_RELAY_CACHE_DIR"] = str(args.cache_dir)
        set_cache_dir(args.cache_dir)
    run_server(host=args.host, port=args.port)

