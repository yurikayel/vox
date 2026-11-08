"""Vox Steward Kit launcher — Windows standalone relay and wizard entry."""
from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any, Optional

DEFAULT_RELAY_PORT = int(os.environ.get("VOX_RELAY_PORT", "8787"))
DEFAULT_CLIENT_PORT = int(os.environ.get("VOX_CLIENT_PORT", "8080"))


def get_base_dir() -> Path:
    """Retorna o diretorio raiz do Vox (suporta sys._MEIPASS quando empacotado)."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base)
    return Path(__file__).resolve().parents[2]


def is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    """Testa se uma porta TCP esta aberta e respondendo."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


class QuietClientHandler(SimpleHTTPRequestHandler):
    """Handler silencioso para servir o cliente estatico."""

    def log_message(self, format: str, *args: Any) -> None:
        pass


class ThreadedServers:
    """Gerencia servidores de Relay e Cliente em threads dedicadas."""

    def __init__(self, root: Path, relay_port: int, client_port: int) -> None:
        self.root = root
        self.relay_port = relay_port
        self.client_port = client_port
        self.relay_httpd: Optional[HTTPServer] = None
        self.client_httpd: Optional[HTTPServer] = None
        self._threads: list[threading.Thread] = []

    def start_relay(self) -> bool:
        """Inicia servidor de relay Vox na porta configurada."""
        if is_port_open(self.relay_port):
            print(f"Relay ja esta ativo na porta :{self.relay_port}")
            return True

        sys_path_added = False
        if str(self.root) not in sys.path:
            sys.path.insert(0, str(self.root))
            sys_path_added = True

        try:
            from relay.server import VoxRelayHandler
            self.relay_httpd = HTTPServer(("127.0.0.1", self.relay_port), VoxRelayHandler)
            t = threading.Thread(target=self.relay_httpd.serve_forever, daemon=True)
            t.start()
            self._threads.append(t)
            return True
        except Exception as err:
            print(f"[ERRO] Nao foi possivel iniciar relay: {err}", file=sys.stderr)
            return False
        finally:
            if sys_path_added and str(self.root) in sys.path:
                pass

    def start_client(self) -> bool:
        """Inicia servidor do cliente web estatico na porta configurada."""
        if is_port_open(self.client_port):
            print(f"Cliente ja esta ativo na porta :{self.client_port}")
            return True

        client_dir = self.root / "client"
        if not client_dir.is_dir():
            print(f"[AVISO] Diretorio client/ nao encontrado em {client_dir}")
            return False

        try:
            handler = lambda *a, **k: QuietClientHandler(*a, directory=str(client_dir), **k)
            self.client_httpd = HTTPServer(("127.0.0.1", self.client_port), handler)
            t = threading.Thread(target=self.client_httpd.serve_forever, daemon=True)
            t.start()
            self._threads.append(t)
            return True
        except Exception as err:
            print(f"[ERRO] Nao foi possivel iniciar cliente web: {err}", file=sys.stderr)
            return False

    def stop_all(self) -> None:
        """Encerra ambos os servidores de forma limpa."""
        if self.relay_httpd:
            self.relay_httpd.shutdown()
            self.relay_httpd.server_close()
            self.relay_httpd = None
        if self.client_httpd:
            self.client_httpd.shutdown()
            self.client_httpd.server_close()
            self.client_httpd = None


def run_self_check(root: Path) -> int:
    """Executa verificacao rapida dos servicos sem abrir navegador."""
    print("--- [Autoteste Vox Steward Kit] ---")
    servers = ThreadedServers(root, relay_port=18787, client_port=18080)
    if not servers.start_relay():
        return 1
    if not servers.start_client():
        servers.stop_all()
        return 1

    time.sleep(0.5)
    health_url = "http://127.0.0.1:18787/health"
    try:
        with urllib.request.urlopen(health_url, timeout=2.0) as resp:
            data = resp.read()
            assert resp.status == 200
            assert b"status" in data
            print(f"[OK] Relay healthcheck 200: {data.decode()[:60]}...")
    except Exception as err:
        print(f"[ERRO] Healthcheck falhou: {err}")
        servers.stop_all()
        return 1

    client_url = "http://127.0.0.1:18080/index.html"
    try:
        with urllib.request.urlopen(client_url, timeout=2.0) as resp:
            assert resp.status == 200
            print("[OK] Cliente estatico servido com sucesso")
    except Exception as err:
        print(f"[ERRO] Cliente estatico falhou: {err}")
        servers.stop_all()
        return 1

    servers.stop_all()
    print("--- [Todos os autotestes do Steward Kit passaram!] ---")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Vox Steward Kit")
    parser.add_argument("--check", action="store_true", help="Executa autoteste e encerra")
    parser.add_argument("--relay-port", type=int, default=DEFAULT_RELAY_PORT, help="Porta do relay")
    parser.add_argument("--client-port", type=int, default=DEFAULT_CLIENT_PORT, help="Porta do cliente")
    parser.add_argument("--no-browser", action="store_true", help="Nao abre o navegador automaticamente")
    args = parser.parse_args()

    root = get_base_dir()
    if args.check:
        return run_self_check(root)

    servers = ThreadedServers(root, args.relay_port, args.client_port)
    if not servers.start_relay():
        return 1
    servers.start_client()

    wizard_url = f"http://127.0.0.1:{args.client_port}/#/settings/network/steward"
    print("======================================================")
    print("  Vox Steward Kit — No Local & Cliente Ativos")
    print(f"  PWA Client:  http://127.0.0.1:{args.client_port}")
    print(f"  Relay HTTP:  http://127.0.0.1:{args.relay_port}")
    print(f"  Healthcheck: http://127.0.0.1:{args.relay_port}/health")
    print(f"  Wizard:      {wizard_url}")
    print("======================================================")

    if not args.no_browser:
        print(f"Abrindo assistente em {wizard_url}...")
        webbrowser.open(wizard_url)

    print("Pressione Ctrl+C para encerrar.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nEncerrando servidores...")
    finally:
        servers.stop_all()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
