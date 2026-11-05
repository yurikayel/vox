#!/usr/bin/env python3
"""
test_p2p_seeder.py — Testes unitários do Seeder P2P e Descoberta Segura de Peers (Tarefas 6 & 7)
"""

import hashlib
import json
import time
import unittest
from relay import p2p_seeder


class TestP2PSeeder(unittest.TestCase):
    def setUp(self):
        self.seeder = p2p_seeder.P2PSeederManager(max_storage_bytes=1024 * 1024, max_seeds=5)

    def test_authorize_and_register_seed(self):
        valid_hash = hashlib.sha256(b"vox_test_payload_1").hexdigest()
        
        # Sem autorização na allowlist deve falhar
        with self.assertRaises(PermissionError):
            self.seeder.register_blob_seed(valid_hash, 1024, "image/jpeg")

        # Autoriza na allowlist
        self.assertTrue(self.seeder.authorize_hash(valid_hash))

        # Agora o registro deve suceder
        record = self.seeder.register_blob_seed(valid_hash, 2048, "image/jpeg")
        self.assertEqual(record["hash"], valid_hash)
        self.assertEqual(record["sizeBytes"], 2048)
        self.assertEqual(record["status"], "seeding")
        self.assertTrue(record["magnetUri"].startswith("magnet:?xt=urn:btih:"))
        self.assertIn(f"x.sha256={valid_hash}", record["magnetUri"])

        # Consulta individual e listagem
        seed = self.seeder.get_seed(valid_hash)
        self.assertIsNotNone(seed)
        self.assertEqual(len(self.seeder.list_seeds()), 1)

    def test_invalid_hash_and_size_rejection(self):
        with self.assertRaises(ValueError):
            self.seeder.register_blob_seed("hash_invalido_curto", 1024)

        valid_hash = hashlib.sha256(b"vox_zero").hexdigest()
        self.seeder.authorize_hash(valid_hash)
        with self.assertRaises(ValueError):
            self.seeder.register_blob_seed(valid_hash, 0)
        with self.assertRaises(ValueError):
            self.seeder.register_blob_seed(valid_hash, -50)

    def test_quota_limits(self):
        # Limite configurado: 1 MB (1048576 bytes)
        hash_1 = hashlib.sha256(b"blob1").hexdigest()
        self.seeder.authorize_hash(hash_1)
        self.seeder.register_blob_seed(hash_1, 600 * 1024)

        hash_2 = hashlib.sha256(b"blob2").hexdigest()
        self.seeder.authorize_hash(hash_2)
        # Excede 1 MB (600 + 500 = 1100 KB > 1024 KB)
        with self.assertRaises(OverflowError):
            self.seeder.register_blob_seed(hash_2, 500 * 1024)

    def test_unregister_seed(self):
        valid_hash = hashlib.sha256(b"remover").hexdigest()
        self.seeder.authorize_hash(valid_hash)
        self.seeder.register_blob_seed(valid_hash, 1024)
        self.assertTrue(self.seeder.unregister_blob_seed(valid_hash))
        self.assertIsNone(self.seeder.get_seed(valid_hash))
        self.assertFalse(self.seeder.unregister_blob_seed(valid_hash))

    def test_seeder_confinement_defaults(self):
        status = self.seeder.get_status()
        self.assertFalse(status["confinement"]["dht"])
        self.assertFalse(status["confinement"]["lsd"])
        self.assertFalse(status["confinement"]["pex"])
        self.assertFalse(status["confinement"]["natPmp"])


class TestPeerDiscovery(unittest.TestCase):
    def setUp(self):
        self.discovery = p2p_seeder.PeerDiscovery(local_node_id="node-test-1", ttl_seconds=2)

    def test_register_and_list_peers(self):
        peer_payload = {
            "nodeId": "node-popular-sp-01",
            "protocol": "VOX-PEER-v1",
            "httpPort": 3921,
            "controlPort": 3922,
            "capabilities": ["relay", "cache", "seeder"],
            "version": "0.2.1",
            "host": "127.0.0.1",
        }
        record = self.discovery.register_peer(peer_payload)
        self.assertEqual(record["nodeId"], "node-popular-sp-01")
        self.assertEqual(record["protocol"], "VOX-PEER-v1")
        self.assertEqual(record["status"], "online")

        peers = self.discovery.list_peers()
        self.assertEqual(len(peers), 1)
        self.assertEqual(peers[0]["nodeId"], "node-popular-sp-01")

    def test_reject_incompatible_or_malformed_peer(self):
        # Protocolo errado
        with self.assertRaises(ValueError):
            self.discovery.register_peer({"nodeId": "n1", "protocol": "BITTORRENT-v2", "httpPort": 3921})

        # Porta inválida
        with self.assertRaises(ValueError):
            self.discovery.register_peer({"nodeId": "n1", "protocol": "VOX-PEER-v1", "httpPort": 999999})

        # Node ID vazio
        with self.assertRaises(ValueError):
            self.discovery.register_peer({"nodeId": "", "protocol": "VOX-PEER-v1", "httpPort": 3921})

    def test_peer_expiration_ttl(self):
        discovery_quick = p2p_seeder.PeerDiscovery(local_node_id="quick", ttl_seconds=1)
        peer_payload = {
            "nodeId": "ephemeral-peer",
            "protocol": "VOX-PEER-v1",
            "httpPort": 3921,
        }
        discovery_quick.register_peer(peer_payload)
        self.assertEqual(len(discovery_quick.list_peers()), 1)

        # Força expiração manipulando timestamp
        with p2p_seeder._LOCK:
            discovery_quick.known_peers["ephemeral-peer"]["lastSeenTs"] -= 5000

        pruned = discovery_quick.prune_expired()
        self.assertEqual(pruned, 1)
        self.assertEqual(len(discovery_quick.list_peers()), 0)

    def test_discovery_status_no_upnp(self):
        status = self.discovery.get_status()
        self.assertEqual(status["protocol"], "VOX-PEER-v1")
        self.assertEqual(status["peerDiscovery"], "ready")
        self.assertFalse(status["upnpEnabled"])
        self.assertFalse(status["natPmpEnabled"])


if __name__ == "__main__":
    unittest.main()
