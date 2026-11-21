#!/usr/bin/env python3
"""
Vox Relay — Servidor de Sinalização WebRTC (Fase 3.2)
Biblioteca padrão Python 3 (zero dependências pip).
Protocolo WebSocket RFC 6455 para troca de ofertas SDP e candidatos ICE.
"""

import base64
import hashlib
import json
import os
import socketserver
import struct
import sys
import threading
import time

# como pacote (testes, `python -m`) ou solto na mesma pasta (`python relay/signaling.py`):
try:
    from relay import rate_limit, request_guard
except ImportError:
    import rate_limit
    import request_guard

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 3921
MAX_WS_FRAME_SIZE = 1024 * 1024  # 1 MB max frame size
MAX_HEADER_SIZE = 64 * 1024  # 64 KB max handshake headers
MAX_WS_MESSAGE_SIZE = MAX_WS_FRAME_SIZE  # teto da mensagem remontada (todos os fragmentos juntos)
HANDSHAKE_TIMEOUT = 10.0  # segundos para o handshake HTTP chegar inteiro
FRAME_TIMEOUT = 30.0  # segundos para o resto de um quadro depois do cabeçalho
DEFAULT_MAX_CONNECTIONS = 64
CONTROL_OPCODES = frozenset({0x8, 0x9, 0xA})
DATA_OPCODES = frozenset({0x0, 0x1, 0x2})  # continuação, texto, binário
MAX_CONTROL_PAYLOAD = 125


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
        length = struct.unpack(">H", ext)[0]
    elif payload_len == 127:
        ext = read_exact(sock, 8)
        if not ext:
            return None
        length = struct.unpack(">Q", ext)[0]
    else:
        length = payload_len
    if length > MAX_WS_FRAME_SIZE:
        return None
    return length


def read_frame_body(sock, second_byte: int):
    """Lê comprimento, máscara e carga de um quadro; None se a conexão cair."""
    length = parse_frame_length(sock, second_byte)
    if length is None:
        return None
    is_masked = bool(second_byte & 0x80)
    mask_key = read_exact(sock, 4) if is_masked else None
    if is_masked and not mask_key:
        return None
    raw_payload = read_exact(sock, length) if length > 0 else b""
    if raw_payload is None or not is_masked:
        return raw_payload
    return bytes([b ^ mask_key[i % 4] for i, b in enumerate(raw_payload)])


def read_ws_frame_parts(sock, frame_timeout=None):
    """Lê um quadro e devolve `(fin, opcode, payload)`, ou `(None, None, None)` se cair.

    Esperar o próximo quadro não tem prazo (par registrado pode ficar quieto).
    Com `frame_timeout`, depois que o cabeçalho chega o resto do quadro precisa
    chegar nesse prazo, senão `socket.timeout` sobe para quem chamou.
    """
    header = read_exact(sock, 2)
    if not header:
        return None, None, None
    previous = sock.gettimeout() if frame_timeout is not None else None
    if frame_timeout is not None:
        sock.settimeout(frame_timeout)
    try:
        payload = read_frame_body(sock, header[1])
    finally:
        if frame_timeout is not None:
            sock.settimeout(previous)
    if payload is None:
        return None, None, None
    return bool(header[0] & 0x80), header[0] & 0x0F, payload


def read_ws_frame(sock):
    """Lê um quadro e devolve `(opcode, payload)` sem olhar FIN; (None, None) se cair."""
    _fin, opcode, payload = read_ws_frame_parts(sock)
    return opcode, payload


class MessageAssembler:
    """Remonta mensagens fragmentadas (RFC 6455 §5.4).

    Quadro texto/binário com FIN=0 abre mensagem, continuação (opcode 0x0)
    completa e FIN=1 fecha. Quadros de controle não passam por aqui.
    Erro de protocolo ou mensagem acima do teto levanta `ValueError`.
    """

    def __init__(self, max_size: int = MAX_WS_MESSAGE_SIZE):
        self.max_size = max_size
        self.opcode = None
        self.parts = bytearray()

    def _open(self, opcode: int) -> None:
        if opcode == 0x0 and self.opcode is None:
            raise ValueError("continuação sem mensagem aberta")
        if opcode != 0x0 and self.opcode is not None:
            raise ValueError("mensagem nova antes de terminar a anterior")
        if opcode != 0x0:
            self.opcode = opcode

    def feed(self, fin: bool, opcode: int, payload: bytes):
        """Acrescenta quadro; devolve `(opcode, payload)` se fechou, senão None."""
        self._open(opcode)
        if len(self.parts) + len(payload) > self.max_size:
            raise ValueError("mensagem acima do teto")
        self.parts.extend(payload)
        if not fin:
            return None
        done = (self.opcode, bytes(self.parts))
        self.opcode = None
        self.parts = bytearray()
        return done


