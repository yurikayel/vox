#!/usr/bin/env python3
"""Testes unitários para mirror_validate.py (V-P06)."""

import json
import unittest

from relay import mirror_validate


class TestMirrorValidate(unittest.TestCase):
    def test_rejects_invalid_community_id(self):
        body = json.dumps({"communityId": "bad/id", "topics": []}).encode("utf-8")
        ok, _, err, status = mirror_validate.validate_mirror_body(body)
        self.assertFalse(ok)
        self.assertEqual(status, 400)
        self.assertEqual(err.get("code"), "mirror.community_id_invalid")

    def test_accepts_local_topic_ids(self):
        body = json.dumps(
            {
                "communityId": "demo-aprenda-vox",
                "topics": [{"id": "post_1", "title": "Olá"}],
            }
        ).encode("utf-8")
        ok, payload, err, _ = mirror_validate.validate_mirror_body(body)
        self.assertTrue(ok)
        self.assertIsNone(err)
        self.assertEqual(payload["communityId"], "demo-aprenda-vox")

    def test_body_over_256k_returns_413(self):
        pad = "x" * (mirror_validate.MAX_MIRROR_BODY_BYTES - 40)
        body = json.dumps({"communityId": "c1", "topics": [], "pad": pad}).encode("utf-8")
        self.assertGreater(len(body), mirror_validate.MAX_MIRROR_BODY_BYTES)
        ok, _, err, status = mirror_validate.validate_mirror_body(body)
        self.assertFalse(ok)
        self.assertEqual(status, 413)
        self.assertEqual(err.get("code"), "mirror.body_too_large")

    def test_topics_over_500_returns_400(self):
        topics = [{"id": f"t{i}", "title": "T"} for i in range(501)]
        body = json.dumps({"communityId": "big-comm", "topics": topics}).encode("utf-8")
        ok, _, err, status = mirror_validate.validate_mirror_body(body)
        self.assertFalse(ok)
        self.assertEqual(status, 400)
        self.assertEqual(err.get("code"), "mirror.topics_limit")

    def test_cache_manifest_optional_valid(self):
        pin = {"txId": "A" * 43, "role": "topic"}
        body = json.dumps(
            {
                "communityId": "comm-a",
                "topics": [],
                "cacheManifest": {"v": 0, "communityId": "comm-a", "pins": [pin], "issuedAt": 1},
            }
        ).encode("utf-8")
        ok, _, err, _ = mirror_validate.validate_mirror_body(body)
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_cache_manifest_invalid_pins(self):
        body = json.dumps(
            {
                "communityId": "comm-a",
                "topics": [],
                "cacheManifest": {"v": 0, "communityId": "comm-a", "pins": [{"txId": "short"}]},
            }
        ).encode("utf-8")
        ok, _, err, status = mirror_validate.validate_mirror_body(body)
        self.assertFalse(ok)
        self.assertEqual(status, 400)
        self.assertEqual(err.get("code"), "mirror.cache_manifest_invalid")


if __name__ == "__main__":
    unittest.main()
