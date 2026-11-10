#!/usr/bin/env python3
"""
Vox Relay Desktop — Servidor proxy de cache e espelho local para o ecossistema Vox.
Roda em localhost (padrão 127.0.0.1:3920) e acelera consultas para clientes locais (PWA).
Dependências: Nenhuma (usa apenas a biblioteca padrão do Python 3).
"""

import argparse
import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from relay import blind_relay
from relay import oauth_exchange
from relay import central_memory
from relay import vault_store
from relay import inbox
from relay import mirror_validate
from relay import p2p_seeder
from relay import request_guard

DEFAULT_PORT = 3920
DEFAULT_HOST = "127.0.0.1"


def resolve_listen_port(env=None, default=DEFAULT_PORT):
    raw = str((env if env is not None else os.environ).get("VOX_RELAY_PORT") or "").strip()
    return int(raw) if raw.isdigit() else default


def resolve_cache_dir(env=None):
    raw = str((env if env is not None else os.environ).get("VOX_RELAY_CACHE_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    return Path(__file__).resolve().parent / ".cache"


CACHE_DIR = resolve_cache_dir()


def set_cache_dir(path):
    global CACHE_DIR
    CACHE_DIR = Path(path).resolve()
    if not str(os.environ.get("VOX_CENTRAL_MEMORY_DIR") or "").strip():
        central_memory.set_memory_dir(CACHE_DIR / "central_memory")
    return CACHE_DIR

UPSTREAM_GATEWAYS = [
    "https://arweave.net",
    "https://turbo-gateway.com/raw",
]

TX_ID_REGEX = re.compile(r"^[A-Za-z0-9_-]{43}$")
CACHE_HASH_SUFFIX = ".sha256"
INTEGRITY_FAILURES = 0
_CACHE_WRITE_LOCK = threading.RLock()

def ensure_cache_dir():
    with _CACHE_WRITE_LOCK:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        for sidecar in CACHE_DIR.glob(f"*{CACHE_HASH_SUFFIX}"):
            data_file = sidecar.with_name(sidecar.name[:-len(CACHE_HASH_SUFFIX)])
            if not data_file.is_file():
                try:
                    sidecar.unlink(missing_ok=True)
                except OSError:
                    pass

def count_cached_items():
    if not CACHE_DIR.exists():
        return 0
    return len([
        f for f in CACHE_DIR.glob("*")
        if f.is_file()
        and not f.name.startswith(("index_", ".vox-"))
        and not f.name.endswith(CACHE_HASH_SUFFIX)
    ])


def list_community_indexes():
    if not CACHE_DIR.exists():
        return []
    return sorted(
        f.stem.replace("index_", "", 1)
        for f in CACHE_DIR.glob("index_*.json")
        if f.is_file()
    )


def cache_dir_bytes():
    if not CACHE_DIR.exists():
        return 0
    total = 0
    for f in CACHE_DIR.glob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                pass
    return total


def max_cache_bytes():
    raw = os.environ.get("VOX_RELAY_MAX_CACHE_MB", "").strip()
    if not raw:
        return None
    try:
        return int(float(raw)) * 1024 * 1024
    except ValueError:
        return None


def cache_hash_path(cache_file):
    return cache_file.with_name(cache_file.name + CACHE_HASH_SUFFIX)


def atomic_write(path, content):
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=CACHE_DIR, prefix=".vox-", suffix=".tmp", delete=False) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, path)
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def write_cache_entry(cache_file, data):
    digest = hashlib.sha256(data).hexdigest().encode("ascii")
    try:
        atomic_write(cache_file, data)
        atomic_write(cache_hash_path(cache_file), digest)
    except Exception:
        remove_cache_entry(cache_file)
        raise


def remove_cache_entry(cache_file):
    for path in (cache_file, cache_hash_path(cache_file)):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

def _cache_file_identity(file_stat):
    return (
        file_stat.st_dev,
        file_stat.st_ino,
        file_stat.st_size,
        getattr(file_stat, "st_mtime_ns", None),
    )