def _positive_int(raw, default: int) -> int:
    try:
        value = int(str(raw or "").strip())
    except ValueError:
        return default
    return value if value > 0 else default


def resolve_max_connections(env=None) -> int:
    """Conexões atendidas ao mesmo tempo (`VOX_SIGNAL_MAX_CONNECTIONS`).

    As demais são fechadas na hora.
    """
    raw = (env if env is not None else os.environ).get("VOX_SIGNAL_MAX_CONNECTIONS")
    return _positive_int(raw, DEFAULT_MAX_CONNECTIONS)


def resolve_port(cli_port=None, default: int = DEFAULT_PORT) -> int:
    if cli_port is not None:
        try:
            return int(cli_port)
        except (ValueError, TypeError):
            pass
    env_port = os.environ.get("PORT")
    if env_port and str(env_port).strip().isdigit():
        return int(str(env_port).strip())
    return default


def cors_headers(origin) -> tuple:
    """Cabeçalhos CORS para a origem do pedido; vazio se não permitida."""
    allowed = request_guard.cors_allow_origin(origin)
    if allowed is None:
        return ()
    return (
        f"Access-Control-Allow-Origin: {allowed}",
        "Access-Control-Allow-Methods: GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers: Content-Type",
    )


def make_http_response(
    status_code: int,
    status_text: str,
    body: bytes = b"",
    content_type: str = "application/json",
    extra_headers: tuple = (),
    origin=None,
) -> bytes:
    """Resposta HTTP da sinalização.

    CORS segue `request_guard.cors_allow_origin`.
    """
    lines = [
        f"HTTP/1.1 {status_code} {status_text}",
        f"Content-Type: {content_type}",
        f"Content-Length: {len(body)}",
        *extra_headers,
        "Vary: Origin",
        *cors_headers(origin),
        "Connection: close",
        "",
        "",
    ]
    return "\r\n".join(lines).encode("ascii") + body


def parse_http_target(request_line: str):
    parts = (request_line or "").strip().split()
    method = parts[0].upper() if len(parts) > 0 else "GET"
    path = parts[1] if len(parts) > 1 else "/"
    return method, path


def handle_http_request(request_sock, request_line: str, peer_count: int = 0, origin=None) -> None:
    method, path = parse_http_target(request_line)
    if method == "OPTIONS":
        resp = make_http_response(204, "No Content", body=b"", origin=origin)
    elif method in ("GET", "HEAD"):
        clean_path = path.split("?")[0]
        if clean_path in ("/", "/health", "/status", "/ping"):
            payload = json.dumps(
                {
                    "status": "ok",
                    "service": "vox-signaling",
                    "version": "1.0.0",
                    "peers": peer_count,
                }
            ).encode("utf-8")
            body = b"" if method == "HEAD" else payload
            resp = make_http_response(200, "OK", body=body, origin=origin)
        else:
            resp = make_http_response(
                404, "Not Found", body=b'{"error":"not_found"}', origin=origin
            )
    else:
        resp = make_http_response(
            405, "Method Not Allowed", body=b'{"error":"method_not_allowed"}', origin=origin
        )
    try:
        request_sock.sendall(resp)
    except Exception:
        pass


