#!/usr/bin/env python3
"""Verifica PNG citados em STITCH-MESA-GUIA.md (apenas capturas dungeon-ui próprias)."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "docs" / "design" / "stitch-captures"
GUIDE = CAPTURES / "STITCH-MESA-GUIA.md"


def main() -> int:
    text = GUIDE.read_text(encoding="utf-8")
    block = text.split("## 3. Prompts Stitch", 1)[-1]
    pngs = re.findall(r"`([^`]*\.png)`", block)
    pngs = [
        p
        for p in pngs
        if p.startswith("dungeon-ui-") and "*" not in p and "{" not in p
    ]
    missing = [p for p in pngs if not (CAPTURES / p).is_file()]
    if missing:
        for m in missing:
            print(f"MISSING {m}", file=sys.stderr)
        return 1
    print(f"OK {len(pngs)} png refs", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
