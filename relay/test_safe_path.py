"""Testes de relay/safe_path.py: nome externo só vira caminho dentro da raiz."""

import os
import re
import tempfile
import unittest
from pathlib import Path

from relay.safe_path import SAFE_NAME, child_of


class ChildOfTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "raiz"
        self.root.mkdir()

    def test_valid_name_stays_inside_root(self):
        result = child_of(self.root, "canal_01-A")
        self.assertEqual(result.parent, Path(os.path.realpath(self.root)))
        self.assertEqual(result.name, "canal_01-A")

    def test_name_does_not_need_to_exist(self):
        self.assertFalse(child_of(self.root, "ainda_nao_existe").exists())

    def test_rejects_traversal_and_separators(self):
        for bad in ("..", "../fora", "a/../../fora", "a/b", "a\\b", "..\\fora", "."):
            with self.subTest(name=bad), self.assertRaises(ValueError):
                child_of(self.root, bad)

    def test_rejects_absolute_name(self):
        outside = os.path.abspath(os.sep + "etc")
        for bad in (outside, os.path.join(os.path.dirname(str(self.root)), "x"), "C:\\Windows", "/tmp/x"):
            with self.subTest(name=bad), self.assertRaises(ValueError):
                child_of(self.root, bad)

    def test_rejects_empty_trailing_newline_and_too_long(self):
        for bad in ("", "abc\n", "\nabc", "a" * 129, "a b", "a\x00b"):
            with self.subTest(name=repr(bad)), self.assertRaises(ValueError):
                child_of(self.root, bad)

    def test_custom_pattern_is_the_first_gate(self):
        pattern = re.compile(r"env_[0-9]{1,5}\.json")
        self.assertEqual(child_of(self.root, "env_12.json", pattern).name, "env_12.json")
        with self.assertRaises(ValueError):
            child_of(self.root, "env_12.json\n", pattern)
        with self.assertRaises(ValueError):
            child_of(self.root, "latest.json", pattern)

    def test_pattern_that_allows_dots_still_blocks_escape_by_realpath(self):
        loose = re.compile(r"[./A-Za-z]+")
        with self.assertRaises(ValueError):
            child_of(self.root, "../fora", loose)
        with self.assertRaises(ValueError):
            child_of(self.root, "..", loose)

    def test_root_itself_is_not_a_child(self):
        with self.assertRaises(ValueError):
            child_of(self.root, ".", re.compile(r"\."))

    def test_symlink_pointing_outside_is_refused(self):
        outside = Path(self._tmp.name) / "fora"
        outside.mkdir()
        link = self.root / "atalho"
        try:
            link.symlink_to(outside, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks indisponíveis neste ambiente: {error}")
        with self.assertRaises(ValueError):
            child_of(self.root, "atalho")

    def test_symlink_pointing_inside_is_accepted(self):
        real = self.root / "real"
        real.mkdir()
        link = self.root / "interno"
        try:
            link.symlink_to(real, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks indisponíveis neste ambiente: {error}")
        self.assertEqual(child_of(self.root, "interno"), Path(os.path.realpath(real)))

    def test_default_pattern_is_the_short_id(self):
        self.assertIsNotNone(SAFE_NAME.fullmatch("abc_DEF-123"))
        self.assertIsNone(SAFE_NAME.fullmatch("abc.def"))


if __name__ == "__main__":
    unittest.main()
