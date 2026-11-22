"""Gera selection.yaml heurística (4–6 refs por feature_id)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

MAX_PER_FEATURE = 6
MIN_PER_FEATURE = 4


def _score(item: dict[str, Any]) -> float:
    w = int(item.get("width") or 800)
    h = int(item.get("height") or 600)
    area = w * h
    src = item.get("source", "")
    src_boost = {
        "doc-tile": 1.35,
        "legacy-v2-slice": 1.3,
        "legacy-v2": 1.15,
        "doc": 1.2,
        "doc-element": 1.2,
    }.get(src, 1.0 if src == "youtube" else 0.95)
    plat = item.get("platform", "")
    depth = {"foundry": 1.15, "minikraken": 1.12, "roll20": 1.05, "owlbear": 1.0}.get(plat, 1.0)
    return area * src_boost * depth


def pick_selection(inventory: list[dict[str, Any]]) -> dict[str, list[dict[str, str]]]:
    by_fid: dict[str, list[dict]] = {}
    for row in inventory:
        by_fid.setdefault(row["feature_id"], []).append(row)

    out: dict[str, list[dict[str, str]]] = {}
    for fid, rows in by_fid.items():
        rows.sort(key=_score, reverse=True)
        chosen: list[dict] = []
        platforms_seen: set[str] = set()
        for row in rows:
            if len(chosen) >= MAX_PER_FEATURE:
                break
            plat = row.get("platform", "")
            if plat in platforms_seen and len(chosen) >= MIN_PER_FEATURE:
                continue
            platforms_seen.add(plat)
            note = f"Copiar densidade {plat} — {row.get('source')}"
            chosen.append({
                "path": row["path"],
                "platform": plat,
                "note": note,
            })
        while len(chosen) < MIN_PER_FEATURE and len(chosen) < len(rows):
            for row in rows:
                if row["path"] in {c["path"] for c in chosen}:
                    continue
                chosen.append({
                    "path": row["path"],
                    "platform": row.get("platform", ""),
                    "note": "apoio",
                })
                if len(chosen) >= MIN_PER_FEATURE:
                    break
        out[fid] = chosen
    return out


def write_selection(selection: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        yaml.safe_dump({"selection": selection}, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )