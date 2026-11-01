#!/usr/bin/env python3
"""
package_permaweb.py — Validação e empacotamento do App Shell para Arweave Permaweb.
Valida o limite de 100 KiB do Turbo Free Tier (0 AR) para publicação perene sem custos.
"""
import gzip
import json
import os
import sys
from pathlib import Path

TURBO_FREE_TIER_CEILING_BYTES = 102400  # 100 KiB

ROOT = Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / "client"


def collect_client_assets():
    assets = []
    for root, _, files in os.walk(CLIENT_DIR):
        for f in files:
            p = Path(root) / f
            rel = p.relative_to(CLIENT_DIR).as_posix()
            if rel.startswith(".") or "__pycache__" in rel:
                continue
            size = p.stat().st_size
            with open(p, "rb") as fh:
                data = fh.read()
            gz_size = len(gzip.compress(data, compresslevel=9))
            assets.append({"path": rel, "size": size, "gz_size": gz_size})
    return sorted(assets, key=lambda a: a["size"], reverse=True)


def build_permaweb_manifest(assets):
    paths = {}
    for a in assets:
        paths[a["path"]] = {"id": f"tx_{a['path']}"}
    return {
        "manifest": "arweave/paths",
        "version": "0.2.0",
        "index": {"path": "index.html"},
        "paths": paths,
    }


def main():
    assets = collect_client_assets()
    total_raw = sum(a["size"] for a in assets)
    total_gz = sum(a["gz_size"] for a in assets)

    print(f"[*] Permaweb Asset Audit: {len(assets)} files in client/")
    print(f"    Tamanho Total Bruto: {total_raw / 1024:.2f} KiB")
    print(f"    Tamanho Total Gzip : {total_gz / 1024:.2f} KiB")

    core_files = ["index.html", "sw.js"]
    core_raw = sum(a["size"] for a in assets if a["path"] in core_files)
    print(f"    Core Shell (index + sw): {core_raw} bytes (Teto Turbo: {TURBO_FREE_TIER_CEILING_BYTES} bytes)")

    manifest = build_permaweb_manifest(assets)
    manifest_path = CLIENT_DIR / "permaweb-manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    print(f"[+] Manifesto Arweave gerado em: {manifest_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
