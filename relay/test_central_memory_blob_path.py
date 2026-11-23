#!/usr/bin/env python3
"""
test_central_memory_blob_path.py — O arquivo de um blob só é lido/escrito dentro de `blobs/`.

Cobre `py/path-injection` (CodeQL): o caminho do blob passa por `safe_path.child_of`, que
resolve symlink e recusa o que aponta para fora da pasta.
"""

import hashlib
import tempfile
import unittest
from pathlib import Path

from relay import central_memory


class BlobPathTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._old = central_memory.MEMORY_DIR
        central_memory.set_memory_dir(Path(self._tmp.name) / "mem")
        self.addCleanup(central_memory.set_memory_dir, self._old)
        central_memory._ensure_dirs()

    def _link_blob_to(self, target: Path, blob_hash: str) -> None:
        link = central_memory.MEMORY_DIR / "blobs" / f"{blob_hash}.json"
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):
            self.skipTest("symlink indisponível neste ambiente")

    def test_get_blob_ignores_symlink_pointing_outside(self):
        outside = Path(self._tmp.name) / "fora.json"
        outside.write_text('{"segredo": 1}', encoding="utf-8")
        blob_hash = hashlib.sha256(b"x").hexdigest()
        self._link_blob_to(outside, blob_hash)
        self.assertIsNone(central_memory.get_blob(blob_hash))

    def test_put_then_get_blob_roundtrip(self):
        data = "texto do blob"
        blob_hash = hashlib.sha256(data.encode("utf-8")).hexdigest()
        state = central_memory._empty_state()
        applied = central_memory._apply_blob(state, {"hash": blob_hash, "data": data})
        self.assertTrue(applied)
        self.assertEqual(central_memory.get_blob(blob_hash)["data"], data)


if __name__ == "__main__":
    unittest.main()
