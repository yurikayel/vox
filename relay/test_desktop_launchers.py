"""Unit tests for Windows desktop launchers (VoxSeeder and VoxStewardKit)."""
from __future__ import annotations

import importlib.util
import sys
import unittest
import urllib.request
from pathlib import Path

VOX_ROOT = Path(__file__).resolve().parents[1]


def _import_from_path(module_name: str, file_path: Path):
    spec = importlib.util.spec_from_file_location(module_name, str(file_path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


seeder_mod = _import_from_path(
    "vox_desktop_app",
    VOX_ROOT / "tools" / "desktop-seeder-windows" / "vox_desktop_app.py",
)
steward_mod = _import_from_path(
    "steward_launcher",
    VOX_ROOT / "tools" / "steward-kit-windows" / "steward_launcher.py",
)

DesktopBridge = seeder_mod.DesktopBridge
LocalClientServer = seeder_mod.LocalClientServer
resolve_startup_url = seeder_mod.resolve_startup_url
ThreadedServers = steward_mod.ThreadedServers


class TestDesktopLaunchers(unittest.TestCase):
    def test_desktop_bridge_status(self) -> None:
        bridge = DesktopBridge(local_port=8085, remote_active=True)
        status = bridge.get_status()
        self.assertTrue(status["is_desktop"])
        self.assertEqual(status["platform"], "windows")
        self.assertTrue(status["seed_active"])
        self.assertEqual(bridge.ping(), "pong")

    def test_local_client_server_lifecycle(self) -> None:
        server = LocalClientServer(VOX_ROOT, port=19085)
        port = server.start()
        self.assertGreater(port, 0)
        try:
            url = f"http://127.0.0.1:{port}/index.html"
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read()
                self.assertIn(b"vox", body.lower())
        finally:
            server.stop()

    def test_resolve_startup_url_fallback(self) -> None:
        url, is_remote = resolve_startup_url(
            prefer_local=True,
            remote_url="https://vox-9df.pages.dev/",
            local_port=8080,
        )
        self.assertEqual(url, "http://127.0.0.1:8080/")
        self.assertFalse(is_remote)

    def test_threaded_servers_steward_lifecycle(self) -> None:
        servers = ThreadedServers(VOX_ROOT, relay_port=19787, client_port=19080)
        self.assertTrue(servers.start_relay())
        self.assertTrue(servers.start_client())
        try:
            health_url = "http://127.0.0.1:19787/health"
            with urllib.request.urlopen(health_url, timeout=2.0) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read()
                self.assertIn(b"status", body)
        finally:
            servers.stop_all()


if __name__ == "__main__":
    unittest.main()
