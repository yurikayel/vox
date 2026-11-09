"""Local-only Node Zero: Vox relay/cache plus a Windows resource governor."""

from __future__ import annotations

import argparse
import hmac
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path

from windows_host import WindowsHost, WindowsJobGovernor


APP_NAME = "Vox Populi Node Zero"
RELAY_HOST = "127.0.0.1"
RELAY_PORT = 3921
LEGACY_RELAY_PORT = 3920
CONTROL_HOST = "127.0.0.1"
CONTROL_PORT = 3922


def positive_env(name: str, fallback: int, minimum: int) -> int:
    value = os.environ.get(name, "").strip()
    return int(value) if value.isdigit() and int(value) >= minimum else fallback


MAX_CACHE_MB = positive_env("VOX_NODE_ZERO_CACHE_MB", 2048, 64)
MAX_MEMORY_MB = positive_env("VOX_NODE_ZERO_MEMORY_MB", 4096, 512)
DEFAULT_CONFIG = {
    "cpuIdleSharePercent": 70,
    "cpuActiveSharePercent": 20,
    "memoryLimitMb": MAX_MEMORY_MB,
    "cacheLimitMb": MAX_CACHE_MB,
}
POLL_SECONDS = 5
IDLE_SECONDS = 300
SYSTEM_RESERVE_BYTES = 4 * 1024**3