def _read_stable_cache_file(path):
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    before = path.lstat()
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    if stat.S_ISLNK(before.st_mode) or getattr(before, "st_file_attributes", 0) & reparse_flag:
        raise OSError("cache path is a link or reparse point")
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or _cache_file_identity(before) != _cache_file_identity(opened):
            raise OSError("cache file changed during open")
        chunks = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        finished = os.fstat(descriptor)
        current_path = path.lstat()
        if (
            _cache_file_identity(opened) != _cache_file_identity(finished)
            or _cache_file_identity(finished) != _cache_file_identity(current_path)
        ):
            raise OSError("cache file changed during read")
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _is_allowed_cache_entry(cache_file, sidecar=False):
    try:
        path = Path(cache_file)
        resolved = path.resolve()
        cache_root = CACHE_DIR.resolve()
        return (
            path.parent.absolute() == CACHE_DIR.absolute()
            and resolved.parent == cache_root
            and resolved == path.absolute()
            and (sidecar or not path.name.endswith(CACHE_HASH_SUFFIX))
            and not path.name.startswith(".vox-")
        )
    except (OSError, RuntimeError, TypeError, ValueError):
        return False


def read_verified_cache_entry(cache_file):
    global INTEGRITY_FAILURES
    try:
        cache_file = Path(cache_file)
    except (TypeError, ValueError):
        INTEGRITY_FAILURES += 1
        return None
    if not _is_allowed_cache_entry(cache_file):
        INTEGRITY_FAILURES += 1
        return None
    try:
        data = _read_stable_cache_file(cache_file)
        hash_file = cache_hash_path(cache_file)
        if not _is_allowed_cache_entry(hash_file, sidecar=True):
            raise OSError("cache sidecar path is outside the cache root")
        expected = _read_stable_cache_file(hash_file).decode("ascii")
        actual = hashlib.sha256(data).hexdigest()
        if (
            len(expected) != 64
            or re.fullmatch(r"[0-9a-f]{64}", expected) is None
            or not hmac.compare_digest(expected, actual)
        ):
            INTEGRITY_FAILURES += 1
            remove_cache_entry(cache_file)
            return None
        os.utime(cache_file, None)
        return data
    except (OSError, UnicodeError, ValueError, TypeError):
        INTEGRITY_FAILURES += 1
        remove_cache_entry(cache_file)
        return None


def store_cache_entry_with_quota(cache_file, data):
    incoming_bytes = len(data) + len(hashlib.sha256(data).hexdigest())
    with _CACHE_WRITE_LOCK:
        ensure_cache_dir()
        hash_file = cache_hash_path(cache_file)
        existing_bytes = sum(
            path.stat().st_size
            for path in (cache_file, hash_file)
            if path.is_file()
        )
        additional_bytes = max(0, incoming_bytes - existing_bytes)
        evict_cache_if_needed(additional_bytes, protected_path=cache_file)
        limit = max_cache_bytes()
        if limit is not None and cache_dir_bytes() + additional_bytes > limit:
            return False
        write_cache_entry(cache_file, data)
        return True


def evict_cache_if_needed(incoming_bytes=0, protected_path=None):
    with _CACHE_WRITE_LOCK:
        max_b = max_cache_bytes()
        if max_b is None or not CACHE_DIR.exists():
            return
        current_bytes = cache_dir_bytes()
        if current_bytes + incoming_bytes <= max_b:
            return
        _evict_cache_entries(
            _cache_candidates(), current_bytes, incoming_bytes, max_b, protected_path
        )

def _cache_candidates():
    files = []
    for f in CACHE_DIR.glob("*"):
        if not f.is_file():
            continue
        try:
            if f.name.endswith(CACHE_HASH_SUFFIX):
                data_file = f.with_name(f.name[:-len(CACHE_HASH_SUFFIX)])
                if data_file.is_file():
                    continue
                files.append((f.stat().st_mtime, f.stat().st_size, f, None))
                continue
            hash_file = cache_hash_path(f)
            hash_size = hash_file.stat().st_size if hash_file.is_file() else 0
            files.append((f.stat().st_mtime, f.stat().st_size + hash_size, f, hash_file if hash_file.is_file() else None))
        except OSError:
            pass
    files.sort(key=lambda x: x[0])
    return files

