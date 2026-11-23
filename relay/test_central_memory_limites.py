#!/usr/bin/env python3
"""
test_central_memory_limites.py — Teto por item (`MAX_ITEM_BYTES`) e integridade
do blob endereçado por hash na memória central.

A regra do hash espelha `computeBlobHash` do cliente (`client/js/media-blob.js`):
data URL base64 → SHA-256 dos bytes decodificados; texto qualquer → SHA-256 do UTF-8.
"""

import base64
import hashlib
import tempfile
import unittest
from pathlib import Path

from relay import central_memory

TS = 9999999999999


def _data_url(raw: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def _blob_for(raw: bytes) -> dict:
    return {"hash": hashlib.sha256(raw).hexdigest(), "mime": "image/png", "data": _data_url(raw)}


def _post(item_id: str, size: int = 0) -> dict:
    return {"id": item_id, "type": "topic", "author": "vx_a", "ts": TS, "body": "x" * size}


class _MemoriaCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._previous = central_memory.MEMORY_DIR
        central_memory.set_memory_dir(Path(self._tmp.name) / "mem")

    def tearDown(self):
        central_memory.set_memory_dir(self._previous)
        self._tmp.cleanup()

    def _contagens(self):
        return central_memory.export_state(since=0, include_blobs=False)["counts"]


class TestTetoPorItem(_MemoriaCase):
    def test_post_gigante_via_ingest_e_recusado_e_o_estado_nao_muda(self):
        antes = central_memory.ingest_event({"type": "GOSSIP", "item": _post("p_ok")})["revision"]
        res = central_memory.ingest_event(
            {"type": "GOSSIP", "item": _post("p_gigante", central_memory.MAX_ITEM_BYTES + 1)}
        )
        self.assertFalse(res["changed"])
        self.assertEqual(res["revision"], antes)
        self.assertEqual(res["counts"]["posts"], 1)

    def test_post_logo_abaixo_do_teto_ainda_entra(self):
        res = central_memory.ingest_event(
            {"type": "GOSSIP", "item": _post("p_justo", central_memory.MAX_ITEM_BYTES - 1024)}
        )
        self.assertTrue(res["changed"])

    def test_perfil_manifesto_e_tombstone_gigantes_sao_recusados_no_sync(self):
        grande = "x" * (central_memory.MAX_ITEM_BYTES + 1)
        central_memory.sync_bundle(
            {
                "profiles": [{"routeId": "vx_perfil", "ts": TS, "bio": grande}],
                "manifests": [{"communityId": "com1", "issuedAt": TS, "extra": grande}],
                "tombstones": [{"id": "morto", "author": "vx_a", "editedAt": TS, "nota": grande}],
            }
        )
        contagens = self._contagens()
        self.assertEqual(
            (contagens["profiles"], contagens["manifests"], contagens["tombstones"]), (0, 0, 0)
        )

    def test_item_gigante_no_lote_nao_impede_os_itens_validos(self):
        central_memory.sync_bundle(
            {"posts": [_post("p_gigante", central_memory.MAX_ITEM_BYTES + 1), _post("p_pequeno")]}
        )
        self.assertEqual(self._contagens()["posts"], 1)


class TestIntegridadeDoBlob(_MemoriaCase):
    def _enviar(self, blob):
        return central_memory.ingest_event({"type": "MEDIA_BLOB", "blob": blob})

    def test_blob_com_hash_certo_e_aceito_e_lido_de_volta(self):
        blob = _blob_for(b"imagem-de-verdade")
        self.assertTrue(self._enviar(blob)["changed"])
        self.assertEqual(central_memory.get_blob(blob["hash"])["data"], blob["data"])

    def test_blob_com_hash_que_nao_confere_com_os_dados_e_recusado(self):
        lixo = {"hash": hashlib.sha256(b"A").hexdigest(), "data": _data_url(b"B")}
        self.assertFalse(self._enviar(lixo)["changed"])
        self.assertIsNone(central_memory.get_blob(lixo["hash"]))

    def test_lixo_sob_hash_alheio_nao_bloqueia_o_blob_verdadeiro(self):
        verdadeiro = _blob_for(b"A")
        self._enviar({"hash": verdadeiro["hash"], "data": _data_url(b"lixo")})
        self.assertTrue(self._enviar(verdadeiro)["changed"])
        self.assertEqual(central_memory.get_blob(verdadeiro["hash"])["data"], verdadeiro["data"])

    def test_data_url_com_base64_invalido_e_recusada(self):
        # 1 caractere: base64 impossível (o atob do cliente também falha)
        quebrado = "data:image/png;base64,A"
        res = self._enviar(
            {"hash": hashlib.sha256(quebrado.encode()).hexdigest(), "data": quebrado}
        )
        self.assertFalse(res["changed"])

    def test_texto_que_nao_e_data_url_usa_o_hash_do_utf8_como_no_cliente(self):
        texto = "QUFBQQ=="
        ok = {"hash": hashlib.sha256(texto.encode("utf-8")).hexdigest(), "data": texto}
        self.assertTrue(self._enviar(ok)["changed"])
        errado = {"hash": hashlib.sha256(b"AAAA").hexdigest(), "data": texto}
        self.assertFalse(self._enviar(errado)["changed"])

    def test_hash_em_maiusculas_confere_e_e_guardado_em_minusculas(self):
        blob = _blob_for(b"maiusculas")
        blob["hash"] = blob["hash"].upper()
        self.assertTrue(self._enviar(blob)["changed"])
        self.assertIsNotNone(central_memory.get_blob(blob["hash"].lower()))

    def test_sync_ignora_blob_adulterado_e_guarda_o_integro(self):
        bom = _blob_for(b"integro")
        ruim = {"hash": hashlib.sha256(b"x").hexdigest(), "data": _data_url(b"y")}
        central_memory.sync_bundle({"blobs": [ruim, bom]})
        self.assertEqual(self._contagens()["blobs"], 1)


if __name__ == "__main__":
    unittest.main()
