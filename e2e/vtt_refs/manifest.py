"""Carrega entradas do manifest v2."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from e2e.vtt_refs.paths import MANIFEST_V2


def load_manifest(path: Path | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest_path = path or MANIFEST_V2
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    defaults = data.get("defaults") or {}
    entries = list(data.get("entries") or [])
    return defaults, entries


def filter_by_only(entries: list[dict[str, Any]], only: str | None) -> list[dict[str, Any]]:
    """`--only owlbear` ou prefixo de id."""
    if not only:
        return entries
    platforms = ("roll20", "owlbear", "foundry", "minikraken")
    if only in platforms:
        return [e for e in entries if e.get("platform") == only]
    return [e for e in entries if str(e.get("id", "")).startswith(only)]