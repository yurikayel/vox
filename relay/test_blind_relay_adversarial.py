#!/usr/bin/env python3
"""
test_blind_relay_adversarial.py — Testes adversariais do relay cego.

Foco: perda silenciosa no cold boot (limpeza por timestamp em vez de serial),
listagem truncada, envelopes que se sobrescrevem, dado envenenado no disco e
tetos de tamanho e snapshot forjado (RFC 0002). O item que depende de mudança de
contrato (sinalização de truncamento) fica em `skip` com a razão. Quem poda o canal
é só o snapshot autenticado: os testes de poda mandam a prova de dono (`PROVA`).
"""

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from relay import blind_relay

CANAL = "canal_adv"
PROVA = "ab" * 32  # prova de dono qualquer (64 hex): o relay a trata como valor opaco


def _env(serial, timestamp, **extra):
    """Envelope mínimo e válido para o relay (sender/sig obrigatórios)."""
    env = {
        "version": 1,
        "sender": "a" * 64,
        "sig": "s" * 128,
        "serial": serial,
        "timestamp": timestamp,
        "nonce": f"n{serial}",
        "payload": f"p{serial}",
    }
    env.update(extra)
    return env


def _serials(items):
    return [int(e.get("serial", 0)) for e in items]


class _RelayDirCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.old_dir = blind_relay.RELAY_DIR
        blind_relay.set_relay_dir(Path(self.temp_dir.name))

    def tearDown(self):
        blind_relay.set_relay_dir(self.old_dir)
        self.temp_dir.cleanup()


class TestColdBootNaoPerdeDeltas(_RelayDirCase):
    def test_snapshot_so_apaga_o_que_cobre_por_serial_com_relogio_atrasado(self):
        agora = int(time.time() * 1000)
        for serial in range(1, 6):
            blind_relay.store_envelope(CANAL, _env(serial, agora - 10_000 + serial))
        # Serial 6..10 vieram de aparelho com relógio atrasado: timestamp < snapshot.
        for serial in range(6, 11):
            blind_relay.store_envelope(CANAL, _env(serial, agora - 60_000 + serial))

        blind_relay.store_snapshot(
            CANAL, {"snapshot": "ESTADO", "epoch": 2, "timestamp": agora, "coveredSerial": 5}, proof=PROVA
        )

        restantes = blind_relay.list_envelopes(CANAL, since_serial=5)
        self.assertEqual(_serials(restantes), [6, 7, 8, 9, 10])

    def test_snapshot_com_timestamp_futuro_nao_apaga_deltas_nao_cobertos(self):
        agora = int(time.time() * 1000)
        for serial in range(1, 4):
            blind_relay.store_envelope(CANAL, _env(serial, agora + serial))

        blind_relay.store_snapshot(
            CANAL,
            {"snapshot": "ESTADO", "epoch": 2, "timestamp": agora + 365 * 86_400_000, "coveredSerial": 1},
            proof=PROVA,
        )

        self.assertEqual(_serials(blind_relay.list_envelopes(CANAL, since_serial=1)), [2, 3])

    def test_envelope_sem_serial_nao_e_provado_coberto_e_sobrevive(self):
        agora = int(time.time() * 1000)
        blind_relay.store_envelope(CANAL, _env(0, agora - 5000, nonce="legado"))
        blind_relay.store_snapshot(
            CANAL, {"snapshot": "ESTADO", "epoch": 2, "timestamp": agora, "coveredSerial": 9}, proof=PROVA
        )
        self.assertEqual(len(blind_relay.list_envelopes(CANAL, since_ts=0)), 1)

    def test_snapshot_que_regride_coveredserial_e_recusado(self):
        agora = int(time.time() * 1000)
        for serial in range(1, 8):
            blind_relay.store_envelope(CANAL, _env(serial, agora + serial))
        blind_relay.store_snapshot(
            CANAL, {"snapshot": "A", "epoch": 2, "timestamp": agora, "coveredSerial": 5}, proof=PROVA
        )
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(
                CANAL, {"snapshot": "B", "epoch": 3, "timestamp": agora, "coveredSerial": 2}, proof=PROVA
            )
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "A")

    def test_snapshot_sem_cobertura_nao_apaga_nada(self):
        agora = int(time.time() * 1000)
        for serial in range(1, 4):
            blind_relay.store_envelope(CANAL, _env(serial, agora - 1000 + serial))
        blind_relay.store_snapshot(CANAL, {"snapshot": "A", "epoch": 2, "timestamp": agora}, proof=PROVA)
        self.assertEqual(len(blind_relay.list_envelopes(CANAL, since_ts=0)), 3)


