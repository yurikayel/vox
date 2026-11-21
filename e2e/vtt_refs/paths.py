"""Raízes e caminhos do pipeline refs v3."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CAPTURES = ROOT / "docs" / "design" / "stitch-captures"
MANIFEST_V2 = CAPTURES / "vtt-reference-manifest-v2.yaml"
V2_DIR = CAPTURES / "vtt-references-full-2026-11-20"
STAMP = "2026-11-20"
V3_DIR = CAPTURES / f"vtt-references-v3-{STAMP}"
BOARDS_DIR = CAPTURES / f"stitch-boards-{STAMP}"
QUERIES_TSV = CAPTURES / "google-images-harvest" / "queries-all.tsv"
SOVEREIGN = ROOT / "docs" / "design" / "sovereign-agora.md"


def stamp_today() -> str:
    return dt.date.today().isoformat()