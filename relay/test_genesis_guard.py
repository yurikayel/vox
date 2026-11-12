"""Corte da gênese na memória central: conta de teste e post anterior à gênese não entram nem ficam."""

import json
import tempfile
import unittest
from pathlib import Path

from relay import central_memory, genesis_guard
from relay.genesis_data import GENESIS_MS, TEST_ROUTE_IDS

TEST_ID = sorted(TEST_ROUTE_IDS)[0]
REAL_ID = "vx_cidadaoNovoDepoisDaGenese"
AFTER = GENESIS_MS + 60_000
BEFORE = GENESIS_MS - 60_000


def post(post_id, author, ts):
    return {"id": post_id, "type": "topic", "author": author, "ts": ts, "title": "t"}


class TestGenesisGuardRules(unittest.TestCase):
    def test_vox_oficial_nao_e_conta_de_teste(self):
        self.assertFalse(genesis_guard.is_test_route_id("vx_voxbrasil_welcome"))
        self.assertTrue(genesis_guard.is_test_route_id(f" {TEST_ID} "))
        self.assertFalse(genesis_guard.is_test_route_id(None))

    def test_post_sem_data_de_criacao_fica(self):
        self.assertFalse(genesis_guard.refuses_post({"id": "p", "author": REAL_ID, "updatedAt": BEFORE}))
        self.assertTrue(genesis_guard.refuses_post(post("p", REAL_ID, BEFORE)))
        self.assertTrue(genesis_guard.refuses_post({"id": "p", "owner": TEST_ID, "ts": AFTER}))


class TestCentralMemoryGenesisGuard(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._previous = central_memory.MEMORY_DIR
        central_memory.set_memory_dir(Path(self._tmp.name) / "mem")

    def tearDown(self):
        central_memory.set_memory_dir(self._previous)
        self._tmp.cleanup()

    def test_sync_recusa_teste_e_pre_genese_e_aceita_o_resto(self):
        out = central_memory.sync_bundle({
            "posts": [post("velho", REAL_ID, BEFORE), post("de-teste", TEST_ID, AFTER), post("novo", REAL_ID, AFTER)],
            "profiles": [
                {"routeId": TEST_ID, "name": "", "updatedAt": AFTER},
                {"routeId": REAL_ID, "name": "Cidadã Nova", "updatedAt": AFTER},
            ],
        })
        self.assertEqual(out["ingestedCount"], 2)
        state = central_memory.load_state()
        self.assertEqual(sorted(state["posts"]), ["novo"])
        self.assertEqual(sorted(state["profiles"]), [REAL_ID])

    def test_ingest_de_cartao_assinado_de_conta_de_teste_e_recusado(self):
        card = {"id": f"pc_{TEST_ID}", "type": "profile-card", "routeId": TEST_ID, "author": TEST_ID, "editedAt": AFTER}
        self.assertFalse(central_memory.ingest_event(card)["changed"])

    def test_estado_antigo_no_disco_e_limpo_ao_carregar(self):
        mem = Path(self._tmp.name) / "mem"
        mem.mkdir(parents=True)
        old = {
            "revision": 7,
            "posts": {"velho": post("velho", REAL_ID, BEFORE), "novo": post("novo", REAL_ID, AFTER)},
            "profiles": {TEST_ID: {"routeId": TEST_ID}, "vx_voxbrasil_welcome": {"routeId": "vx_voxbrasil_welcome"}},
        }
        (mem / "state.json").write_text(json.dumps(old), encoding="utf-8")
        state = central_memory.load_state(force_reload=True)
        self.assertEqual(sorted(state["posts"]), ["novo"])
        self.assertEqual(sorted(state["profiles"]), ["vx_voxbrasil_welcome"])
        self.assertEqual(state["revision"], 8, "a limpeza conta como mudança, para os aparelhos buscarem de novo")


if __name__ == "__main__":
    unittest.main()
