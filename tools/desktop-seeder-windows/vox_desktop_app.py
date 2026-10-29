"""Vox Desktop & P2P Seeder — Aplicativo Nativo Windows (WebView2).

Equivalente desktop ao aplicativo Android (vox-seeder.apk), permitindo que qualquer
pessoa utilize a rede social civica em janela nativa independente e atue como no
semeador ativo na malha WebRTC P2P (swarm), com fallback offline automatico.
"""
from __future__ import annotations

import argparse
import http.server
import os
import socket
import socketserver
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Dict, Optional

try:
    import webview
except ImportError:
    webview = None

APP_TITLE = "Vox • Rede Social Civica & Seeder P2P"
DEFAULT_REMOTE_URL = os.environ.get("VOX_REMOTE_URL", "https://vox-9df.pages.dev/")
LOCAL_PORT_DEFAULT = int(os.environ.get("VOX_CLIENT_PORT", "8085"))


def get_base_dir() -> Path:
    """Retorna diretorio base, compativel com PyInstaller (_MEIPASS) e dev."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base)
    return Path(__file__).resolve().parents[2]


def check_port_open(port: int, host: str = "127.0.0.1") -> bool:
    """Verifica se uma porta TCP local esta em uso."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


def check_remote_available(url: str, timeout: float = 2.0) -> bool:
    """Verifica se a URL remota esta respondendo."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "VoxDesktop/1.0 (Windows; WebView2)"},
            method="HEAD",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status < 400
    except Exception:
        return False


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """Handler HTTP silencioso para evitar poluicao de logs."""

    def log_message(self, format: str, *args: Any) -> None:
        pass


class LocalClientServer:
    """Servidor HTTP estatico para fallback offline do cliente Vox."""

    def __init__(self, root_dir: Path, port: int = LOCAL_PORT_DEFAULT) -> None:
        self.root_dir = root_dir
        self.port = port
        self.httpd: Optional[socketserver.TCPServer] = None
        self.thread: Optional[threading.Thread] = None

    def start(self) -> int:
        """Inicia servidor estatico em thread daemon."""
        client_dir = self.root_dir / "client"
        if not client_dir.is_dir():
            return 0

        for candidate in range(self.port, self.port + 20):
            try:
                handler = lambda *a, **k: QuietHandler(*a, directory=str(client_dir), **k)
                self.httpd = socketserver.TCPServer(("127.0.0.1", candidate), handler)
                self.port = candidate
                break
            except OSError:
                continue

        if self.httpd:
            self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
            self.thread.start()
            return self.port
        return 0

    def stop(self) -> None:
        """Encerra o servidor local."""
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()
            self.httpd = None


class DesktopBridge:
    """API exposta para o JavaScript via pywebview."""

    def __init__(self, local_port: int, remote_active: bool) -> None:
        self.local_port = local_port
        self.remote_active = remote_active

    def get_status(self) -> Dict[str, Any]:
        """Informa metadados do ambiente desktop para a interface web."""
        return {
            "is_desktop": True,
            "platform": "windows",
            "version": "1.0.0",
            "remote_active": self.remote_active,
            "local_port": self.local_port,
            "seed_active": True,
        }

    def open_external(self, url: str) -> bool:
        """Abre links no navegador padrao do sistema."""
        if url and (url.startswith("http://") or url.startswith("https://")):
            webbrowser.open(url)
            return True
        return False

    def ping(self) -> str:
        """Ping basico para teste de comunicacao bidirecional."""
        return "pong"


def resolve_startup_url(
    prefer_local: bool,
    remote_url: str,
    local_port: int,
) -> tuple[str, bool]:
    """Determina se inicia pelo PWA na nuvem ou espelho local offline."""
    if prefer_local and local_port > 0:
        return f"http://127.0.0.1:{local_port}/", False

    is_online = check_remote_available(remote_url)
    if is_online:
        return remote_url, True
    if local_port > 0:
        return f"http://127.0.0.1:{local_port}/", False
    return remote_url, False


def run_self_check(root: Path) -> int:
    """Executa bateria de autoteste para CI e validacao sem abrir GUI."""
    print("--- [Autoteste Vox Desktop Seeder] ---")
    server = LocalClientServer(root, port=18085)
    port = server.start()
    if port == 0:
        print("[ERRO] Falha ao iniciar servidor local de fallback.")
        return 1
    print(f"[OK] Servidor local ativo na porta {port}")

    test_url = f"http://127.0.0.1:{port}/index.html"
    try:
        with urllib.request.urlopen(test_url, timeout=2.0) as resp:
            content = resp.read()
            assert resp.status == 200
            assert b"Vox" in content or b"vox" in content
            print(f"[OK] Resposta HTTP 200 recebida ({len(content)} bytes)")
    except Exception as err:
        print(f"[ERRO] Falha no teste de leitura do cliente local: {err}")
        server.stop()
        return 1

    bridge = DesktopBridge(port, remote_active=True)
    status = bridge.get_status()
    assert status["is_desktop"] is True
    assert status["seed_active"] is True
    assert bridge.ping() == "pong"
    print("[OK] Bridge JavaScript <-> Python validada com sucesso")

    server.stop()
    print("[OK] Servidor local encerrado com sucesso")
    print("--- [Todos os autotestes do executavel passaram!] ---")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Vox Desktop Seeder")
    parser.add_argument("--check", action="store_true", help="Executa autoteste e encerra")
    parser.add_argument("--local", action="store_true", help="Forca uso do cliente local")
    parser.add_argument("--port", type=int, default=LOCAL_PORT_DEFAULT, help="Porta local")
    parser.add_argument("--url", default=DEFAULT_REMOTE_URL, help="URL do PWA remoto")
    args = parser.parse_args()

    root = get_base_dir()
    if args.check:
        return run_self_check(root)

    server = LocalClientServer(root, port=args.port)
    local_port = server.start()

    target_url, is_remote = resolve_startup_url(args.local, args.url, local_port)
    bridge = DesktopBridge(local_port, is_remote)

    print("======================================================")
    print("  Vox Desktop & No Seeder — Windows")
    print(f"  URL Ativa:    {target_url}")
    print(f"  Modo:         {'Remoto (Cloudflare)' if is_remote else 'Espelho Local'}")
    if local_port:
        print(f"  Backup Local: http://127.0.0.1:{local_port}")
    print("  Malha P2P:    Ativa (WebRTC Swarm)")
    print("======================================================")

    if webview is None:
        print("Erro: 'pywebview' nao esta instalado neste ambiente. Execute: pip install pywebview")
        server.stop()
        return 1

    window = webview.create_window(
        title=APP_TITLE,
        url=target_url,
        js_api=bridge,
        width=1120,
        height=820,
        min_size=(420, 600),
        background_color="#090d12",
    )
    try:
        webview.start(debug=False)
    finally:
        server.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
