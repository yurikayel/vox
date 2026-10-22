#!/usr/bin/env python3
"""
Vox Relay — Servidor de Sinalização WebRTC (Fase 3.2)
Biblioteca padrão Python 3 (zero dependências pip).
Protocolo WebSocket RFC 6455 para troca de ofertas SDP e candidatos ICE.
"""

import sys
import json
import base64
import hashlib
import struct
import socket
import select
import threading
import socketserver

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 3921


def compute_accept_key(sec_key: str) -> str:
    raw = (sec_key.strip() + WS_GUID).encode("utf-8")
    return base64.b64encode(hashlib.sha1(raw).digest()).decode("ascii")


def make_ws_frame(payload: bytes, opcode: int = 1) -> bytes:
    first_byte = 0x80 | (opcode & 0x0F)
    length = len(payload)
    if length < 126:
        header = bytes([first_byte, length])
    elif length <= 0xFFFF:
        header = bytes([first_byte, 126]) + struct.pack(">H", length)
    else:
        header = bytes([first_byte, 127]) + struct.pack(">Q", length)
    return header + payload


def read_exact(sock, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            return None
        buf.extend(chunk)
    return bytes(buf)


def parse_frame_length(sock, second_byte: int):
    payload_len = second_byte & 0x7F
    if payload_len == 126:
        ext = read_exact(sock, 2)
        if not ext:
            return None
        return struct.unpack(">H", ext)[0]
    if payload_len == 127:
        ext = read_exact(sock, 8)
        if not ext:
            return None
        return struct.unpack(">Q", ext)[0]
    return payload_len


def read_ws_frame(sock):
    header = read_exact(sock, 2)
    if not header:
        return None, None
    first_byte, second_byte = header[0], header[1]
    opcode = first_byte & 0x0F
    is_masked = bool(second_byte & 0x80)

    length = parse_frame_length(sock, second_byte)
    if length is None:
        return None, None

    mask_key = read_exact(sock, 4) if is_masked else None
    if is_masked and not mask_key:
        return None, None

    raw_payload = read_exact(sock, length) if length > 0 else b""
    if raw_payload is None:
        return None, None

    if is_masked:
        payload = bytes([b ^ mask_key[i % 4] for i, b in enumerate(raw_payload)])
    else:
        payload = raw_payload

    return opcode, payload


class PeerRegistry:
    def __init__(self):
        self.lock = threading.Lock()
        self.peers = {}  # peer_id -> handler

    def register(self, peer_id: str, handler) -> list:
        with self.lock:
            existing = list(self.peers.keys())
            self.peers[peer_id] = handler
            return existing

    def unregister(self, peer_id: str):
        with self.lock:
            if peer_id in self.peers:
                del self.peers[peer_id]

    def get(self, peer_id: str):
        with self.lock:
            return self.peers.get(peer_id)

    def broadcast_others(self, sender_id: str, message: dict):
        with self.lock:
            targets = [h for pid, h in self.peers.items() if pid != sender_id]
        for handler in targets:
            handler.send_json(message)


registry = PeerRegistry()


class WebSocketHandler(socketserver.BaseRequestHandler):
    def setup(self):
        self.peer_id = None
        self.closed = False

    def handle(self):
        if not self.perform_handshake():
            return
        self.receive_loop()

    def perform_handshake(self) -> bool:
        request_data = bytearray()
        while b"\r\n\r\n" not in request_data:
            chunk = self.request.recv(1024)
            if not chunk:
                return False
            request_data.extend(chunk)

        header_lines = request_data.split(b"\r\n\r\n")[0].decode("utf-8", "ignore").split("\r\n")
        headers = {}
        for line in header_lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        sec_key = headers.get("sec-websocket-key")
        if not sec_key:
            return False

        accept_val = compute_accept_key(sec_key)
        resp = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
        )
        self.request.sendall(resp.encode("ascii"))
        return True

    def receive_loop(self):
        try:
            while not self.closed:
                opcode, payload = read_ws_frame(self.request)
                if opcode is None or opcode == 0x8:  # Close
                    break
                if opcode == 0x9:  # Ping
                    self.send_frame(make_ws_frame(payload, opcode=0xA))
                    continue
                if opcode == 0x1:  # Text
                    self.handle_text_payload(payload)
        except Exception:
            pass
        finally:
            self.cleanup()

    def handle_text_payload(self, payload: bytes):
        try:
            msg = json.loads(payload.decode("utf-8"))
            self.dispatch_message(msg)
        except Exception:
            pass

    def dispatch_message(self, msg: dict):
        mtype = msg.get("type")
        if mtype == "register":
            self.on_register(msg.get("peerId"))
        elif mtype in ("offer", "answer", "ice"):
            self.forward_peer_message(msg)
        elif mtype == "ping":
            self.send_json({"type": "pong"})

    def on_register(self, peer_id: str):
        if not peer_id:
            return
        self.peer_id = peer_id
        others = registry.register(peer_id, self)
        self.send_json({"type": "registered", "peerId": peer_id, "peers": others})
        registry.broadcast_others(peer_id, {"type": "peer-joined", "peerId": peer_id})

    def forward_peer_message(self, msg: dict):
        to_peer = msg.get("to")
        if not to_peer:
            return
        msg["from"] = self.peer_id
        target = registry.get(to_peer)
        if target:
            target.send_json(msg)

    def send_json(self, data: dict):
        try:
            raw = json.dumps(data).encode("utf-8")
            self.send_frame(make_ws_frame(raw, opcode=1))
        except Exception:
            self.closed = True

    def send_frame(self, frame_bytes: bytes):
        self.request.sendall(frame_bytes)

    def cleanup(self):
        if self.peer_id:
            registry.unregister(self.peer_id)
            registry.broadcast_others(self.peer_id, {"type": "peer-left", "peerId": self.peer_id})
            self.peer_id = None
        self.closed = True


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    host = DEFAULT_HOST
    port = DEFAULT_PORT

    for i, arg in enumerate(sys.argv):
        if arg == "--port" and i + 1 < len(sys.argv):
            port = int(sys.argv[i + 1])
        elif arg == "--host" and i + 1 < len(sys.argv):
            host = sys.argv[i + 1]

    print("======================================================")
    print("  Vox Signaling Server — WebRTC Mesh (Fase 3.2)")
    print(f"  Escutando em: ws://{host}:{port}")
    print("  Protocolo: WebSocket RFC 6455 (stdlib)")
    print("  Pressione Ctrl+C para encerrar.")
    print("======================================================")

    server = ThreadedTCPServer((host, port), WebSocketHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando servidor de sinalização Vox...")
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
