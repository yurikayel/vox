"""Cofre na memória central: save_vault grava e get_vault lê (regressão do NameError _atomic_write)."""

import tempfile
import unittest
from pathlib import Path

from relay import central_memory


class TestCentralMemoryVault(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._previous = central_memory.MEMORY_DIR
        central_memory.set_memory_dir(Path(self._tmp.name) / "mem")

    def tearDown(self):
        central_memory.set_memory_dir(self._previous)
        self._tmp.cleanup()

    def test_save_then_get_vault_roundtrip(self):
        payload = {"record": {"ciphertext": "abc", "salt": "xyz"}}
        self.assertTrue(central_memory.save_vault("vaultkey123", payload))
        self.assertEqual(central_memory.get_vault("vaultkey123"), {"ciphertext": "abc", "salt": "xyz"})

    def test_save_vault_rejects_invalid_key_and_empty_payload(self):
        self.assertFalse(central_memory.save_vault("../fora", {"record": {"a": 1}}))
        self.assertFalse(central_memory.save_vault("vaultkey123", None))


if __name__ == "__main__":
    unittest.main()
