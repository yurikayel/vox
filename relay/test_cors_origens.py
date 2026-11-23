"""CORS completo por origem (THREAT-MODEL T32): estranha não lê, app lê."""

import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest.mock import patch

from relay import rate_limit, request_guard, server

OFFICIAL = ("https://yurikayel.github.io", "https://vox-9df.pages.dev")
LOCAL = ("http://localhost:5173", "http://127.0.0.1:8080", "http://localhost")
STRANGE = (
    "https://evil.example",
    "null",
    "http://localhost.evil.example",
    "http://127.0.0.1.evil.example",
    "https://yurikayel.github.io.evil.example",
    "https://evil.example/yurikayel.github.io",
)
PREFLIGHT = {
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Private-Network": "true",
}


class TestCorsUnit(unittest.TestCase):
    def test_reflects_only_listed_origins(self):
        for origin in OFFICIAL + LOCAL:
            self.assertEqual(request_guard.cors_allow_origin(origin, {}), origin)
        for origin in STRANGE + ("", None):
            self.assertIsNone(request_guard.cors_allow_origin(origin, {}))

    def test_env_list_adds_exact_origins(self):
        with patch.dict(
            os.environ,
            {"VOX_RELAY_ALLOWED_ORIGINS": "https://espelho.example, https://outro.example/"},
        ):
            self.assertEqual(
                request_guard.cors_allow_origin("https://espelho.example"),
                "https://espelho.example",
            )
            self.assertEqual(
                request_guard.cors_allow_origin("https://outro.example"), "https://outro.example"
            )
            self.assertIsNone(request_guard.cors_allow_origin("https://evil.example"))


class TestCorsNeverEchoesTheRequest(unittest.TestCase):
    """CodeQL py/http-response-splitting: o cabeçalho sai de constante, nunca do texto do pedido."""

    def test_control_characters_are_refused_before_comparing(self):
        official = OFFICIAL[0]
        hostile = (
            official + "\r\n",
            official + "\r\nX-Evil: 1",
            official + "\nSet-Cookie: a=b",
            official + "\x00",
            official + "\t",
            " " + official,
            "http://localhost:80\r\n",
            "http://localhost:80\r\nX-Evil: 1",
        )
        for origin in hostile:
            self.assertIsNone(request_guard.cors_allow_origin(origin, {}), repr(origin))

    def test_returns_the_configured_entry_not_the_received_text(self):
        self.assertEqual(
            request_guard.cors_allow_origin("HTTPS://YuriKayel.GitHub.io/", {}), OFFICIAL[0]
        )
        env = {"VOX_RELAY_ALLOWED_ORIGINS": "https://espelho.example"}
        self.assertEqual(
            request_guard.cors_allow_origin("HTTPS://ESPELHO.example", env),
            "https://espelho.example",
        )
        self.assertEqual(
            request_guard.cors_allow_origin("HTTP://LOCALHOST:5173", {}), "http://localhost:5173"
        )

    def test_loopback_with_path_user_or_bad_port_is_refused(self):
        for origin in (
            "http://localhost/x",
            "http://localhost@evil.example",
            "http://localhost:abc",
            "http://localhost:99999",
            "ftp://localhost",
        ):
            self.assertIsNone(request_guard.cors_allow_origin(origin, {}), origin)


class TestCorsOverHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.limiter = patch.object(
            rate_limit,
            "LIMITER",
            rate_limit.RateLimiter(
                {name: rate_limit.Policy(1000, 1000) for name in rate_limit.DEFAULT_POLICIES}
            ),
        )
        cls.limiter.start()
        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.limiter.stop()

    def call(self, method, path="/health", origin=None, extra=None, body=None):
        headers = dict(extra or {})
        if origin is not None:
            headers["Origin"] = origin
        data = json.dumps(body).encode("utf-8") if body is not None else None
        if data is not None:
            headers["Content-Type"] = "application/json"
        url = f"http://127.0.0.1:{self.httpd.server_address[1]}{path}"
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, data=data, headers=headers, method=method), timeout=3
            ) as resp:
                return resp.status, resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.headers

    def test_stranger_origin_gets_neither_wildcard_nor_reflection(self):
        for origin in STRANGE:
            status, headers = self.call("GET", origin=origin)
            self.assertEqual(status, 200, origin)
            self.assertIsNone(headers.get("Access-Control-Allow-Origin"), origin)
            self.assertIsNone(headers.get("Access-Control-Allow-Private-Network"), origin)
            self.assertEqual(headers.get("Vary"), "Origin")

    def test_official_and_local_origins_are_reflected(self):
        for origin in OFFICIAL + LOCAL:
            status, headers = self.call("GET", origin=origin)
            self.assertEqual(status, 200, origin)
            self.assertEqual(headers.get("Access-Control-Allow-Origin"), origin)
            self.assertEqual(headers.get("Vary"), "Origin")

    def test_header_is_the_configured_origin_even_if_the_request_differs_in_case(self):
        _, headers = self.call("GET", origin="HTTPS://YURIKAYEL.GITHUB.IO")
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), OFFICIAL[0])

    def test_request_without_origin_gets_no_allow_origin(self):
        status, headers = self.call("GET")
        self.assertEqual(status, 200)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))
        self.assertEqual(headers.get("Vary"), "Origin")

    def test_preflight_from_official_origin_is_complete(self):
        status, headers = self.call("OPTIONS", origin=OFFICIAL[0], extra=PREFLIGHT)
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), OFFICIAL[0])
        self.assertEqual(headers.get("Access-Control-Allow-Private-Network"), "true")
        self.assertIn("POST", headers.get("Access-Control-Allow-Methods"))
        self.assertIn("Content-Type", headers.get("Access-Control-Allow-Headers"))
        self.assertEqual(headers.get("Vary"), "Origin")

    def test_preflight_from_stranger_gets_no_grant(self):
        status, headers = self.call("OPTIONS", origin="https://evil.example", extra=PREFLIGHT)
        self.assertEqual(status, 204)
        for name in (
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Private-Network",
            "Access-Control-Allow-Methods",
            "Access-Control-Allow-Headers",
        ):
            self.assertIsNone(headers.get(name), name)

    def test_refused_write_from_stranger_is_not_readable_either(self):
        status, headers = self.call("POST", "/inbox/bob", origin="https://evil.example", body={})
        self.assertEqual(status, 403)
        self.assertIsNone(headers.get("Access-Control-Allow-Origin"))

    def test_env_origin_is_reflected_by_the_server(self):
        with patch.dict(os.environ, {"VOX_RELAY_ALLOWED_ORIGINS": "https://espelho.example"}):
            _, mirror = self.call("GET", origin="https://espelho.example")
            _, stranger = self.call("GET", origin="https://evil.example")
        self.assertEqual(mirror.get("Access-Control-Allow-Origin"), "https://espelho.example")
        self.assertIsNone(stranger.get("Access-Control-Allow-Origin"))


if __name__ == "__main__":
    unittest.main()