class PeerRegistry:
    def __init__(self):
        self.lock = threading.Lock()
        self.peers = {}  # peer_id -> handler
        self.addresses = {}  # peer_id -> arweave_address
        self.dm_pubs = {}  # peer_id -> public JWK dict

    def register(self, peer_id: str, handler, address: str = "", dm_pub=None) -> list:
        with self.lock:
            existing = list(self.peers.keys())
            self.peers[peer_id] = handler
            if address:
                self.addresses[peer_id] = str(address)
            if dm_pub:
                self.dm_pubs[peer_id] = dm_pub
            return existing

    def unregister(self, peer_id: str, handler=None) -> bool:
        with self.lock:
            if handler is not None and self.peers.get(peer_id) is not handler:
                return False
            removed = self.peers.pop(peer_id, None)
            self.addresses.pop(peer_id, None)
            self.dm_pubs.pop(peer_id, None)
            return removed is not None

    def get(self, peer_id: str):
        with self.lock:
            return self.peers.get(peer_id)

    def get_peer_by_address(self, address: str):
        with self.lock:
            for pid, addr in self.addresses.items():
                if addr == address:
                    return pid
            return None

    def get_address_map(self, exclude_peer: str = "") -> dict:
        with self.lock:
            result = {}
            for pid, addr in self.addresses.items():
                if pid != exclude_peer and addr:
                    result[addr] = {
                        "peerId": pid,
                        "dmPub": self.dm_pubs.get(pid),
                    }
            return result

    def broadcast_others(self, sender_id: str, message: dict):
        with self.lock:
            targets = [h for pid, h in self.peers.items() if pid != sender_id]
        for handler in targets:
            handler.send_json(message)


registry = PeerRegistry()


