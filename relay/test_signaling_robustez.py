#!/usr/bin/env python3
"""
Robustez do servidor de sinalização (signaling.py): prazo total do handshake, prazo para o resto de um quadro e
mensagens fragmentadas (RFC 6455 §5.4) remontadas com teto. Os testes de servidor falham no código de antes.
"""

import base64
import json
import socket
import threading
import time
import unittest

import relay.signaling as signaling
from relay.signaling import MessageAssembler, ThreadedTCPServer, WebSocketHandler, read_ws_frame

MASK = b"\x11\x22\x33\x44"


def masked_frame(payload: bytes, opcode: int, fin: bool = True) -> bytes:
    """Quadro de cliente (mascarado) com comprimento curto (< 126)."""
    first = (0x80 if fin else 0x00) | opcode
    body = bytes([b ^ MASK[i % 4] for i, b in enumerate(payload)])
    return bytes([first, 0x80 | len(payload)]) + MASK + body


class TestMessageAssembler(unittest.TestCase):
    def test_texto_em_tres_fragmentos_volta_inteiro(self):
        a = MessageAssembler()
        self.assertIsNone(a.feed(False, 0x1, b'{"a"'))
        self.assertIsNone(a.feed(False, 0x0, b":"))
        self.assertEqual(a.feed(True, 0x0, b"1}"), (0x1, b'{"a":1}'))
        self.assertEqual(a.feed(True, 0x1, b"x"), (0x1, b"x"), "depois de fechar, aceita mensagem nova")

    def test_erros_de_protocolo(self):
        with self.assertRaises(ValueError):
            MessageAssembler().feed(True, 0x0, b"solta")
        a = MessageAssembler()
        a.feed(False, 0x1, b"meio")
        with self.assertRaises(ValueError):
            a.feed(True, 0x1, b"outra")

    def test_teto_vale_para_a_soma_dos_fragmentos(self):
        a = MessageAssembler(max_size=8)
        a.feed(False, 0x1, b"12345")
        with self.assertRaises(ValueError):
            a.feed(True, 0x0, b"6789")


class TestSignalingRobustez(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.saved = (signaling.HANDSHAKE_TIMEOUT, signaling.FRAME_TIMEOUT)
        signaling.HANDSHAKE_TIMEOUT = 0.5
        signaling.FRAME_TIMEOUT = 0.5
        cls.server = ThreadedTCPServer(("127.0.0.1", 0), WebSocketHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        signaling.HANDSHAKE_TIMEOUT, signaling.FRAME_TIMEOUT = cls.saved

    def setUp(self):
        with signaling.registry.lock:
            signaling.registry.peers.clear()
            signaling.registry.addresses.clear()
            signaling.registry.dm_pubs.clear()

    def _raw(self):
        s = socket.create_connection(("127.0.0.1", self.port))
        s.settimeout(3)
        return s

    def _upgrade(self, s):
        key = base64.b64encode(b"robustez-chave-1").decode("ascii")
        s.sendall(
            (
                f"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ).encode("ascii")
        )
        self.assertIn("101 Switching Protocols", s.recv(1024).decode("latin1"))

    def assert_closed_by_server(self, s):
        """O servidor fecha a conexão (recv devolve vazio) antes do prazo do cliente."""
        try:
            self.assertEqual(s.recv(1024), b"")
        except socket.timeout:
            self.fail("o servidor não fechou a conexão")

    def test_handshake_que_nao_termina_e_encerrado(self):
        s = self._raw()
        try:
            s.sendall(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n")
            self.assert_closed_by_server(s)
        finally:
            s.close()

    def _drip_until_closed(self, s, limit: float):
        """Manda um cabeçalho a cada 0,2 s (menos que o prazo por leitura) até o servidor fechar; devolve o tempo."""
        start = time.monotonic()
        s.settimeout(0.2)
        while time.monotonic() - start < limit:
            try:
                s.sendall(b"X-Pinga: 1\r\n")
                if s.recv(1024) == b"":
                    return time.monotonic() - start
            except socket.timeout:
                continue
            except OSError:
                return time.monotonic() - start
        return None

    def test_handshake_a_conta_gotas_respeita_o_prazo_total(self):
        s = self._raw()
        try:
            elapsed = self._drip_until_closed(s, limit=3.0)
            self.assertIsNotNone(elapsed, "o servidor não fechou: o prazo não é total")
            self.assertLess(elapsed, 1.5)
        finally:
            s.close()

    def test_quadro_incompleto_e_encerrado_mas_par_quieto_nao(self):
        quiet, stalled = self._raw(), self._raw()
        try:
            self._upgrade(quiet)
            self._upgrade(stalled)
            stalled.sendall(bytes([0x81, 0x80 | 100]) + MASK + b"so um pedaco")
            self.assert_closed_by_server(stalled)
            time.sleep(0.6)
            quiet.sendall(masked_frame(json.dumps({"type": "register", "peerId": "peer_quieto"}).encode(), 0x1))
            opcode, payload = read_ws_frame(quiet)
            self.assertEqual(json.loads(payload)["type"], "registered", "par quieto além do prazo continua conectado")
        finally:
            quiet.close()
            stalled.close()

    def test_mensagem_fragmentada_com_ping_no_meio_e_remontada(self):
        s = self._raw()
        try:
            self._upgrade(s)
            text = json.dumps({"type": "register", "peerId": "peer_fragmentado"}).encode()
            s.sendall(masked_frame(text[:10], 0x1, fin=False))
            s.sendall(masked_frame(b"oi", 0x9))
            s.sendall(masked_frame(text[10:20], 0x0, fin=False))
            s.sendall(masked_frame(text[20:], 0x0, fin=True))
            self.assertEqual(read_ws_frame(s), (0xA, b"oi"))
            opcode, payload = read_ws_frame(s)
            self.assertEqual(opcode, 0x1)
            self.assertEqual(json.loads(payload)["peerId"], "peer_fragmentado")
        finally:
            s.close()

    def test_continuacao_sem_mensagem_aberta_encerra_a_conexao(self):
        s = self._raw()
        try:
            self._upgrade(s)
            s.sendall(masked_frame(b"solta", 0x0))
            self.assert_closed_by_server(s)
        finally:
            s.close()


if __name__ == "__main__":
    unittest.main()