def _evict_cache_entries(files, current_bytes, incoming_bytes, max_bytes, protected_path=None):
    for _, size, f, hash_file in files:
        if current_bytes + incoming_bytes <= max_bytes:
            break
        if protected_path is not None and f == protected_path:
            continue
        try:
            f.unlink()
            if hash_file:
                hash_file.unlink(missing_ok=True)
            current_bytes -= size
        except OSError:
            pass

class VoxRelayHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Vox-Delete-Token")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _rejected(self, method):
        """PM-94: Host, Origin, Content-Type e limite por IP (`request_guard`)."""
        reason = request_guard.reject_reason(method, self.headers, self.server.server_address[0], self.client_address[0])
        if reason:
            self._send_json({"error": reason[1]}, reason[0])
        return bool(reason)

    def _get_content_length(self):
        try:
            cl = int(self.headers.get("Content-Length", 0))
            return max(0, cl)
        except (ValueError, TypeError):
            return 0

    def do_OPTIONS(self):
        self.send_response(204)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self._rejected("GET"):
            return
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/health", ""):
            self._handle_health()
        elif path.startswith("/tx/"):
            self._handle_transaction(path[4:])
        elif path.startswith("/vox/index/") and path.endswith(".json"):
            self._handle_index(path[len("/vox/index/"):-5])
        elif path.startswith("/inbox/"):
            self._handle_inbox_get(path[len("/inbox/"):].split("/")[0])
        elif path.startswith("/relay/envelope/"):
            channel_id = path[len("/relay/envelope/"):].split("/")[0]
            since_ts = self._get_query_param_int("since", 0)
            since_serial = self._get_query_param_int("since_serial", 0)
            self._send_json(blind_relay.list_envelopes(channel_id, since_ts=since_ts, since_serial=since_serial))
        elif path.startswith("/relay/snapshot/"):
            channel_id = path[len("/relay/snapshot/"):].split("/")[0]
            snap = blind_relay.get_latest_snapshot(channel_id)
            if snap is not None:
                self._send_json(snap)
            else:
                self._reply_not_found(b"Snapshot nao encontrado")
        elif path.startswith("/memory"):
            self._handle_memory_get(path)
        elif path == "/p2p/status":
            self._send_json(p2p_seeder.get_p2p_summary())
        elif path == "/p2p/blobs":
            self._send_json({"seeds": p2p_seeder.SEEDER_MANAGER.list_seeds()})
        elif path.startswith("/p2p/seed/"):
            blob_hash = path[len("/p2p/seed/"):].split("/")[0]
            seed = p2p_seeder.SEEDER_MANAGER.get_seed(blob_hash)
            if seed:
                self._send_json(seed)
            else:
                self._reply_not_found(b"Seed P2P nao encontrado")
        elif path in ("/peer/beacon", "/p2p/peers"):
            self._send_json({"peers": p2p_seeder.PEER_DISCOVERY.list_peers()})
        else:
            self._reply_not_found(b"Rota nao encontrada no Vox Relay")

    def _handle_memory_get(self, path):
        if path in ("/memory", "/memory/status"):
            self._send_json(central_memory.get_status_summary())
            return
        if path == "/memory/state":
            since = self._get_query_param_int("since", 0)
            include_blobs = self._get_query_param_int("includeBlobs", 1) != 0
            self._send_json(central_memory.export_state(since=since, include_blobs=include_blobs))
            return
        if path.startswith("/memory/blob/"):
            blob = central_memory.get_blob(path[len("/memory/blob/"):].split("/")[0])
            if blob is not None:
                self._send_json(blob)
            else:
                self._reply_not_found(b"Blob nao encontrado na memoria central")
            return
        if path.startswith("/memory/vault/"):
            key = path[len("/memory/vault/"):].split("/")[0]
            rec = vault_store.get_vault(key)
            if rec is not None:
                self._send_json({"status": "ok", "vaultKey": key, "record": rec})
            else:
                self._reply_not_found(b"Vault nao encontrado")
            return
        self._reply_not_found(b"Rota de memoria nao encontrada")

    def _get_query_param_int(self, param_name, default=0):
        try:
            if "?" in self.path:
                query = self.path.split("?", 1)[1]
                for part in query.split("&"):
                    if part.startswith(f"{param_name}="):
                        return int(part.split("=", 1)[1])
        except (ValueError, IndexError):
            pass
        return default

    def _handle_health(self):
        self._send_json(self._health_payload())

    def _health_payload(self):
        indexes = list_community_indexes()
        return {
            "status": "ok",
            "app": "vox-relay",
            "version": "0.2.1",
            "cachedCount": count_cached_items(),
            "communityIndexes": indexes,
            "communityIndexCount": len(indexes),
            "cacheBytes": cache_dir_bytes(),
            "maxCacheBytes": max_cache_bytes(),
            "cacheDir": str(CACHE_DIR),
            "cacheIntegrity": {
                "algorithm": "sha256",
                "verifiedReads": True,
                "failures": INTEGRITY_FAILURES,
            },
            "centralMemory": central_memory.get_status_summary(),
            "p2p": p2p_seeder.get_p2p_summary(),
        }

    def _handle_transaction(self, tx_id):
        if not TX_ID_REGEX.match(tx_id):
            self._reply_not_found(b"TX ID invalido", 400)
            return

        ensure_cache_dir()
        cache_file = CACHE_DIR / tx_id
        data = read_verified_cache_entry(cache_file) if cache_file.is_file() else None
        if data is not None:
            self._reply_transaction(data, "HIT")
            return

        data = self._fetch_transaction(tx_id)
        if data is None:
            self._reply_not_found(b"Transacao nao encontrada nos gateways upstream")
            return
        self._cache_transaction(cache_file, data)
        self._reply_transaction(data, "MISS")

    def _fetch_transaction(self, tx_id):
        for gateway in UPSTREAM_GATEWAYS:
            try:
                request = urllib.request.Request(
                    f"{gateway}/{tx_id}", headers={"User-Agent": "VoxRelay/0.2"}
                )
                with urllib.request.urlopen(request, timeout=8) as response:
                    if response.status == 200:
                        return response.read()
            except Exception:
                continue
        return None

    def _cache_transaction(self, cache_file, data):
        try:
            store_cache_entry_with_quota(cache_file, data)
        except Exception:
            pass

    def _reply_transaction(self, data, cache_state):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Vox-Cache", cache_state)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(data)

    def _handle_index(self, comm_slug):
        ensure_cache_dir()
        index_file = CACHE_DIR / f"index_{comm_slug}.json"
        if index_file.is_file():
            data = read_verified_cache_entry(index_file)
            if data is not None:
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("X-Vox-Cache", "HIT")
                self._set_cors_headers()
                self.end_headers()
                self.wfile.write(data)
                return
        self._send_json({"error": "Espelho de comunidade nao encontrado"}, 404)

    def _handle_inbox_get(self, to_addr):
        self._send_json({"envelopes": inbox.get_envelopes(to_addr)})

    def _send_json(self, payload, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _reply_not_found(self, message=b"Rota nao encontrada no Vox Relay", status=404):
        self.send_response(status)
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(message)

    def do_POST(self):
        if self._rejected("POST"):
            return
        path = self.path.split("?")[0].rstrip("/")
        if path == "/vox/mirror":
            self._handle_mirror_post()
        elif path.startswith("/inbox/"):
            self._handle_inbox_post(path[len("/inbox/"):].split("/")[0])
        elif path.startswith("/relay/envelope/"):
            self._handle_blind_envelope_post(path[len("/relay/envelope/"):].split("/")[0])
        elif path.startswith("/relay/snapshot/"):
            self._handle_blind_snapshot_post(path[len("/relay/snapshot/"):].split("/")[0])
        elif path in ("/memory/ingest", "/memory/sync") or path.startswith("/memory/vault/"):
            self._handle_memory_post(path)
        elif path == "/peer/beacon":
            self._handle_peer_beacon_post()
        elif path == "/p2p/seed":
            self._handle_p2p_seed_post()
        elif path == "/oauth/exchange":
            self._handle_oauth_exchange_post()
        else:
            self._reply_not_found(b"")

    def _handle_oauth_exchange_post(self):
        """Código OAuth -> @usuário (o token da rede é descartado; nada é salvo)."""
        content_length = self._get_content_length()
        if content_length <= 0 or content_length > 8192:
            self._send_json({"error": "Payload inválido"}, 400)
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            self._send_json(oauth_exchange.exchange(payload), 200)
        except oauth_exchange.OAuthError as err:
            self._send_json({"error": str(err)}, err.status)
        except Exception:
            self._send_json({"error": "Falha ao concluir o login."}, 502)

    def _handle_memory_post(self, path):
        content_length = self._get_content_length()
        max_bytes = central_memory.MAX_BLOB_BYTES * 2
        if content_length <= 0 or content_length > max_bytes:
            status = 413 if content_length > max_bytes else 400
            self._reply_not_found(b"Payload invalido ou excede limite da memoria central", status)
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if path.startswith("/memory/vault/"):
                key = path[len("/memory/vault/"):].split("/")[0]
                status = vault_store.save_vault(key, payload)
                self._send_json({"status": status}, {"saved": 200, "forbidden": 403}.get(status, 400))
                return
            if path == "/memory/ingest":
                result = central_memory.ingest_event(payload)
                self._send_json(result, 201 if result.get("changed") else 200)
            else:
                self._send_json(central_memory.sync_bundle(payload), 200)
        except ValueError as err:
            self._send_json({"error": str(err)}, 400)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_blind_envelope_post(self, channel_id):
        content_length = self._get_content_length()
        if content_length > blind_relay.MAX_ENVELOPE_SIZE:
            self._reply_not_found(b"Envelope excede limite maximo de 64 KB", 413)
            return
        try:
            body = self.rfile.read(content_length)
            envelope = json.loads(body.decode("utf-8"))
            record = blind_relay.store_envelope(channel_id, envelope)
            self._send_json(record, 201)
        except ValueError as err:
            self._send_json({"error": str(err)}, 400)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_blind_snapshot_post(self, channel_id):
        content_length = self._get_content_length()
        if content_length > blind_relay.MAX_SNAPSHOT_SIZE:
            self._reply_not_found(b"Snapshot excede limite maximo de 512 KB", 413)
            return
        try:
            body = self.rfile.read(content_length)
            snap_data = json.loads(body.decode("utf-8"))
            record = blind_relay.store_snapshot(channel_id, snap_data, prune_older=True)
            self._send_json(record, 201)
        except ValueError as err:
            self._send_json({"error": str(err)}, 400)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_mirror_post(self):
        try:
            body = self.rfile.read(self._get_content_length())
        except Exception as error:
            self._send_json({"error": str(error)}, 500)
            return
        ok, payload, error, status = mirror_validate.validate_mirror_body(body)
        if not ok:
            self._send_json(error, status)
            return
        self._store_mirror(body, str(payload.get("communityId", "")).strip())

    def _store_mirror(self, body, comm_id):
        try:
            ensure_cache_dir()
            index_file = CACHE_DIR / f"index_{comm_id}.json"
            if not store_cache_entry_with_quota(index_file, body):
                self._send_json({"error": "quota de cache excedida"}, 507)
                return
            self._send_json({"status": "mirrored", "communityId": comm_id})
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_inbox_post(self, to_addr):
        content_length = self._get_content_length()
        if content_length > inbox.MAX_ENVELOPE_SIZE:
            self._reply_not_found(b"Envelope excede limite maximo de 32 KB", 413)
            return
        try:
            body = self.rfile.read(content_length)
            envelope = json.loads(body.decode("utf-8"))
            self._send_json(inbox.store_envelope(to_addr, envelope))
        except Exception as error:
            self._send_json({"error": str(error)}, 400)

    def _handle_peer_beacon_post(self):
        content_length = self._get_content_length()
        if content_length <= 0 or content_length > 16 * 1024:
            self._reply_not_found(b"Payload do beacon invalido", 400)
            return
        try:
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))
            record = p2p_seeder.PEER_DISCOVERY.register_peer(payload)
            self._send_json(record, 201)
        except ValueError as err:
            self._send_json({"error": str(err)}, 400)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def _handle_p2p_seed_post(self):
        content_length = self._get_content_length()
        if content_length <= 0 or content_length > 16 * 1024:
            self._reply_not_found(b"Payload de seed invalido", 400)
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            self._send_json(p2p_seeder.register_seed_request(payload, central_memory.get_blob), 201)
        except (ValueError, PermissionError) as err:
            self._send_json({"error": str(err)}, 400)
        except OverflowError as err:
            self._send_json({"error": str(err)}, 413)
        except Exception as error:
            self._send_json({"error": str(error)}, 500)

    def do_DELETE(self):
        if self._rejected("DELETE"):
            return
        path = self.path.split("?")[0].rstrip("/")
        if path.startswith("/p2p/seed/"):
            blob_hash = path[len("/p2p/seed/"):].split("/")[0]
            if p2p_seeder.SEEDER_MANAGER.unregister_blob_seed(blob_hash):
                self._send_json({"status": "unseeded", "hash": blob_hash}, 200)
            else:
                self._reply_not_found(b"Seed P2P nao encontrado")
            return
        if path.startswith("/inbox/"):
            parts = path[len("/inbox/"):].split("/")
            to_addr = parts[0] if len(parts) > 0 else ""
            msg_id = parts[1] if len(parts) > 1 else ""
            status = inbox.delete_envelope(to_addr, msg_id, self.headers.get("X-Vox-Delete-Token"))
            replies = {inbox.DELETED: 200, inbox.FORBIDDEN: 403}
            self._send_json({"status": status, "id": msg_id}, replies.get(status, 404))
            return

        self.send_response(404)
        self._set_cors_headers()
        self.end_headers()