class TestListagemDeMaisDeCemItens(_RelayDirCase):
    def _popular(self, total, deslocamento_relogio=False):
        base = 1_700_000_000_000
        for serial in range(1, total + 1):
            # Relógio fora de ordem: serial alto com timestamp baixo e vice-versa.
            ts = base + (total - serial if deslocamento_relogio else serial)
            blind_relay.store_envelope(CANAL, _env(serial, ts))

    def test_paginando_por_serial_o_cold_boot_recebe_todos(self):
        self._popular(250)
        recebidos, cursor = [], 1
        while True:
            pagina = blind_relay.list_envelopes(CANAL, since_serial=cursor)
            if not pagina:
                break
            recebidos.extend(_serials(pagina))
            cursor = max(_serials(pagina))
        self.assertEqual(recebidos, list(range(2, 251)))

    def test_pagina_cortada_e_contigua_mesmo_com_relogio_invertido(self):
        self._popular(150, deslocamento_relogio=True)
        pagina = blind_relay.list_envelopes(CANAL, since_serial=1, limit=100)
        self.assertEqual(_serials(pagina), list(range(2, 102)))

    def test_cursor_do_cliente_nao_pula_serial_com_relogio_invertido(self):
        self._popular(150, deslocamento_relogio=True)
        primeira = blind_relay.list_envelopes(CANAL, since_serial=1)
        segunda = blind_relay.list_envelopes(CANAL, since_serial=max(_serials(primeira)))
        self.assertEqual(sorted(_serials(primeira) + _serials(segunda)), list(range(2, 151)))

    def test_limite_de_pagina_respeitado_e_ordem_estavel_por_timestamp(self):
        self._popular(120)
        pagina = blind_relay.list_envelopes(CANAL, since_ts=0, limit=100)
        self.assertEqual(len(pagina), 100)
        self.assertEqual(_serials(pagina), list(range(1, 101)))

    @unittest.skip("contrato: o GET não avisa que cortou; precisa de campo/cabeçalho em server.py (relay-api.md §6)")
    def test_resposta_cortada_sinaliza_que_ha_mais(self):
        pass


class TestEnvelopesNaoSeSobrescrevem(_RelayDirCase):
    def test_mesmo_timestamp_sem_nonce_de_remetentes_diferentes_coexistem(self):
        a = {"sender": "a" * 64, "sig": "x" * 8, "timestamp": 5000, "payload": "A"}
        b = {"sender": "b" * 64, "sig": "y" * 8, "timestamp": 5000, "payload": "B"}
        blind_relay.store_envelope(CANAL, a)
        blind_relay.store_envelope(CANAL, b)
        payloads = sorted(e["payload"] for e in blind_relay.list_envelopes(CANAL))
        self.assertEqual(payloads, ["A", "B"])

    def test_nonces_que_so_diferem_depois_do_16o_caractere_coexistem(self):
        prefixo = "p" * 16
        blind_relay.store_envelope(CANAL, _env(1, 7000, nonce=prefixo + "1"))
        blind_relay.store_envelope(CANAL, _env(2, 7000, nonce=prefixo + "2"))
        self.assertEqual(_serials(blind_relay.list_envelopes(CANAL)), [1, 2])

    def test_reenvio_identico_e_idempotente_e_nao_renova_validade(self):
        env = _env(1, 8000)
        primeiro = blind_relay.store_envelope(CANAL, env, ttl_seconds=100)
        segundo = blind_relay.store_envelope(CANAL, env, ttl_seconds=10_000_000)
        self.assertEqual(primeiro["id"], segundo["id"])
        self.assertEqual(primeiro["expiresAt"], segundo["expiresAt"])
        self.assertEqual(len(blind_relay.list_envelopes(CANAL)), 1)

    def test_nonce_com_caminho_nao_escapa_do_diretorio_do_canal(self):
        env = _env(1, 9000, nonce="../../../../fugiu")
        blind_relay.store_envelope(CANAL, env)
        raiz = Path(self.temp_dir.name)
        arquivos = sorted(p.relative_to(raiz).parts[0] for p in raiz.rglob("*.json"))
        self.assertEqual(set(arquivos), {CANAL})
        self.assertEqual(len(blind_relay.list_envelopes(CANAL)), 1)


