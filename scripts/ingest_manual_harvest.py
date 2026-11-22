"""Ingere imagens da caixa manual e renumeria harvest folders.

Uso:
  python scripts/ingest_manual_harvest.py
  python scripts/ingest_manual_harvest.py --inbox %USERPROFILE%\\Downloads\\stitch-harvest-inbox

Espera subpastas `{platform}/{slug}/` ou `{platform}-{slug}/` com PNG/JPG/WEBP.
"""

from __future__ import annotations

import argparse
import datetime as dt
import shutil
from pathlib import Path

import yaml

_ROOT = Path(__file__).resolve().parents[1]
_HARVEST = _ROOT / "docs" / "design" / "stitch-captures" / "google-images-harvest"
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in _IMG_EXTS)


def _resolve_target(name: str) -> tuple[str, str] | None:
    parts = name.replace("\\", "/").strip("/").split("/")
    if len(parts) >= 2:
        return parts[0], parts[1]
    if "-" in name:
        plat, slug = name.split("-", 1)
        return plat, slug
    return None


def _renumber(dest: Path, sources: list[Path]) -> list[dict]:
    dest.mkdir(parents=True, exist_ok=True)
    for old in _list_images(dest):
        old.unlink(missing_ok=True)
    rows: list[dict] = []
    for idx, src in enumerate(sources, start=1):
        ext = src.suffix.lower() if src.suffix else ".png"
        out = dest / f"{idx:02d}{ext}"
        shutil.copy2(src, out)
        rows.append({"file": out.name, "source_file": str(src), "relevance_note": "manual_pick"})
    return rows


def ingest_inbox(inbox: Path) -> dict:
    summary = {"ingested": 0, "queries": 0, "skipped": []}
    if not inbox.is_dir():
        raise FileNotFoundError(f"inbox não encontrada: {inbox}")
    for child in sorted(inbox.iterdir()):
        if not child.is_dir():
            continue
        resolved = _resolve_target(child.name)
        if not resolved:
            summary["skipped"].append(child.name)
            continue
        platform, slug = resolved
        images = _list_images(child)
        if not images:
            continue
        dest = _HARVEST / platform / slug
        manifest_images = _renumber(dest, images)
        payload = {
            "platform": platform,
            "slug": slug,
            "source": "google-images-manual",
            "search_engine": "google",
            "fetched_at": dt.date.today().isoformat(),
            "status": "ok" if len(manifest_images) >= 12 else "partial",
            "count": len(manifest_images),
            "images": manifest_images,
        }
        (dest / "MANIFEST.yaml").write_text(
            yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
        summary["ingested"] += len(manifest_images)
        summary["queries"] += 1
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest manual stitch harvest inbox.")
    default_inbox = Path.home() / "Downloads" / "stitch-harvest-inbox"
    parser.add_argument("--inbox", type=Path, default=default_inbox)
    args = parser.parse_args()
    summary = ingest_inbox(args.inbox)
    print(
        f"queries={summary['queries']} images={summary['ingested']} "
        f"skipped={summary['skipped']}"
    )
    return 0 if summary["queries"] else 1


if __name__ == "__main__":
    raise SystemExit(main())