def app_data_dir() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "VoxPopuli" / "NodeZero"
    profile = os.environ.get("USERPROFILE") or str(Path.home())
    return Path(profile) / "AppData" / "Local" / "VoxPopuli" / "NodeZero"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def read_or_create_identity(path: Path) -> str:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        node_id = str(data.get("nodeId", ""))
        if not node_id:
            raise ValueError(f"Identidade local inválida: {path}")
        return node_id
    node_id = str(uuid.uuid4())
    write_json(path, {"nodeId": node_id, "createdAt": utc_now()})
    return node_id


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_token(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    token = secrets.token_urlsafe(32)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(token, encoding="utf-8")
    return token


def memory_budget(snapshot: dict, configured_limit_mb: int = MAX_MEMORY_MB) -> int:
    total = int(snapshot.get("ramTotalBytes") or 0)
    available = int(snapshot.get("ramAvailableBytes") or 0)
    if not total or not available:
        return 512 * 1024**2
    reserve = max(SYSTEM_RESERVE_BYTES, total // 4)
    idle_budget = int(available * 0.7)
    system_safe_budget = max(512 * 1024**2, total - reserve)
    configured_budget = configured_limit_mb * 1024**2
    return max(512 * 1024**2, min(idle_budget, system_safe_budget, configured_budget))


def cpu_budget(
    snapshot: dict,
    paused: bool,
    idle_share_percent: int = 70,
    active_share_percent: int = 20,
) -> float:
    if paused or snapshot["state"] == "PRESSURE":
        return 1.0
    measured_idle = snapshot.get("cpuIdlePercent")
    if measured_idle is None:
        return 20.0
    idle = float(measured_idle)
    if snapshot["state"] == "IDLE":
        return max(1.0, min(float(idle_share_percent), idle * idle_share_percent / 100))
    return max(1.0, min(float(active_share_percent), idle * active_share_percent / 100))


def format_megabytes(value: int) -> float:
    return round(value / 1024**2, 1)


def validate_node_config(values: dict) -> dict:
    config = {**DEFAULT_CONFIG, **values}
    bounds = {
        "cpuIdleSharePercent": (1, 70),
        "cpuActiveSharePercent": (1, 20),
        "memoryLimitMb": (512, 8192),
        "cacheLimitMb": (64, 65536),
    }
    validated = {}
    for name, (minimum, maximum) in bounds.items():
        value = config.get(name)
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"{name} precisa ser um número inteiro.")
        if not minimum <= value <= maximum:
            raise ValueError(f"{name} deve ficar entre {minimum} e {maximum}.")
        validated[name] = value
    return validated


def load_node_config(path: Path) -> dict:
    if not path.exists():
        return dict(DEFAULT_CONFIG)
    try:
        return validate_node_config(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return dict(DEFAULT_CONFIG)


def save_node_config(data_dir: Path, values: dict) -> dict:
    config = validate_node_config(values)
    write_json(data_dir / "settings.json", config)
    return config


class NodeControlHandler(BaseHTTPRequestHandler):
    node = None

    def log_message(self, _format, *_args):
        return

    def _reply(self, code: int, body: dict) -> None:
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path != "/api/status":
            self._reply(404, {"error": "not_found"})
            return
        self._reply(200, self.node.status())

    def do_POST(self):
        if not self._authorized():
            return
        if self.path == "/api/config":
            self._post_config()
            return
        self._post_action()

    def _authorized(self) -> bool:
        if self.client_address[0] != "127.0.0.1":
            self._reply(403, {"error": "loopback_only"})
            return False
        supplied = self.headers.get("X-Vox-Node-Token", "")
        if not hmac.compare_digest(supplied, self.node.token):
            self._reply(401, {"error": "unauthorized"})
            return False
        return True

    def _post_config(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 4096:
                raise ValueError("Tamanho de configuração inválido.")
            values = json.loads(self.rfile.read(length))
            settings = self.node.configure(values)
        except (ValueError, TypeError, OSError) as error:
            self._reply(400, {"error": "invalid_config", "detail": str(error)})
            return
        self._reply(200, {"status": "saved", "settings": settings})

    def _post_action(self) -> None:
        actions = {
            "/api/pause": self.node.pause,
            "/api/resume": self.node.resume,
            "/api/stop": self.node.stop,
        }
        action = actions.get(self.path)
        if not action:
            self._reply(404, {"error": "not_found"})
            return
        try:
            action()
        except OSError as error:
            self._reply(409, {"error": "action_failed", "detail": str(error)})
            return
        self._reply(200, {"status": "accepted", "action": self.path})


class NodeZero:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.cache_dir = data_dir / "cache"
        self.inbox_dir = data_dir / "inbox"
        self.memory_dir = data_dir / "central_memory"
        self.identity_path = data_dir / "identity.json"
        self.token_path = data_dir / "control.token"
        self.status_path = data_dir / "status.json"
        self.config_path = data_dir / "settings.json"
        self.config = load_node_config(self.config_path)
        self.node_id = read_or_create_identity(self.identity_path)
        self.token = ensure_token(self.token_path)
        self.stop_event = threading.Event()
        self.paused = False
        self.host = WindowsHost()
        self.governor = WindowsJobGovernor()
        self.relay = None
        self.relay_module = None
        self.central_memory_module = None
        self.relay_thread = None
        self.compat_relay = None
        self.compat_relay_thread = None
        self.control = None
        self.control_thread = None
        self.last_snapshot = {}
        self.cpu_limit_active = False
        self.memory_limit_active = False

    def _load_relay(self):
        repo_root = Path(__file__).resolve().parents[2]
        if str(repo_root) not in sys.path:
            sys.path.insert(0, str(repo_root))
        os.environ["VOX_RELAY_CACHE_DIR"] = str(self.cache_dir)
        os.environ["VOX_RELAY_INBOX_DIR"] = str(self.inbox_dir)
        os.environ["VOX_CENTRAL_MEMORY_DIR"] = str(self.memory_dir)
        os.environ["VOX_RELAY_MAX_CACHE_MB"] = str(self.config["cacheLimitMb"])
        from relay import central_memory, inbox, server

        server.set_cache_dir(self.cache_dir)
        inbox.set_inbox_dir(self.inbox_dir)
        central_memory.set_memory_dir(self.memory_dir)
        central_memory.load_state()
        self.central_memory_module = central_memory
        return server

    def _start_relay(self) -> None:
        if self.relay_thread and self.relay_thread.is_alive():
            return
        module = self._load_relay()
        self.relay_module = module
        module.ensure_cache_dir()
        module.evict_cache_if_needed()
        self.relay = ThreadingHTTPServer(
            (RELAY_HOST, RELAY_PORT), module.VoxRelayHandler
        )
        self.relay.daemon_threads = True
        self.relay_thread = threading.Thread(
            target=self.relay.serve_forever, name="vox-relay", daemon=True
        )
        self.relay_thread.start()
        self._start_compat_relay(module.VoxRelayHandler)

    def _start_compat_relay(self, handler_cls) -> None:
        if self.compat_relay or LEGACY_RELAY_PORT == RELAY_PORT:
            return
        try:
            self.compat_relay = ThreadingHTTPServer((RELAY_HOST, LEGACY_RELAY_PORT), handler_cls)
            self.compat_relay.daemon_threads = True
            self.compat_relay_thread = threading.Thread(
                target=self.compat_relay.serve_forever, name="vox-relay-compat", daemon=True
            )
            self.compat_relay_thread.start()
        except OSError:
            self.compat_relay = None

    def _stop_relay(self) -> None:
        if self.compat_relay:
            self.compat_relay.shutdown()
            self.compat_relay.server_close()
            if self.compat_relay_thread:
                self.compat_relay_thread.join(timeout=2)
            self.compat_relay = None
        if not self.relay:
            return
        self.relay.shutdown()
        self.relay.server_close()
        if self.relay_thread:
            self.relay_thread.join(timeout=3)
        self.relay = None
        if self.central_memory_module:
            self.central_memory_module.save_state()

    def _set_resource_limits(self, snapshot: dict) -> dict:
        cpu_limit = cpu_budget(
            snapshot,
            self.paused,
            self.config["cpuIdleSharePercent"],
            self.config["cpuActiveSharePercent"],
        )
        memory_limit = memory_budget(snapshot, self.config["memoryLimitMb"])
        self.cpu_limit_active = self.governor.set_cpu_limit(cpu_limit)
        self.memory_limit_active = self.governor.set_memory_limit(memory_limit)
        fallback = False
        if not self.cpu_limit_active:
            fallback_state = "PRESSURE" if self.paused else snapshot["state"]
            fallback = self.governor.set_fallback_priority(fallback_state)
        return {
            "cpuBudgetPercent": round(cpu_limit, 1),
            "cpuLimitApplied": self.cpu_limit_active,
            "priorityFallbackApplied": fallback,
            "memoryBudgetMb": format_megabytes(memory_limit),
            "memoryLimitApplied": self.memory_limit_active,
            "jobObjectError": self.governor.error,
        }

    def status(self) -> dict:
        snapshot = self.last_snapshot or self.host.snapshot()
        cache_bytes = self._cache_bytes()
        disk = shutil.disk_usage(self.data_dir)
        return {
            "app": APP_NAME,
            "mode": "zero-central-memory",
            "nodeId": self.node_id,
            "updatedAt": utc_now(),
            "machine": socket.gethostname(),
            "platform": "windows",
            "state": "PAUSED" if self.paused else snapshot.get("state", "STARTING"),
            "relay": self._relay_status(cache_bytes),
            "centralMemory": self._central_memory_status(),
            "control": {"url": f"http://{CONTROL_HOST}:{CONTROL_PORT}"},
            "services": self._service_status(),
            "resources": {
                **snapshot,
                "governor": self._set_resource_limits(snapshot),
                "diskFreeBytes": disk.free,
                "diskTotalBytes": disk.total,
            },
            "settings": dict(self.config),
        }

    def _central_memory_status(self) -> dict:
        if self.central_memory_module:
            return self.central_memory_module.get_status_summary()
        return {
            "status": "stopped",
            "mode": "zero-central-memory",
            "memoryDir": str(self.memory_dir),
        }

    def _cache_bytes(self) -> int:
        if not self.cache_dir.exists():
            return 0
        return sum(path.stat().st_size for path in self.cache_dir.glob("*") if path.is_file())

    def _relay_status(self, cache_bytes: int) -> dict:
        return {
            "active": bool(self.relay),
            "url": f"http://{RELAY_HOST}:{RELAY_PORT}",
            "cacheBytes": cache_bytes,
            "cacheLimitMb": self.config["cacheLimitMb"],
            "cacheDir": str(self.cache_dir),
        }

    def _service_status(self) -> dict:
        state = "active" if self.relay and not self.paused else "paused"
        seeder_active = False
        seeder_status = "ready"
        peer_discovery = "ready"
        try:
            from relay import p2p_seeder
            p2p_st = p2p_seeder.SEEDER_MANAGER.get_status()
            seeder_active = p2p_st.get("seederActive", False)
            seeder_status = p2p_st.get("seederStatus", "ready")
            disc_st = p2p_seeder.PEER_DISCOVERY.get_status()
            peer_discovery = disc_st.get("peerDiscovery", "ready")
        except Exception:
            pass
        return {
            "bootstrap": "local_only",
            "mode": "zero-central-memory",
            "relay": state,
            "cache": state,
            "centralMemory": state,
            "seederActive": seeder_active,
            "seederStatus": seeder_status,
            "peerDiscovery": peer_discovery,
        }

    def _write_status(self) -> None:
        write_json(self.status_path, self.status())

    def _control_handler(self):
        return type("BoundNodeControlHandler", (NodeControlHandler,), {"node": self})

    def pause(self) -> None:
        self.paused = True
        self._stop_relay()
        self._write_status()

    def resume(self) -> None:
        self.paused = False
        self._start_relay()
        self._write_status()

    def stop(self) -> None:
        self.stop_event.set()

    def configure(self, values: dict) -> dict:
        self.config = save_node_config(self.data_dir, values)
        os.environ["VOX_RELAY_MAX_CACHE_MB"] = str(self.config["cacheLimitMb"])
        if self.relay_module:
            self.relay_module.evict_cache_if_needed()
        self._write_status()
        return dict(self.config)

    def run(self) -> int:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if not self._start_services():
            self.governor.close()
            return 1
        self._start_control_thread()
        try:
            self._poll_until_stopped()
        finally:
            self._shutdown()
        return 0

    def _start_services(self) -> bool:
        try:
            self._start_relay()
            self.control = HTTPServer((CONTROL_HOST, CONTROL_PORT), self._control_handler())
            return True
        except OSError as error:
            self._stop_relay()
            print(f"Não foi possível iniciar o nó local: {error}", file=sys.stderr)
            return False

    def _start_control_thread(self) -> None:
        self.control_thread = threading.Thread(
            target=self.control.serve_forever, name="node-zero-control", daemon=True
        )
        self.control_thread.start()
        print(f"{APP_NAME} ativo em {RELAY_HOST}:{RELAY_PORT} (controle {CONTROL_HOST}:{CONTROL_PORT})")

    def _poll_until_stopped(self) -> None:
        try:
            while not self.stop_event.wait(POLL_SECONDS):
                self.last_snapshot = self.host.snapshot()
                self._write_status()
        except KeyboardInterrupt:
            self.stop_event.set()

    def _shutdown(self) -> None:
        self._stop_relay()
        if self.control:
            self.control.shutdown()
            self.control.server_close()
        if self.control_thread:
            self.control_thread.join(timeout=3)
        self.last_snapshot = {**self.host.snapshot(), "state": "STOPPED"}
        self._write_status()
        self.governor.close()


def request_control(command: str, data_dir: Path) -> int:
    token_path = data_dir / "control.token"
    try:
        token = token_path.read_text(encoding="utf-8").strip()
    except OSError:
        print("Nó Zero ainda não foi iniciado nesta conta.", file=sys.stderr)
        return 1
    headers = {"X-Vox-Node-Token": token}
    request = urllib.request.Request(
        f"http://{CONTROL_HOST}:{CONTROL_PORT}/api/{command}",
        headers=headers,
        method="POST",
        data=b"{}",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            print(response.read().decode("utf-8"))
        return 0
    except (OSError, urllib.error.URLError) as error:
        print(f"Nó Zero não respondeu no controle local: {error}", file=sys.stderr)
        return 1


def request_config(values: dict, data_dir: Path) -> int:
    try:
        token = (data_dir / "control.token").read_text(encoding="utf-8").strip()
        payload = json.dumps(validate_node_config(values)).encode("utf-8")
    except (OSError, ValueError, TypeError) as error:
        print(f"Preferências inválidas: {error}", file=sys.stderr)
        return 1
    request = urllib.request.Request(
        f"http://{CONTROL_HOST}:{CONTROL_PORT}/api/config",
        headers={
            "X-Vox-Node-Token": token,
            "Content-Type": "application/json",
        },
        method="POST",
        data=payload,
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            print(response.read().decode("utf-8"))
        return 0
    except (OSError, urllib.error.URLError) as error:
        print(f"Controle local indisponível: {error}", file=sys.stderr)
        return 1


def start_background(data_dir: Path) -> int:
    data_dir.mkdir(parents=True, exist_ok=True)
    if control_is_running():
        print("Nó Zero já está ativo.")
        return 0
    log_path = data_dir / "node-zero.log"
    flags = (
        getattr(subprocess, "DETACHED_PROCESS", 0)
        | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    )
    breakaway_flags = flags | getattr(subprocess, "CREATE_BREAKAWAY_FROM_JOB", 0x01000000)
    with log_path.open("a", encoding="utf-8") as log_file:
        process = _spawn_detached(log_file, breakaway_flags, flags)
    print(f"Nó Zero iniciado em segundo plano; PID={process.pid}")
    return 0


def _spawn_detached(log_file, preferred_flags: int, fallback_flags: int):
    if getattr(sys, "frozen", False):
        command = [sys.executable, "--node-service"]
        working_dir = Path(sys.executable).resolve().parent
    else:
        command = [sys.executable, str(Path(__file__).resolve()), "start"]
        working_dir = Path(__file__).resolve().parents[2]
    options = {
        "cwd": working_dir,
        "stdin": subprocess.DEVNULL,
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
        "close_fds": True,
    }
    try:
        return subprocess.Popen(command, creationflags=preferred_flags, **options)
    except OSError:
        return subprocess.Popen(command, creationflags=fallback_flags, **options)


def control_is_running() -> bool:
    try:
        with urllib.request.urlopen(
            f"http://{CONTROL_HOST}:{CONTROL_PORT}/api/status", timeout=1
        ) as response:
            payload = json.loads(response.read())
            return payload.get("app") == APP_NAME
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return False


def print_status(data_dir: Path) -> int:
    request = urllib.request.Request(f"http://{CONTROL_HOST}:{CONTROL_PORT}/api/status")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            print(json.dumps(json.loads(response.read()), indent=2, ensure_ascii=False))
        return 0
    except (OSError, urllib.error.URLError):
        status_path = data_dir / "status.json"
        if status_path.exists():
            print(json.dumps(json.loads(status_path.read_text(encoding="utf-8")), indent=2, ensure_ascii=False))
            print("Controle local indisponível; status acima é a última amostra salva.")
            return 1
        print("Nó Zero ainda não foi iniciado.")
        return 1


def check_relay_health() -> int:
    try:
        with urllib.request.urlopen(
            f"http://{RELAY_HOST}:{RELAY_PORT}/health", timeout=3
        ) as response:
            payload = json.loads(response.read())
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0 if payload.get("status") == "ok" else 1
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"Relay local indisponível: {error}", file=sys.stderr)
        return 1


def parse_args():
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument(
        "command",
        choices=("start", "status", "health", "pause", "resume", "stop"),
    )
    parser.add_argument("--background", action="store_true", help="Inicia um processo local oculto")
    parser.add_argument("--data-dir", type=Path, default=app_data_dir())
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_dir = args.data_dir.resolve()
    if args.command == "start":
        if os.name != "nt":
            print("O Nó Zero para Windows só pode ser iniciado no Windows.", file=sys.stderr)
            return 2
        return start_background(data_dir) if args.background else NodeZero(data_dir).run()
    if args.command == "status":
        return print_status(data_dir)
    if args.command == "health":
        return check_relay_health()
    if args.command in ("pause", "resume", "stop"):
        return request_control(args.command, data_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