class TestDadoEnvenenado(_RelayDirCase):
    def test_serial_nao_numerico_e_recusado_na_entrada(self):
        for ruim in ("abc", [1], {"a": 1}, 1.5, True):
            with self.assertRaises(ValueError, msg=repr(ruim)):
                blind_relay.store_envelope(CANAL, _env(ruim, 1000))

    def test_timestamp_nao_numerico_e_recusado_na_entrada(self):
        for ruim in ("abc", [1], {"a": 1}):
            with self.assertRaises(ValueError, msg=repr(ruim)):
                blind_relay.store_envelope(CANAL, _env(1, ruim))

    def test_arquivo_ruim_no_disco_nao_derruba_a_listagem_do_canal(self):
        blind_relay.store_envelope(CANAL, _env(1, 1000))
        pasta = blind_relay.ensure_channel_dir(CANAL)
        agora = int(time.time()) + 1000
        (pasta / "env_2_x.json").write_text(
            json.dumps({"expiresAt": agora, "envelope": {"serial": "x", "timestamp": 1}}), encoding="utf-8"
        )
        (pasta / "env_3_x.json").write_text(json.dumps([1, 2]), encoding="utf-8")
        (pasta / "env_4_x.json").write_text(
            json.dumps({"expiresAt": agora, "envelope": {"serial": [1], "timestamp": None}}), encoding="utf-8"
        )
        self.assertEqual(_serials(blind_relay.list_envelopes(CANAL)), [1])

    def test_arquivo_ruim_no_disco_nao_derruba_a_limpeza_do_snapshot(self):
        blind_relay.store_envelope(CANAL, _env(1, 1000))
        pasta = blind_relay.ensure_channel_dir(CANAL)
        (pasta / "env_9_x.json").write_text(json.dumps({"envelope": {"serial": "x"}}), encoding="utf-8")
        blind_relay.store_snapshot(CANAL, {"snapshot": "A", "epoch": 2, "coveredSerial": 1}, proof=PROVA)
        self.assertEqual(blind_relay.list_envelopes(CANAL, since_ts=0), [])


class TestTetosDeTamanho(_RelayDirCase):
    def test_envelope_gigante_e_recusado_e_nada_e_gravado(self):
        with self.assertRaises(ValueError):
            blind_relay.store_envelope(CANAL, _env(1, 1000, payload="x" * (blind_relay.MAX_ENVELOPE_SIZE + 1)))
        self.assertEqual(blind_relay.list_envelopes(CANAL), [])

    def test_envelope_no_limite_exato_ainda_cabe(self):
        vazio = len(json.dumps(_env(1, 1000, payload="")).encode("utf-8"))
        env = _env(1, 1000, payload="x" * (blind_relay.MAX_ENVELOPE_SIZE - vazio))
        blind_relay.store_envelope(CANAL, env)
        self.assertEqual(len(blind_relay.list_envelopes(CANAL)), 1)

    def test_envelope_com_unicode_multibyte_conta_bytes_e_nao_caracteres(self):
        com_emoji = "é" * (blind_relay.MAX_ENVELOPE_SIZE // 2)
        with self.assertRaises(ValueError):
            blind_relay.store_envelope(CANAL, _env(1, 1000, payload=com_emoji))

    def test_snapshot_gigante_e_recusado_e_o_anterior_fica(self):
        blind_relay.store_snapshot(CANAL, {"snapshot": "bom", "epoch": 2}, proof=PROVA)
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(
                CANAL, {"snapshot": "x" * blind_relay.MAX_SNAPSHOT_SIZE, "epoch": 3}, proof=PROVA
            )
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "bom")


