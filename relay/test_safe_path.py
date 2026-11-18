"""Testes de relay/safe_path.py: nome externo só vira caminho dentro da raiz."""

import os
import tempfile
import time
import unittest
from pathlib import Path

from relay import blind_relay, inbox, server
from relay.safe_path import MAX_NAME_LENGTH, SAFE_CHARS, child_of, is_safe_id, only_chars


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

    def test_huge_text_is_refused_fast_without_reaching_the_validator(self):
        calls = []

        def spy(text):
            calls.append(text)
            return True

        started = time.monotonic()
        with self.assertRaises(ValueError):
            child_of(self.root, "a" * 5_000_000, spy)
        self.assertLess(time.monotonic() - started, 0.5)
        self.assertEqual(calls, [])

    def test_name_at_the_length_cap_is_accepted(self):
        def lowercase(text):
            return only_chars(text, frozenset("a"), 1, MAX_NAME_LENGTH + 1)

        name = "a" * MAX_NAME_LENGTH
        self.assertEqual(child_of(self.root, name, lowercase).name, name)
        with self.assertRaises(ValueError):
            child_of(self.root, name + "a", lowercase)

    def test_custom_validator_is_the_first_gate(self):
        def env_name(text):
            return text.startswith("env_") and only_chars(text[4:], frozenset("0123456789"), 1, 5)

        self.assertEqual(child_of(self.root, "env_12", env_name).name, "env_12")
        for bad in ("env_12\n", "latest", "env_", "env_123456"):
            with self.subTest(name=repr(bad)), self.assertRaises(ValueError):
                child_of(self.root, bad, env_name)

    def test_validator_that_allows_dots_still_blocks_escape_by_realpath(self):
        loose = frozenset("./Aa")
        for bad in ("../fora", "..", "../../a"):
            with self.subTest(name=bad), self.assertRaises(ValueError):
                child_of(self.root, bad, lambda text: only_chars(text, loose))

    def test_root_itself_is_not_a_child(self):
        with self.assertRaises(ValueError):
            child_of(self.root, ".", lambda text: text == ".")

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

    def test_default_validator_is_the_short_id(self):
        self.assertTrue(is_safe_id("abc_DEF-123"))
        for bad in ("abc.def", "", "a" * 129, "çã", "abc\n"):
            with self.subTest(name=repr(bad)):
                self.assertFalse(is_safe_id(bad))
        self.assertIn("_", SAFE_CHARS)


class CallerValidatorsTest(unittest.TestCase):
    def test_stored_name_accepts_only_our_files(self):
        good = ("latest_snapshot.json", "env_1_" + "a" * 20 + ".json", "env_" + "9" * 19 + "_" + "0f" * 10 + ".json")
        bad = ("env_1_" + "A" * 20 + ".json", "env__" + "a" * 20 + ".json", "env_" + "1" * 20 + "_" + "a" * 20 + ".json",
               "env_1_" + "a" * 19 + ".json", "env_1_" + "a" * 20 + ".json\n", "env_1_" + "a" * 20 + ".jsonx",
               "env_1.json", "latest_snapshot.json.bak", "env_1_" + "a" * 20, "..", "")
        for name in good:
            with self.subTest(name=name):
                self.assertTrue(blind_relay._is_stored_name(name))
        for name in bad:
            with self.subTest(name=name):
                self.assertFalse(blind_relay._is_stored_name(name))

    def test_tx_id_is_exactly_43_safe_chars(self):
        self.assertTrue(server.is_tx_id("A" * 43))
        self.assertTrue(server.is_tx_id("a-_" * 14 + "a"))
        for bad in ("A" * 42, "A" * 44, "A" * 43 + "\n", "A" * 42 + ".", "A" * 42 + "ç", ""):
            with self.subTest(name=repr(bad)):
                self.assertFalse(server.is_tx_id(bad))

    def test_index_name_has_prefix_suffix_and_a_safe_slug(self):
        for good in ("index_abc.json", "index_a.b-c_D.json", "index_...json", "index_" + "a" * 128 + ".json"):
            with self.subTest(name=good):
                self.assertTrue(server.is_index_name(good))
        for bad in ("index_.json", "index_json", "index_a/b.json", "index_a.json\n", "index_" + "a" * 129 + ".json",
                    "x_index_a.json", "index_a.jsonx"):
            with self.subTest(name=bad):
                self.assertFalse(server.is_index_name(bad))

    def test_inbox_names_are_sanitized_words(self):
        self.assertTrue(inbox._is_word_name("addr_01-é"))
        self.assertFalse(inbox._is_word_name(""))
        self.assertFalse(inbox._is_word_name("a/b"))
        self.assertTrue(inbox._is_message_name(".json"))
        self.assertTrue(inbox._is_message_name("dm_1.json"))
        self.assertFalse(inbox._is_message_name("dm_1.json\n"))
        self.assertFalse(inbox._is_message_name("../x.json"))


if __name__ == "__main__":
    unittest.main()