class WebSocketHandler(socketserver.BaseRequestHandler):
    peer_ip = None  # IP usado no limite de taxa; definido no handshake

    def setup(self):
        self.peer_id = None
        self.closed = False

    def handle(self):
        try:
            if not self.perform_handshake():
                return
        except OSError:  # inclui socket.timeout: handshake lento ou conexão caída
            return
        self.request.settimeout(None)
        self.receive_loop()

    def _parse_headers(self, lines: list) -> dict:
        headers = {}
        for line in lines:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        return headers

    def read_handshake_request(self):
        """Lê pedido HTTP até linha em branco, com prazo total `HANDSHAKE_TIMEOUT`."""
        deadline = time.monotonic() + HANDSHAKE_TIMEOUT
        request_data = bytearray()
        while b"\r\n\r\n" not in request_data:
            remaining = deadline - time.monotonic()
            if len(request_data) > MAX_HEADER_SIZE or remaining <= 0:
                return None
            self.request.settimeout(remaining)
            chunk = self.request.recv(1024)
            if not chunk:
                return None
            request_data.extend(chunk)
        return request_data

    def perform_handshake(self) -> bool:
        request_data = self.read_handshake_request()
        if request_data is None:
            return False

        header_lines = request_data.split(b"\r\n\r\n")[0].decode("utf-8", "ignore").split("\r\n")
        headers = self._parse_headers(header_lines[1:])

        sec_key = headers.get("sec-websocket-key")
        if not sec_key:
            handle_http_request(
                self.request,
                header_lines[0] if header_lines else "",
                peer_count=len(registry.peers),
                origin=headers.get("origin"),
            )
            return False

        if self.reject_if_foreign_origin(headers.get("origin")):
            return False

        self.peer_ip = self.resolve_peer_ip(headers)
        if self.reject_if_throttled():
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

    def reject_if_foreign_origin(self, origin) -> bool:
        """Recusa com 403 o handshake vindo de página fora da lista (`request_guard`).

        Sem `Origin` (cliente nativo, nó Linux) passa: só navegador manda o cabeçalho.
        """
        if not origin or request_guard.cors_allow_origin(origin) is not None:
            return False
        resp = make_http_response(403, "Forbidden", body=b'{"error":"origin_not_allowed"}')
        try:
            self.request.sendall(resp)
        except OSError:
            pass
        return True

    def resolve_peer_ip(self, headers: dict):
        """IP do cliente para o rate limit (respeita `VOX_RELAY_TRUST_PROXY_HOPS`)."""
        address = getattr(self, "client_address", None)
        if not address:
            return None
        return rate_limit.client_ip(address[0], headers.get("x-forwarded-for"))

    def reject_if_throttled(self) -> bool:
        """Recusa a conexão com 429 + `Retry-After` quando o IP abriu WebSockets demais."""
        wait = rate_limit.LIMITER.check("signal", self.peer_ip) if self.peer_ip else 0
        if not wait:
            return False
        resp = make_http_response(
            429,
            "Too Many Requests",
            body=b'{"error":"rate_limited"}',
            extra_headers=(f"Retry-After: {wait}",),
        )
        try:
            self.request.sendall(resp)
        except OSError:
            pass
        return True

    def receive_loop(self):
        assembler = MessageAssembler()
        try:
            while not self.closed:
                fin, opcode, payload = read_ws_frame_parts(self.request, FRAME_TIMEOUT)
                if opcode is None or opcode == 0x8:  # Close
                    break
                if not self.handle_frame(assembler, fin, opcode, payload):
                    break
        except Exception:
            pass
        finally:
            self.cleanup()

    def handle_frame(
        self, assembler: MessageAssembler, fin: bool, opcode: int, payload: bytes
    ) -> bool:
        """Trata um quadro; False encerra a conexão (erro de protocolo)."""
        if opcode in CONTROL_OPCODES:
            if not fin or len(payload) > MAX_CONTROL_PAYLOAD:
                return False
            if opcode == 0x9:  # Ping
                self.send_frame(make_ws_frame(payload, opcode=0xA))
            return True
        if opcode not in DATA_OPCODES:
            return False
        message = assembler.feed(fin, opcode, payload)
        if message and message[0] == 0x1:  # Text
            self.handle_text_payload(message[1])
        return True

    def handle_text_payload(self, payload: bytes):
        if self.peer_ip and rate_limit.LIMITER.check("signal_msg", self.peer_ip):
            return  # acima do limite da conexão: descarta sem responder
        try:
            msg = json.loads(payload.decode("utf-8"))
            self.dispatch_message(msg)
        except Exception:
            pass

    def dispatch_message(self, msg: dict):
        mtype = msg.get("type")
        if mtype == "register":
            self.on_register(
                msg.get("peerId"),
                msg.get("address", ""),
                msg.get("dmPub"),
            )
        elif mtype in ("offer", "answer", "ice"):
            self.forward_peer_message(msg)
        elif mtype == "ping":
            self.send_json({"type": "pong"})

    def on_register(self, peer_id: str, address: str = "", dm_pub=None):
        if not isinstance(peer_id, str):
            return
        clean_id = peer_id.strip()
        if not clean_id:
            return
        if self.peer_id and self.peer_id != clean_id:
            if registry.unregister(self.peer_id, handler=self):
                registry.broadcast_others(
                    self.peer_id, {"type": "peer-left", "peerId": self.peer_id}
                )
        self.peer_id = clean_id
        others = registry.register(clean_id, self, address=address, dm_pub=dm_pub)
        addr_map = registry.get_address_map(exclude_peer=clean_id)
        self.send_json(
            {
                "type": "registered",
                "peerId": clean_id,
                "peers": others,
                "addressMap": addr_map,
            }
        )
        registry.broadcast_others(
            clean_id,
            {
                "type": "peer-joined",
                "peerId": clean_id,
                "address": address or "",
                "dmPub": dm_pub,
            },
        )

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
            if registry.unregister(self.peer_id, handler=self):
                registry.broadcast_others(
                    self.peer_id, {"type": "peer-left", "peerId": self.peer_id}
                )
            self.peer_id = None
        self.closed = True


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Uma thread por conexão (daemon), com teto de conexões simultâneas."""

    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, server_address, handler_class, max_connections=None, **kwargs):
        self._slots = threading.BoundedSemaphore(max_connections or resolve_max_connections())
        super().__init__(server_address, handler_class, **kwargs)

    def process_request(self, request, client_address):
        if not self._slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()


def main():
    cli_port = None
    cli_host = None

    for i, arg in enumerate(sys.argv):
        if arg == "--port" and i + 1 < len(sys.argv):
            cli_port = sys.argv[i + 1]
        elif arg == "--host" and i + 1 < len(sys.argv):
            cli_host = sys.argv[i + 1]

    host = cli_host or os.environ.get("HOST", DEFAULT_HOST)
    port = resolve_port(cli_port, DEFAULT_PORT)

    print("======================================================")
    print("  Vox Signaling Server — WebRTC Mesh (Fase 3.2)")
    print(f"  Escutando em: ws://{host}:{port}")
    print("  Protocolo: WebSocket RFC 6455 (stdlib) + HTTP Health")
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
