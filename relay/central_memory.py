#!/usr/bin/env python3
"""
central_memory.py — Nó Zero-Central-Memory (Persistência Total de Estado Local)

Copia e persiste localmente todos os artefatos da malha Vox (posts, tópicos,
comunidades, respostas, ofertas, propostas, votos, cartões de perfil,
tombstones, manifestos de cache e blobs de mídia) com escrita atômica +
backup (.bak) + journal append-only para recuperação imediata pós-queda.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from relay import genesis_guard

HASH_HEX_REGEX = re.compile(r"^[0-9a-fA-F]{64}$")
SAFE_ID_REGEX = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
MAX_ITEM_BYTES = 512 * 1024
MAX_BLOB_BYTES = 2 * 1024 * 1024

_MEMORY_LOCK = threading.RLock()
_STATE_CACHE: Optional[Dict[str, Any]] = None


def resolve_memory_dir(env: Optional[Dict[str, str]] = None) -> Path:
    environ = env if env is not None else os.environ
    raw = str(environ.get("VOX_CENTRAL_MEMORY_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    base = str(environ.get("VOX_RELAY_CACHE_DIR") or "").strip()
    if base:
        return Path(base).resolve() / "central_memory"
    return Path(__file__).resolve().parent / ".central_memory"


MEMORY_DIR = resolve_memory_dir()


def set_memory_dir(path: Path) -> Path:
    global MEMORY_DIR, _STATE_CACHE
    with _MEMORY_LOCK:
        MEMORY_DIR = Path(path).resolve()
        _STATE_CACHE = None
        return MEMORY_DIR


def _empty_state() -> Dict[str, Any]:
    return {
        "version": 1,
        "mode": "zero-central-memory",
        "revision": 0,
        "updatedAt": int(time.time() * 1000),
        "posts": {},
        "tombstones": {},
        "profiles": {},
        "manifests": {},
        "blobs": {},
    }


def _state_paths() -> tuple[Path, Path, Path, Path]:
    base = MEMORY_DIR
    return (
        base / "state.json",
        base / "state.json.bak",
        base / "events.jsonl",
        base / "blobs",
    )


def _ensure_dirs() -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    (MEMORY_DIR / "blobs").mkdir(parents=True, exist_ok=True)


def _atomic_write_bytes(target: Path, data: bytes) -> None:
    _ensure_dirs()
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=target.parent, prefix=".mem-", suffix=".tmp", delete=False
        ) as tmp:
            tmp.write(data)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp_path = Path(tmp.name)
        os.replace(tmp_path, target)
    finally:
        if tmp_path and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def _read_json_file(path: Path) -> Optional[Dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _normalize_loaded_state(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    state = _empty_state()
    if not isinstance(raw, dict):
        return state
    state["revision"] = int(raw.get("revision") or 0)
    state["updatedAt"] = int(raw.get("updatedAt") or state["updatedAt"])
    for key in ("posts", "tombstones", "profiles", "manifests", "blobs"):
        val = raw.get(key)
        if isinstance(val, dict):
            state[key] = dict(val)
    profiles = state.get("profiles")
    if isinstance(profiles, dict):
        seen_google = set()
        to_del = []
        for r_id, p in profiles.items():
            if isinstance(p, dict):
                av = str(p.get("avatarUrl") or "")
                if "lh3.googleusercontent.com/a/" in av:
                    if av in seen_google:
                        to_del.append(r_id)
                    else:
                        seen_google.add(av)
        for r_id in to_del:
            del profiles[r_id]
    if genesis_guard.prune_state(state) > 0:
        state["revision"] += 1
    return state


def _replay_journal(state: Dict[str, Any], journal_path: Path) -> bool:
    if not journal_path.is_file():
        return False
    replayed = False
    try:
        lines = journal_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return False
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
            if _apply_event_to_state(state, event):
                replayed = True
        except json.JSONDecodeError:
            continue
    return replayed


def load_state(force_reload: bool = False) -> Dict[str, Any]:
    global _STATE_CACHE
    with _MEMORY_LOCK:
        if _STATE_CACHE is not None and not force_reload:
            return _STATE_CACHE
        state_file, bak_file, journal_file, _ = _state_paths()
        raw = _read_json_file(state_file)
        used_backup = False
        if raw is None and bak_file.is_file():
            raw = _read_json_file(bak_file)
            used_backup = raw is not None
        state = _normalize_loaded_state(raw)
        replayed = _replay_journal(state, journal_file)
        _STATE_CACHE = state
        if used_backup or replayed:
            save_state()
        return _STATE_CACHE


def _append_journal(event: Dict[str, Any]) -> None:
    _ensure_dirs()
    _, _, journal_file, _ = _state_paths()
    line = json.dumps(event, ensure_ascii=False) + "\n"
    try:
        with journal_file.open("a", encoding="utf-8") as f:
            f.write(line)
            f.flush()
            os.fsync(f.fileno())
    except OSError:
        pass


def save_state() -> Dict[str, Any]:
    with _MEMORY_LOCK:
        state = load_state()
        state["updatedAt"] = int(time.time() * 1000)
        state_file, bak_file, journal_file, _ = _state_paths()
        encoded = json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8")
        if state_file.is_file():
            try:
                _atomic_write_bytes(bak_file, state_file.read_bytes())
            except OSError:
                pass
        _atomic_write_bytes(state_file, encoded)
        if journal_file.is_file():
            try:
                journal_file.unlink(missing_ok=True)
            except OSError:
                pass
        return state


def _item_timestamp(item: Dict[str, Any]) -> int:
    for field in ("editedAt", "ts", "timestamp", "createdAt"):
        val = item.get(field)
        if isinstance(val, (int, float)) and val > 0:
            return int(val)
    return 0


def _is_valid_id(raw_id: Any) -> bool:
    return isinstance(raw_id, str) and bool(SAFE_ID_REGEX.match(raw_id.strip()))


def _apply_post(state: Dict[str, Any], item: Dict[str, Any]) -> bool:
    if not isinstance(item, dict):
        return False
    item_id = str(item.get("id") or "").strip()
    if not _is_valid_id(item_id):
        return False
    if item.get("type") in ("tombstone", "post-tombstone") or item.get("kind") == "post-tombstone":
        return _apply_tombstone(state, item)
    if item.get("type") == "profile-card":
        return _apply_profile(state, item)
    if item.get("type") == "cache-manifest":
        return _apply_manifest(state, item)
    if genesis_guard.refuses_post(item):
        return False

    incoming_ts = _item_timestamp(item)
    tomb = state["tombstones"].get(item_id)
    if isinstance(tomb, dict) and _item_timestamp(tomb) >= incoming_ts > 0:
        return False

    existing = state["posts"].get(item_id)
    if isinstance(existing, dict):
        ex_author = str(existing.get("author") or existing.get("owner") or "")
        in_author = str(item.get("author") or item.get("owner") or "")
        if ex_author and in_author and ex_author != in_author:
            return False
        if _item_timestamp(existing) > incoming_ts:
            return False
        if existing == item:
            return False

    state["posts"][item_id] = item
    state["revision"] += 1
    return True


def _apply_tombstone(state: Dict[str, Any], tombstone: Dict[str, Any]) -> bool:
    if not isinstance(tombstone, dict):
        return False
    item_id = str(tombstone.get("id") or "").strip()
    if not _is_valid_id(item_id):
        return False
    del_ts = _item_timestamp(tombstone) or int(time.time() * 1000)
    existing_post = state["posts"].get(item_id)
    if isinstance(existing_post, dict):
        ex_author = str(existing_post.get("author") or "")
        tomb_author = str(tombstone.get("author") or "")
        if ex_author and tomb_author and ex_author != tomb_author:
            return False
        if del_ts < _item_timestamp(existing_post):
            return False

    existing_tomb = state["tombstones"].get(item_id)
    if isinstance(existing_tomb, dict) and _item_timestamp(existing_tomb) >= del_ts:
        return False

    normalized = {**tombstone, "id": item_id, "type": "tombstone", "editedAt": del_ts}
    state["tombstones"][item_id] = normalized
    state["posts"].pop(item_id, None)
    state["revision"] += 1
    return True


def _apply_profile(state: Dict[str, Any], card: Dict[str, Any]) -> bool:
    if not isinstance(card, dict):
        return False
    route_id = str(card.get("author") or card.get("routeId") or card.get("id") or "").strip()
    if not _is_valid_id(route_id) or genesis_guard.refuses_profile(route_id):
        return False
    incoming_ts = _item_timestamp(card)
    existing = state["profiles"].get(route_id)
    if isinstance(existing, dict):
        if _item_timestamp(existing) > incoming_ts:
            return False
        if existing == card:
            return False
    in_avatar = str(card.get("avatarUrl") or "")
    if "lh3.googleusercontent.com/a/" in in_avatar:
        dup_keys = [
            k for k, v in state["profiles"].items()
            if k != route_id and isinstance(v, dict) and v.get("avatarUrl") == in_avatar
        ]
        for k in dup_keys:
            del state["profiles"][k]
    state["profiles"][route_id] = card
    state["revision"] += 1
    return True


def _apply_manifest(state: Dict[str, Any], manifest: Dict[str, Any]) -> bool:
    if not isinstance(manifest, dict):
        return False
    comm_id = str(manifest.get("communityId") or manifest.get("id") or "").strip()
    if not _is_valid_id(comm_id):
        return False
    incoming_ts = _item_timestamp(manifest)
    existing = state["manifests"].get(comm_id)
    if isinstance(existing, dict):
        if _item_timestamp(existing) > incoming_ts:
            return False
        if existing == manifest:
            return False
    state["manifests"][comm_id] = manifest
    state["revision"] += 1
    return True


def _apply_blob(state: Dict[str, Any], blob: Dict[str, Any]) -> bool:
    if not isinstance(blob, dict):
        return False
    blob_hash = str(blob.get("hash") or "").strip().lower()
    data = blob.get("data")
    if not HASH_HEX_REGEX.match(blob_hash) or not isinstance(data, str) or not data:
        return False
    raw_bytes = json.dumps(
        {
            "hash": blob_hash,
            "mime": str(blob.get("mime") or "application/octet-stream"),
            "byteLength": int(blob.get("byteLength") or len(data)),
            "data": data,
        },
        ensure_ascii=False,
    ).encode("utf-8")
    if len(raw_bytes) > MAX_BLOB_BYTES:
        return False

    _, _, _, blobs_dir = _state_paths()
    blob_file = blobs_dir / f"{blob_hash}.json"
    if blob_file.is_file() and blob_hash in state["blobs"]:
        return False
    _atomic_write_bytes(blob_file, raw_bytes)
    state["blobs"][blob_hash] = {
        "hash": blob_hash,
        "mime": str(blob.get("mime") or "application/octet-stream"),
        "byteLength": int(blob.get("byteLength") or len(data)),
        "storedAt": int(time.time() * 1000),
    }
    state["revision"] += 1
    return True


def get_blob(blob_hash: str) -> Optional[Dict[str, Any]]:
    clean = str(blob_hash or "").strip().lower()
    if not HASH_HEX_REGEX.match(clean):
        return None
    with _MEMORY_LOCK:
        _, _, _, blobs_dir = _state_paths()
        return _read_json_file(blobs_dir / f"{clean}.json")


def _apply_event_to_state(state: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    if not isinstance(payload, dict):
        return False
    etype = str(payload.get("type") or "").upper()
    if etype in ("GOSSIP", "GOSSIP_UPDATE") and isinstance(payload.get("item"), dict):
        return _apply_post(state, payload["item"])
    if etype == "GOSSIP_DELETE":
        target = payload.get("tombstone") or payload.get("item")
        return _apply_tombstone(state, target) if isinstance(target, dict) else False
    if etype in ("PROFILE_CARD_HELLO", "PROFILE_CARD"):
        card = payload.get("card") or payload.get("item") or payload
        return _apply_profile(state, card) if isinstance(card, dict) else False
    if etype == "CACHE_MANIFEST":
        manifest = payload.get("item") or payload.get("manifest") or payload
        return _apply_manifest(state, manifest) if isinstance(manifest, dict) else False
    if etype == "MEDIA_BLOB":
        blob = payload.get("blob") or payload
        return _apply_blob(state, blob) if isinstance(blob, dict) else False
    if "hash" in payload and "data" in payload:
        return _apply_blob(state, payload)
    if "id" in payload:
        return _apply_post(state, payload)
    return False


def ingest_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    with _MEMORY_LOCK:
        state = load_state()
        changed = _apply_event_to_state(state, payload)
        if changed:
            _append_journal(payload)
            save_state()
        return {
            "status": "saved" if changed else "unchanged",
            "changed": changed,
            "revision": state["revision"],
            "counts": _state_counts(state),
        }


def _ingest_collection(state: Dict[str, Any], items: Any, apply_fn) -> int:
    if not isinstance(items, list):
        return 0
    changed_count = 0
    for item in items:
        if isinstance(item, dict) and apply_fn(state, item):
            changed_count += 1
    return changed_count


def sync_bundle(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Payload de sincronização deve ser um objeto JSON")
    with _MEMORY_LOCK:
        state = load_state()
        client_rev = int(payload.get("clientRevision") or 0)
        changes = 0
        changes += _ingest_collection(state, payload.get("tombstones"), _apply_tombstone)
        changes += _ingest_collection(state, payload.get("posts"), _apply_post)
        changes += _ingest_collection(state, payload.get("profiles"), _apply_profile)
        changes += _ingest_collection(state, payload.get("manifests"), _apply_manifest)
        changes += _ingest_collection(state, payload.get("blobs"), _apply_blob)
        if changes > 0:
            save_state()
        if changes == 0 and client_rev > 0 and client_rev == state["revision"]:
            return {
                "status": "ok",
                "mode": "zero-central-memory",
                "upToDate": True,
                "revision": state["revision"],
                "updatedAt": state["updatedAt"],
                "ingestedCount": 0,
                "counts": _state_counts(state),
                "posts": [],
                "tombstones": [],
                "profiles": [],
                "manifests": [],
                "blobs": [],
            }
        since = int(payload.get("since") or 0)
        include_blobs = bool(payload.get("includeBlobs", True))
        raw_known = payload.get("knownBlobs")
        known_blobs = {str(h).strip().lower() for h in raw_known} if isinstance(raw_known, list) else set()
        exported = export_state(since=since, include_blobs=include_blobs, known_blobs=known_blobs)
        exported["ingestedCount"] = changes
        return exported


def _filter_since(mapping: Dict[str, Dict[str, Any]], since: int) -> List[Dict[str, Any]]:
    items = list(mapping.values())
    if since > 0:
        items = [it for it in items if _item_timestamp(it) >= since]
    items.sort(key=_item_timestamp)
    return items


def _load_blobs_for_export(
    state: Dict[str, Any], include_blobs: bool, known_blobs: Optional[set[str]] = None
) -> List[Dict[str, Any]]:
    excluded = known_blobs or set()
    if not include_blobs:
        return [v for k, v in state["blobs"].items() if k not in excluded]
    loaded = []
    for blob_hash in state["blobs"]:
        if blob_hash in excluded:
            continue
        blob_obj = get_blob(blob_hash)
        if blob_obj:
            loaded.append(blob_obj)
    return loaded


def _state_counts(state: Dict[str, Any]) -> Dict[str, int]:
    return {
        "posts": len(state["posts"]),
        "tombstones": len(state["tombstones"]),
        "profiles": len(state["profiles"]),
        "manifests": len(state["manifests"]),
        "blobs": len(state["blobs"]),
    }


def export_state(
    since: int = 0, include_blobs: bool = True, known_blobs: Optional[set[str]] = None
) -> Dict[str, Any]:
    with _MEMORY_LOCK:
        state = load_state()
        return {
            "status": "ok",
            "mode": "zero-central-memory",
            "revision": state["revision"],
            "updatedAt": state["updatedAt"],
            "memoryDir": str(MEMORY_DIR),
            "counts": _state_counts(state),
            "posts": _filter_since(state["posts"], since),
            "tombstones": _filter_since(state["tombstones"], since),
            "profiles": _filter_since(state["profiles"], since),
            "manifests": _filter_since(state["manifests"], since),
            "blobs": _load_blobs_for_export(state, include_blobs, known_blobs),
        }


def get_status_summary() -> Dict[str, Any]:
    with _MEMORY_LOCK:
        state = load_state()
        state_file, bak_file, _, _ = _state_paths()
        return {
            "status": "ok",
            "mode": "zero-central-memory",
            "revision": state["revision"],
            "updatedAt": state["updatedAt"],
            "memoryDir": str(MEMORY_DIR),
            "persistedOnDisk": state_file.is_file(),
            "backupOnDisk": bak_file.is_file(),
            "counts": _state_counts(state),
        }
