"""Verifica integridade manifest v2, disco, ZIP e citações em Markdown."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

import yaml

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from e2e.vtt_refs.manifest import load_manifest
from e2e.vtt_refs.paths import BOARDS_DIR, CAPTURES, ROOT, V2_DIR, V3_DIR

PNG_REF = re.compile(
    r"(?:roll20|owlbear|foundry|minikraken)/[\w\-]+\.png",
    re.I,
)


def _manifest_files(entries: list[dict]) -> list[str]:
    return [str(e.get("filename", "")) for e in entries if e.get("filename")]


def _disk_pngs(folder: Path) -> set[str]:
    if not folder.is_dir():
        return set()
    return {
        str(p.relative_to(folder)).replace("\\", "/")
        for p in folder.rglob("*.png")
    }


def _zip_pngs(zip_path: Path) -> set[str]:
    if not zip_path.is_file():
        return set()
    with zipfile.ZipFile(zip_path) as zf:
        return {n for n in zf.namelist() if n.lower().endswith(".png")}


def _md_cited_pngs(paths: list[Path]) -> set[str]:
    cited: set[str] = set()
    for md in paths:
        if not md.is_file():
            continue
        text = md.read_text(encoding="utf-8", errors="replace")
        cited.update(PNG_REF.findall(text))
    return cited


def build_report(
    *,
    v2_dir: Path,
    v3_dir: Path,
    boards_dir: Path,
    strict_v3: bool = False,
) -> dict:
    _, entries = load_manifest()
    manifest_names = _manifest_files(entries)
    v2_set = _disk_pngs(v2_dir)
    missing = sorted(set(manifest_names) - v2_set)
    extra = sorted(v2_set - set(manifest_names))

    zips = list(CAPTURES.glob("*.zip"))
    zip_status = {z.name: len(_zip_pngs(z)) for z in zips}

    md_files = [
        CAPTURES / "OWLBEAR-STITCH-DOSSIER.md",
        CAPTURES / "STITCH-MESA-GUIA.md",
        ROOT / "docs" / "design" / "stitch-mesa-vtt-references.md",
    ]
    cited = _md_cited_pngs(md_files)
    cited_missing = sorted(c for c in cited if not (v2_dir / Path(c)).is_file())

    inv_path = v3_dir / "inventory.json"
    inventory_count = 0
    if inv_path.is_file():
        inventory_count = len(json.loads(inv_path.read_text(encoding="utf-8")))

    ok = True
    if not strict_v3 and missing:
        ok = False
    if cited_missing:
        ok = False
    if strict_v3 and not (v3_dir / "inventory.json").is_file():
        ok = False

    return {
        "manifest_entries": len(entries),
        "v2_disk_png": len(v2_set),
        "v2_missing_from_disk": missing,
        "v2_extra_on_disk": extra,
        "zip_files": zip_status,
        "md_cited_missing_on_v2": cited_missing,
        "v3_inventory_items": inventory_count,
        "boards_dir_exists": boards_dir.is_dir(),
        "ok": ok,
    }


def write_report(report: dict, out_path: Path) -> None:
    lines = [
        "# VTT refs verify",
        "",
        f"- manifest entries: **{report['manifest_entries']}**",
        f"- v2 disk PNG: **{report['v2_disk_png']}**",
        f"- v2 missing: **{len(report['v2_missing_from_disk'])}**",
        f"- md cited missing: **{len(report['md_cited_missing_on_v2'])}**",
        f"- v3 inventory: **{report['v3_inventory_items']}**",
        f"- status: **{'PASS' if report['ok'] else 'FAIL'}**",
        "",
    ]
    if report["v2_missing_from_disk"][:30]:
        lines.append("## Missing (sample)")
        lines.extend(f"- `{x}`" for x in report["v2_missing_from_disk"][:30])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    (out_path.parent / "verify.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Verifica refs VTT")
    parser.add_argument("--strict-v3", action="store_true")
    parser.add_argument("--output", type=Path, default=V3_DIR / "VERIFY.md")
    args = parser.parse_args()
    report = build_report(v2_dir=V2_DIR, v3_dir=V3_DIR, boards_dir=BOARDS_DIR, strict_v3=args.strict_v3)
    write_report(report, args.output)
    slim = {k: report[k] for k in report if k not in ("v2_missing_from_disk", "v2_extra_on_disk")}
    print(json.dumps(slim, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())