def _canal_com_dez_envelopes():
    agora = int(time.time() * 1000)
    for serial in range(1, 11):
        blind_relay.store_envelope(CANAL, _env(serial, agora - 1000 + serial))
    return agora


def _modo(valor):
    return mock.patch.dict("os.environ", {"VOX_RELAY_SNAPSHOT_AUTH": valor})


class TestSnapshotSemAutenticacao(_RelayDirCase):
    def test_compat_snapshot_forjado_sem_prova_nao_apaga_o_canal(self):
        agora = _canal_com_dez_envelopes()
        forjado = {"snapshot": "FORJADO", "epoch": 2, "timestamp": agora, "coveredSerial": 10**9}
        with _modo("compat"):
            registro = blind_relay.store_snapshot(CANAL, forjado)
        self.assertEqual(len(blind_relay.list_envelopes(CANAL, since_ts=0)), 10)
        self.assertIs(registro["auth"], False)

    def test_enforce_snapshot_forjado_sem_prova_e_403_e_nao_apaga_o_canal(self):
        agora = _canal_com_dez_envelopes()
        forjado = {"snapshot": "FORJADO", "epoch": 2, "timestamp": agora, "coveredSerial": 10**9}
        with _modo("enforce"), self.assertRaises(blind_relay.SnapshotForbidden):
            blind_relay.store_snapshot(CANAL, forjado)
        self.assertEqual(len(blind_relay.list_envelopes(CANAL, since_ts=0)), 10)

    def test_coveredserial_enorme_com_prova_passa_do_teto_e_nao_apaga(self):
        agora = _canal_com_dez_envelopes()
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(
                CANAL, {"snapshot": "X", "epoch": 2, "timestamp": agora, "coveredSerial": 10**9}, proof=PROVA
            )
        self.assertEqual(len(blind_relay.list_envelopes(CANAL, since_ts=0)), 10)

    def test_coveredserial_dentro_do_teto_com_prova_poda_so_o_coberto(self):
        agora = _canal_com_dez_envelopes()
        blind_relay.store_snapshot(
            CANAL, {"snapshot": "OK", "epoch": 2, "timestamp": agora, "coveredSerial": 5}, proof=PROVA
        )
        self.assertEqual(_serials(blind_relay.list_envelopes(CANAL, since_ts=0)), [6, 7, 8, 9, 10])

    def test_epoca_enorme_sem_prova_nao_trava_snapshots_futuros_em_enforce(self):
        with _modo("enforce"):
            with self.assertRaises(blind_relay.SnapshotForbidden):
                blind_relay.store_snapshot(CANAL, {"snapshot": "FORJADO", "epoch": 2**62})
            blind_relay.store_snapshot(CANAL, {"snapshot": "LEGIT", "epoch": 2}, proof=PROVA)
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "LEGIT")

    def test_epoca_enorme_sem_prova_nao_trava_snapshots_futuros_em_compat(self):
        with _modo("compat"):
            forjado = blind_relay.store_snapshot(CANAL, {"snapshot": "FORJADO", "epoch": 2**62})
            self.assertIs(forjado["auth"], False)
            blind_relay.store_snapshot(CANAL, {"snapshot": "LEGIT", "epoch": 2}, proof=PROVA)
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "LEGIT")

    def test_epoca_enorme_com_prova_e_recusada_e_o_canal_aceita_o_legitimo(self):
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(CANAL, {"snapshot": "X", "epoch": 2**62}, proof=PROVA)
        blind_relay.store_snapshot(CANAL, {"snapshot": "LEGIT", "epoch": 2}, proof=PROVA)
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["epoch"], 2)

if __name__ == "__main__":
    unittest.main()
