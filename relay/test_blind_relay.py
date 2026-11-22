#!/usr/bin/env python3
"""
test_blind_relay.py — Testes unitários do Nó Compartilhado / Relay Cego
"""

import tempfile
import unittest
from pathlib import Path

from relay import blind_relay


class TestBlindRelay(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.old_dir = blind_relay.RELAY_DIR
        blind_relay.set_relay_dir(Path(self.temp_dir.name))

    def tearDown(self):
        blind_relay.set_relay_dir(self.old_dir)
        self.temp_dir.cleanup()

    def test_store_and_list_envelopes(self):
        env1 = {
            "version": 1,
            "sender": "a" * 64,
            "audience": "b" * 64,
            "timestamp": 1000,
            "nonce": "1234",
            "payload": "dados_cifrados_1",
            "sig": "s" * 128,
        }
        env2 = {
            "version": 1,
            "sender": "a" * 64,
            "audience": "b" * 64,
            "timestamp": 2000,
            "nonce": "5678",
            "payload": "dados_cifrados_2",
            "sig": "s" * 128,
        }

        blind_relay.store_envelope("comunidade_teste", env1)
        blind_relay.store_envelope("comunidade_teste", env2)

        items = blind_relay.list_envelopes("comunidade_teste")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["timestamp"], 1000)
        self.assertEqual(items[1]["timestamp"], 2000)

        # Filtro since_ts
        items_since = blind_relay.list_envelopes("comunidade_teste", since_ts=1500)
        self.assertEqual(len(items_since), 1)
        self.assertEqual(items_since[0]["timestamp"], 2000)

    def test_reject_invalid_envelope(self):
        with self.assertRaises(ValueError):
            blind_relay.store_envelope("canal", {})

        with self.assertRaises(ValueError):
            blind_relay.store_envelope("canal", {"sender": "x"})

    def test_store_snapshot_and_prune_deltas(self):
        # Insere deltas anteriores
        for i in range(5):
            blind_relay.store_envelope(
                "comunidade_feira",
                {
                    "version": 1,
                    "sender": "vendedor" * 4,
                    "timestamp": 1000 + i * 100,
                    "serial": i + 1,
                    "nonce": f"nonce_{i}",
                    "sig": "assinatura" * 4,
                    "payload": f"item_{i}",
                },
            )

        self.assertEqual(len(blind_relay.list_envelopes("comunidade_feira")), 5)

        # Snapshot consolidado cobre os seriais 1..4 (a poda é por serial, não por timestamp)
        snapshot = {
            "epoch": 2,
            "timestamp": 1400,
            "coveredSerial": 4,
            "snapshot": "Y_STATE_CONSOLIDADO_V2_BASE64",
        }
        blind_relay.store_snapshot("comunidade_feira", snapshot, prune_older=True, proof="ab" * 32)

        latest = blind_relay.get_latest_snapshot("comunidade_feira")
        self.assertIsNotNone(latest)
        self.assertEqual(latest["epoch"], 2)
        self.assertEqual(latest["snapshot"], "Y_STATE_CONSOLIDADO_V2_BASE64")

        # Só o serial 5 (acima da cobertura) deve restar
        remaining = blind_relay.list_envelopes("comunidade_feira")
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0]["serial"], 5)


if __name__ == "__main__":
    unittest.main()