def run_server(host=DEFAULT_HOST, port=DEFAULT_PORT):
    ensure_cache_dir()
    server_address = (host, port)
    httpd = HTTPServer(server_address, VoxRelayHandler)
    print("======================================================")
    print("  Vox Relay Desktop — Nó Local de Espelho & Cache")
    print(f"  Escutando em: http://{host}:{port}")
    print(f"  Verificação de status: http://{host}:{port}/health")
    print(f"  Diretório de cache: {CACHE_DIR}")
    print("  Pressione Ctrl+C para encerrar.")
    print("======================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando Vox Relay Desktop...")
        httpd.server_close()

if __name__ == "__main__":
    default_port = resolve_listen_port()
    parser = argparse.ArgumentParser(description="Vox Relay Desktop Server")
    parser.add_argument("--host", default=DEFAULT_HOST, help="Host/IP para escutar (padrão 127.0.0.1)")
    parser.add_argument("--bind", dest="host", help="Alias retrocompatível para --host")
    parser.add_argument("--port", type=int, default=default_port, help=f"Porta para escutar (padrão {default_port})")
    parser.add_argument("--cache-dir", default=None, help="Diretório de cache (sobrescreve VOX_RELAY_CACHE_DIR)")
    args = parser.parse_args()
    if args.cache_dir:
        os.environ["VOX_RELAY_CACHE_DIR"] = str(args.cache_dir)
        set_cache_dir(args.cache_dir)
    run_server(host=args.host, port=args.port)

