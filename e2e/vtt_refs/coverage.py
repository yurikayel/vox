"""Cruza queries Google (TSV) com seleção v3."""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any

from e2e.vtt_refs.paths import QUERIES_TSV, V3_DIR

TOPIC_TO_FEATURE = [
    (re.compile(r"journal|handout|obsidian|chat", re.I), "journal_handouts"),
    (re.compile(r"token|npc", re.I), "tokens_layers"),
    (re.compile(r"fog|light|vision", re.I), "fog_visibility"),
    (re.compile(r"grid|hex|isometric", re.I), "toolbar_tactical"),
    (re.compile(r"layer|prop|prefab", re.I), "tokens_layers"),
    (re.compile(r"scene|map", re.I), "session_map_gm"),
    (re.compile(r"sheet|character", re.I), "character_sheet"),
    (re.compile(r"dice|roll", re.I), "dice_tray"),
    (re.compile(r"initiative|combat|tracker", re.I), "initiative_combat"),
    (re.compile(r"mobile|dock|app", re.I), "mobile_or_dock"),
    (re.compile(r"hub|campaign|room", re.I), "hub_campaign"),
    (re.compile(r"player", re.I), "session_map_player"),
    (re.compile(r"update", re.I), "hub_campaign"),
]


def _map_query(q: str) -> str:
    for pattern, fid in TOPIC_TO_FEATURE:
        if pattern.search(q):
            return fid
    return "session_map_gm"


def load_queries(tsv: Path) -> list[dict[str, str]]:
    if not tsv.is_file():
        return []
    rows: list[dict[str, str]] = []
    with tsv.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            rows.append(row)
    return rows


def write_coverage(
    queries: list[dict[str, str]],
    selection: dict[str, list[dict[str, str]]],
    out_path: Path,
) -> None:
    lines = ["# COVERAGE — Google queries × v3 selection", "", "| platform | query | feature_id | refs |", "|---|---|---|---|"]
    for row in queries:
        q = row.get("q") or row.get("query") or ""
        plat = row.get("platform", "")
        fid = _map_query(q)
        refs = selection.get(fid, [])
        ref_note = f"{len(refs)} sel" if refs else "**gap**"
        short_q = q[:60].replace("|", "/")
        lines.append(f"| {plat} | {short_q} | `{fid}` | {ref_note} |")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")