"""Regression tests for the Windows Node Zero loopback-only contract."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from node_zero import (  # noqa: E402
    CONTROL_HOST,
    RELAY_HOST,
    load_node_config,
)


class NetworkContractTests(unittest.TestCase):
    def test_effective_relay_and_control_sockets_bind_to_loopback(self) -> None:
        relay = ThreadingHTTPServer((RELAY_HOST, 0), BaseHTTPRequestHandler)
        control = HTTPServer((CONTROL_HOST, 0), BaseHTTPRequestHandler)
        try:
            self.assertEqual(relay.socket.getsockname()[0], "127.0.0.1")
            self.assertEqual(control.socket.getsockname()[0], "127.0.0.1")
        finally:
            relay.server_close()
            control.server_close()

    def test_missing_invalid_and_legacy_settings_cannot_change_bind(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            settings_path = Path(temporary) / "settings.json"
            cases = (
                None,
                "{invalid json",
                json.dumps({"listenHost": "0.0.0.0", "enableLanDiscovery": True}),
            )
            for contents in cases:
                with self.subTest(contents=contents):
                    if contents is None:
                        settings_path.unlink(missing_ok=True)
                    else:
                        settings_path.write_text(contents, encoding="utf-8")
                    load_node_config(settings_path)
                    self.assertEqual(RELAY_HOST, "127.0.0.1")
                    self.assertEqual(CONTROL_HOST, "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
