"""Cofre na memória central: grava e lê (regressão do NameError _atomic_write); desde o PM-90, só aceita e
serve cofre v2 ou a marca de revogado; desde o PM-94, só o dono (prova derivada da Senha Soberana) regrava."""

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from relay import central_memory, vault_store

OWNER = "a1" * 32
INTRUDER = "b2" * 32
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
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": V2_RECORD, "ownerToken": OWNER}), "saved")
        self.assertEqual(vault_store.get_vault("vaultkey123"), V2_RECORD, "a prova do dono não sai no GET")

    def test_save_vault_rejects_invalid_key_and_empty_payload(self):
        self.assertEqual(vault_store.save_vault("../fora", {"record": V2_RECORD, "ownerToken": OWNER}), "invalid")
        self.assertEqual(vault_store.save_vault("vaultkey123", None), "invalid")

    def test_save_vault_rejects_legacy_format(self):
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": {"iv": "aa", "ciphertext": "bb"}, "ownerToken": OWNER}), "invalid")
        weak = dict(V2_RECORD, iter=1000)
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": weak, "ownerToken": OWNER}), "invalid")
        self.assertIsNone(vault_store.get_vault("vaultkey123"))

    def test_pm94_v2_without_owner_proof_is_refused(self):
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": V2_RECORD}), "forbidden")
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": V2_RECORD, "ownerToken": "xyz"}), "invalid")
        self.assertIsNone(vault_store.get_vault("vaultkey123"))

    def test_pm94_only_the_owner_rewrites_or_revokes(self):
        vault_store.save_vault("vaultkey123", {"record": V2_RECORD, "ownerToken": OWNER})
        other = dict(V2_RECORD, ciphertext="99")
        marker = {"v": 1, "revoked": True, "updatedAt": 1}
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": other, "ownerToken": INTRUDER}), "forbidden")
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": marker}), "forbidden")
        self.assertEqual(vault_store.get_vault("vaultkey123"), V2_RECORD)
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": other, "ownerToken": OWNER.upper()}), "saved")
        self.assertEqual(vault_store.get_vault("vaultkey123"), other)

    def test_pm94_unowned_record_takes_the_first_owner(self):
        marker = {"v": 1, "revoked": True, "updatedAt": 1}
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": marker}), "saved", "revogar cofre antigo sem dono")
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": V2_RECORD, "ownerToken": OWNER}), "saved")
        self.assertEqual(vault_store.save_vault("vaultkey123", {"record": marker, "ownerToken": INTRUDER}), "forbidden")
        stored = json.loads((central_memory.MEMORY_DIR / "vaults" / "vaultkey123.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["ownerHash"], hashlib.sha256(bytes.fromhex(OWNER)).hexdigest())
        self.assertNotIn(OWNER, json.dumps(stored), "a prova em si não fica no disco")

    def test_legacy_record_on_disk_is_not_served(self):
        vaults = central_memory.MEMORY_DIR / "vaults"
        vaults.mkdir(parents=True, exist_ok=True)
        (vaults / "legacykey1.json").write_text(json.dumps({"iv": "aa", "ciphertext": "bb"}), encoding="utf-8")
        self.assertIsNone(vault_store.get_vault("legacykey1"))
        self.assertTrue((vaults / "legacykey1.json").is_file(), "o arquivo fica no disco")


if __name__ == "__main__":
    unittest.main()
