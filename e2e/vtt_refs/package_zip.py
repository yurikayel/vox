"""Empacota pastas v3 e boards em ZIP."""

from __future__ import annotations

import zipfile
from pathlib import Path


def zip_dir(src: Path, zip_path: Path) -> int:
    count = 0
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in src.rglob("*"):
            if path.is_file():
                arc = f"{src.name}/{path.relative_to(src).as_posix()}"
                zf.write(path, arcname=arc)
                if path.suffix.lower() == ".png":
                    count += 1
    return count