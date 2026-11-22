"""Testes unitários pipeline refs v3."""

from __future__ import annotations

import unittest

from e2e.vtt_refs.coverage import _map_query
from e2e.vtt_refs.image_quality import content_hash, is_raster_acceptable
from e2e.vtt_refs.selection import _score, pick_selection


class TestImageQuality(unittest.TestCase):
    def test_reject_svg_url(self) -> None:
        self.assertEqual(is_raster_acceptable(b"x", "https://x/logo.svg"), "svg")

    def test_hash_stable(self) -> None:
        data = b"\x89PNG\r\n"
        self.assertEqual(content_hash(data), content_hash(data))


class TestSelection(unittest.TestCase):
    def test_score_prefers_doc(self) -> None:
        doc = {"width": 800, "height": 600, "source": "doc", "platform": "foundry"}
        yt = {"width": 800, "height": 600, "source": "youtube", "platform": "foundry"}
        self.assertGreater(_score(doc), _score(yt))

    def test_pick_min_four(self) -> None:
        inv = [
            {"feature_id": "hub_campaign", "path": f"p{i}.png", "platform": "a", "width": 100 * (i + 1), "height": 100, "source": "doc"}
            for i in range(8)
        ]
        sel = pick_selection(inv)
        self.assertGreaterEqual(len(sel["hub_campaign"]), 4)


class TestCoverage(unittest.TestCase):
    def test_map_fog(self) -> None:
        self.assertEqual(_map_query("owlbear rodeo lighting"), "fog_visibility")

    def test_map_tokens(self) -> None:
        self.assertEqual(_map_query("roll20 npc tokens"), "tokens_layers")


if __name__ == "__main__":
    unittest.main()