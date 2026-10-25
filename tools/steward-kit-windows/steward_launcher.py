"""Vox Steward Kit launcher — Windows-friendly entry (P1)."""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RELAY = ROOT / "relay" / "server.py"
CLIENT = ROOT / "client"
RELAY_PORT = int(os.environ.get("VOX_RELAY_PORT", "8787"))
CLIENT_PORT = int(os.environ.get("VOX_CLIENT_PORT", "8080"))


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _ensure_relay() -> subprocess.Popen | None:
    if not RELAY.is_file():
        print("relay/server.py not found", file=sys.stderr)
        return None
    if _port_open(RELAY_PORT):
        print(f"Relay already on :{RELAY_PORT}")
        return None
    env = os.environ.copy()
    env.setdefault("VOX_RELAY_BIND", "127.0.0.1")
    return subprocess.Popen(
        [sys.executable, str(RELAY)],
        cwd=str(RELAY.parent),
        env=env,
        creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )


def _ensure_client_server() -> subprocess.Popen | None:
    if _port_open(CLIENT_PORT):
        return None
    return subprocess.Popen(
        [sys.executable, "-m", "http.server", str(CLIENT_PORT)],
        cwd=str(CLIENT),
        creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
    )


def main() -> int:
    relay_proc = _ensure_relay()
    client_proc = _ensure_client_server()
    for _ in range(30):
        if _port_open(CLIENT_PORT):
            break
        time.sleep(0.2)
    url = f"http://127.0.0.1:{CLIENT_PORT}/#/settings/network/steward"
    print(f"Opening {url}")
    webbrowser.open(url)
    print(f"Relay HTTP: http://127.0.0.1:{RELAY_PORT}")
    print("Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    for proc in (relay_proc, client_proc):
        if proc and proc.poll() is None:
            proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
