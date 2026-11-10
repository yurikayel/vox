"""Cofre na memória central: grava e lê (regressão do NameError _atomic_write) e, desde o PM-90,
só aceita e serve cofre v2 ou a marca de revogado."""

import json
import tempfile
import unittest
from pathlib import Path

from relay import central_memory, vault_store

V2_RECORD = {"v": 2, "kdf": "pbkdf2-sha256", "iter": 600000, "salt": "ab" * 16, "iv": "cd" * 12, "ciphertext": "ef"}


class TestCentralMemoryVault(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._previous = central_memory.MEMORY_DIR
        central_memory.set_memory_dir(Path(self._tmp.name) / "mem")

    def tearDown(self):
        central_memory.set_memory_dir(self._previous)
        self._tmp.cleanup()

    def test_save_then_get_vault_roundtrip(self):
        self.assertTrue(vault_store.save_vault("vaultkey123", {"record": V2_RECORD}))
        self.assertEqual(vault_store.get_vault("vaultkey123"), V2_RECORD)

    def test_save_vault_rejects_invalid_key_and_empty_payload(self):
        self.assertFalse(vault_store.save_vault("../fora", {"record": V2_RECORD}))
        self.assertFalse(vault_store.save_vault("vaultkey123", None))

    def test_save_vault_rejects_legacy_format(self):
        self.assertFalse(vault_store.save_vault("vaultkey123", {"record": {"iv": "aa", "ciphertext": "bb"}}))
        weak = dict(V2_RECORD, iter=1000)
        self.assertFalse(vault_store.save_vault("vaultkey123", {"record": weak}))
        self.assertIsNone(vault_store.get_vault("vaultkey123"))

    def test_revoked_marker_replaces_record(self):
        self.assertTrue(vault_store.save_vault("vaultkey123", {"record": V2_RECORD}))
        marker = {"v": 1, "revoked": True, "updatedAt": 1}
        self.assertTrue(vault_store.save_vault("vaultkey123", {"record": marker}))
        self.assertEqual(vault_store.get_vault("vaultkey123"), marker)

    def test_legacy_record_on_disk_is_not_served(self):
        vaults = central_memory.MEMORY_DIR / "vaults"
        vaults.mkdir(parents=True, exist_ok=True)
        (vaults / "legacykey1.json").write_text(json.dumps({"iv": "aa", "ciphertext": "bb"}), encoding="utf-8")
        self.assertIsNone(vault_store.get_vault("legacykey1"))
        self.assertTrue((vaults / "legacykey1.json").is_file(), "o arquivo fica no disco")


if __name__ == "__main__":
    unittest.main()
