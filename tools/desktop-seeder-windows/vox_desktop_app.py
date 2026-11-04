"""Vox Populi Desktop — Aplicativo Nativo Windows (WebView2).

Aplicativo desktop WebView2 para usar o Vox em uma janela independente, com
servidor HTTP local de fallback. Relay comunitário e seeding WebTorrent não são
implementados por este launcher.
"""
from __future__ import annotations

import argparse
import http.server
import json
import os
import socket
import socketserver
import subprocess
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

APP_TITLE = "Vox • Rede Cívica de Participação Popular"
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


def check_node_active(host: str = "127.0.0.1") -> bool:
    """Verifica se o no dedicado Vox Populi (relay HTTP ou controle) esta ativo."""
    return check_port_open(3921, host=host) or check_port_open(3922, host=host)


def boost_dedicated_node(data_dir: Optional[Path] = None) -> bool:
    """Envia sinal de boost/retomada ao no dedicado Vox Populi para sessao ativa."""
    if not check_port_open(3922):
        return False
    try:
        local_app = Path(os.environ.get("LOCALAPPDATA", "")) / "VoxPopuli" / "NodeZero"
        token_path = (data_dir or local_app) / "control.token"
        token = token_path.read_text(encoding="utf-8").strip() if token_path.exists() else ""
        headers = {"X-Vox-Node-Token": token} if token else {}
        req = urllib.request.Request("http://127.0.0.1:3922/api/resume", data=b"", headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            return resp.status == 200
    except Exception:
        return False


def start_node_background(root: Path) -> bool:
    """Inicia o no dedicado Vox Populi em segundo plano se ainda nao estiver ativo."""
    if check_node_active():
        boost_dedicated_node()
        return True

    frozen = getattr(sys, "frozen", False)
    base_exe_dir = Path(sys.executable).parent if frozen else root / "dist"
    for candidate in ("VoxPopuli.exe", "VoxFarol.exe"):
        exe_path = base_exe_dir / candidate
        if exe_path.exists():
            try:
                flags = 0x08000000 | 0x00000200
                subprocess.Popen([str(exe_path), "--node-service"], creationflags=flags)
                return True
            except OSError:
                continue

    node_py = root / "tools" / "node-zero-windows" / "node_zero.py"
    if node_py.exists():
        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            subprocess.Popen([sys.executable, str(node_py), "start"], creationflags=flags)
            return True
        except OSError:
            pass
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
            "seed_active": False,
            "node_active": check_node_active(),
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


class DesktopNodeTray:
    """Controlador de bandeja do sistema com notificacao de no Farol ativo."""

    def __init__(self, root: Path, window: Optional[Any] = None) -> None:
        self.root = root
        self.window = window
        self.notify_icon = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.node_active = False
        self._node_menu_item = None

    def start(self) -> None:
        """Inicia a presenca na bandeja do sistema em thread separada."""
        if os.name != "nt":
            return
        self._thread = threading.Thread(target=self._run_tray_thread, daemon=True)
        self._thread.start()

    def _run_tray_thread(self) -> None:
        try:
            start_node_background(self.root)
            time.sleep(0.5)
            self._init_notify_icon()
        except Exception:
            pass

    def _resolve_icon(self) -> Any:
        try:
            from System.Drawing import Icon, SystemIcons
            ico_file = self.root / "tools" / "desktop-seeder-windows" / "vox.ico"
            if not ico_file.exists():
                bundle = getattr(sys, "_MEIPASS", None)
                if bundle:
                    ico_file = Path(bundle) / "vox.ico"
            if ico_file.exists():
                return Icon(str(ico_file))
            return SystemIcons.Application
        except Exception:
            return None

    def _init_notify_icon(self) -> None:
        try:
            import clr
            clr.AddReference("System.Windows.Forms")
            clr.AddReference("System.Drawing")
            from System.Windows.Forms import Application, NotifyIcon, ToolTipIcon
        except Exception:
            return

        ni = NotifyIcon()
        icon = self._resolve_icon()
        if icon:
            ni.Icon = icon

        self.node_active = check_node_active()
        status_txt = "Ativo (127.0.0.1:3921)" if self.node_active else "Iniciando..."
        ni.Text = f"Vox • Nó Dedicado {status_txt}"[:63]
        ni.ContextMenuStrip = self._build_context_menu()
        ni.DoubleClick += self._on_restore
        ni.Visible = True
        self.notify_icon = ni

        balloon_title = "Vox — Nó Dedicado Vox Populi Conectado"
        balloon_msg = (
            "O nó dedicado Vox Populi está ativo em segundo plano "
            "(relay HTTP e cache local em 127.0.0.1:3921)."
        )
        ni.ShowBalloonTip(3000, balloon_title, balloon_msg, ToolTipIcon.Info)

        while not self._stop_event.is_set():
            Application.DoEvents()
            self._update_node_status()
            time.sleep(1.0)

    def _build_context_menu(self) -> Any:
        from System.Windows.Forms import ContextMenuStrip, ToolStripMenuItem, ToolStripSeparator
        cms = ContextMenuStrip()

        header = ToolStripMenuItem("Vox (Cliente)")
        header.Enabled = False
        cms.Items.Add(header)
        cms.Items.Add(ToolStripSeparator())

        node_lbl = "Nó Dedicado: Ativo (127.0.0.1:3921)" if self.node_active else "Nó Dedicado: Parado"
        self._node_menu_item = ToolStripMenuItem(node_lbl)
        self._node_menu_item.Enabled = False
        cms.Items.Add(self._node_menu_item)

        restore_item = ToolStripMenuItem("Abrir Vox", None, self._on_restore)
        cms.Items.Add(restore_item)

        pause_item = ToolStripMenuItem("Pausar / Retomar Nó Dedicado", None, self._on_toggle_node)
        cms.Items.Add(pause_item)

        cms.Items.Add(ToolStripSeparator())
        exit_item = ToolStripMenuItem("Fechar Aplicativo", None, self._on_exit)
        cms.Items.Add(exit_item)
        return cms

    def _update_node_status(self) -> None:
        active = check_node_active()
        if active == self.node_active:
            return
        self.node_active = active
        if self._node_menu_item:
            lbl = "Nó Dedicado: Ativo (127.0.0.1:3921)" if active else "Nó Dedicado: Parado"
            self._node_menu_item.Text = lbl
        if self.notify_icon:
            st = "Ativo" if active else "Parado"
            self.notify_icon.Text = f"Vox • Nó Dedicado {st}"[:63]

    def _on_restore(self, sender: Any = None, event: Any = None) -> None:
        if not self.window:
            return
        try:
            self.window.restore()
            self.window.show()
        except Exception:
            pass

    def _on_toggle_node(self, sender: Any = None, event: Any = None) -> None:
        try:
            action = "pause" if self.node_active else "resume"
            data = json.dumps({"action": action}).encode("utf-8")
            req = urllib.request.Request(
                "http://127.0.0.1:3922/api/control",
                data=data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5):
                pass
        except Exception:
            pass

    def _on_exit(self, sender: Any = None, event: Any = None) -> None:
        self.stop()
        if not self.window:
            return
        try:
            self.window.destroy()
        except Exception:
            pass

    def stop(self) -> None:
        """Encerra a presenca na bandeja do sistema."""
        self._stop_event.set()
        if not self.notify_icon:
            return
        try:
            self.notify_icon.Visible = False
            self.notify_icon.Dispose()
        except Exception:
            pass
        self.notify_icon = None


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
    print("--- [Autoteste Vox Desktop] ---")
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
    assert status["seed_active"] is False
    assert "node_active" in status
    assert bridge.ping() == "pong"
    print("[OK] Bridge JavaScript <-> Python validada com sucesso")

    tray = DesktopNodeTray(root)
    assert tray.notify_icon is None
    print("[OK] Controlador de bandeja e status do nó instanciados")

    server.stop()
    print("[OK] Servidor local encerrado com sucesso")
    print("--- [Todos os autotestes do executavel passaram!] ---")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Vox Desktop (Cliente)")
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
    print("  Vox Desktop (Cliente) — Windows")
    print(f"  URL Ativa:     {target_url}")
    print(f"  Modo:          {'Remoto (Cloudflare)' if is_remote else 'Espelho Local'}")
    if local_port:
        print(f"  Backup Local:  http://127.0.0.1:{local_port}")
    print("  Nó Dedicado:   Vox Populi conectado em 127.0.0.1:3921")
    print("  Seeder:        Não implementado")
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
    tray = DesktopNodeTray(root, window=window)
    tray.start()
    try:
        webview.start(debug=False)
    finally:
        tray.stop()
        server.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
