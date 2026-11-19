#!/usr/bin/env python3
"""
test_blind_relay_snapshot_auth.py — Snapshot autenticado do relay cego (RFC 0002, opção A).

Cobre as regras de §3 (prova), §5 (tetos e repetição), §6 (ataques) e §7 (migração `compat`/`enforce`).
A prova é calculada como o cliente a calcula (HMAC-SHA256 presa a host e canal); o relay só a trata como
valor opaco, então "prova de outro host ou canal" é só outro valor que não confere com o dono guardado.
"""

import hashlib
import hmac
import json
import os
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest import mock

from relay import blind_relay, rate_limit, server, snapshot_auth

CANAL = "canal_auth"
HOST = "relay.example"
SEGREDO = bytes(range(32))


def prova(canal=CANAL, host=HOST, segredo=SEGREDO):
    """Prova do RFC 0002 §3: HMAC-SHA256(segredo, "vox-snapshot-proof-v1|host|canal") em hex."""
    mensagem = f"vox-snapshot-proof-v1|{host}|{canal}".encode("utf-8")
    return hmac.new(segredo, mensagem, hashlib.sha256).hexdigest()


def snap(epoch=2, covered=0, corpo="ESTADO"):
    return {"snapshot": corpo, "epoch": epoch, "timestamp": 1_700_000_000_000, "coveredSerial": covered}


def env(serial):
    return {"sender": "a" * 64, "sig": "s" * 128, "serial": serial, "timestamp": 1_700_000_000_000 + serial, "nonce": f"n{serial}"}


def com_modo(valor):
    return mock.patch.dict(os.environ, {"VOX_RELAY_SNAPSHOT_AUTH": valor})


class _Base(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.old_dir = blind_relay.RELAY_DIR
        blind_relay.set_relay_dir(Path(self.temp_dir.name))
        patcher = mock.patch.dict(os.environ)
        patcher.start()
        self.addCleanup(patcher.stop)
        for name in ("VOX_RELAY_SNAPSHOT_AUTH", "VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP", "VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP"):
            os.environ.pop(name, None)

    def tearDown(self):
        blind_relay.set_relay_dir(self.old_dir)
        self.temp_dir.cleanup()

    def arquivo(self, canal=CANAL):
        return blind_relay.ensure_channel_dir(canal) / "latest_snapshot.json"

    def popular(self, total, canal=CANAL):
        for serial in range(1, total + 1):
            blind_relay.store_envelope(canal, env(serial))

    def seriais(self, canal=CANAL):
        return sorted(e["serial"] for e in blind_relay.list_envelopes(canal, since_ts=0))


class TestFormatoDaProva(_Base):
    def test_prova_mal_formada_e_recusada_como_400_e_nada_e_gravado(self):
        ruins = ("", "xyz", "a" * 63, "a" * 65, "g" * 64, " " * 64, ("ab" * 31) + "é!", "ab\n" * 21 + "a")
        for ruim in ruins:
            with self.subTest(prova=ruim):
                with self.assertRaises(ValueError) as erro:
                    blind_relay.store_snapshot(CANAL, snap(), proof=ruim)
                self.assertNotIsInstance(erro.exception, (snapshot_auth.SnapshotConflict, snapshot_auth.SnapshotForbidden))
        self.assertFalse(self.arquivo().exists())

    def test_prova_em_maiusculas_vale_como_a_minuscula(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova().upper())
        resposta = blind_relay.store_snapshot(CANAL, snap(3), proof=prova().lower())
        self.assertEqual(resposta["auth"], "owner")

    def test_conflito_e_subclasse_de_valueerror_e_recusa_nao_e(self):
        self.assertTrue(issubclass(snapshot_auth.SnapshotConflict, ValueError))
        self.assertFalse(issubclass(snapshot_auth.SnapshotForbidden, ValueError))


class TestDono(_Base):
    def test_primeiro_a_provar_vira_dono_e_a_resposta_nao_traz_o_resumo(self):
        resposta = blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        self.assertEqual(resposta["auth"], "owner")
        for campo in ("ownerHash", "digest"):
            self.assertNotIn(campo, resposta)
        guardado = json.loads(self.arquivo().read_text(encoding="utf-8"))
        self.assertIs(guardado["auth"], True)
        self.assertEqual(guardado["ownerHash"], hashlib.sha256(bytes.fromhex(prova())).hexdigest())
        self.assertNotIn(prova(), self.arquivo().read_text(encoding="utf-8"))

    def test_get_nunca_devolve_o_dono(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        lido = blind_relay.get_latest_snapshot(CANAL)
        self.assertEqual(lido["snapshot"], "ESTADO")
        texto = json.dumps(lido)
        self.assertNotIn("ownerHash", texto)
        self.assertNotIn(hashlib.sha256(bytes.fromhex(prova())).hexdigest(), texto)

    def test_prova_de_outro_canal_ou_de_outro_host_e_recusada(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        antes = self.arquivo().read_bytes()
        for outra in (prova(canal="outro_canal"), prova(host="relay.hostil")):
            with self.subTest(prova=outra), self.assertRaises(snapshot_auth.SnapshotForbidden):
                blind_relay.store_snapshot(CANAL, snap(3, corpo="OUTRO"), proof=outra)
        self.assertEqual(self.arquivo().read_bytes(), antes)

    def test_segundo_dono_e_recusado_e_nada_muda(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        antes = self.arquivo().read_bytes()
        with self.assertRaises(snapshot_auth.SnapshotForbidden):
            blind_relay.store_snapshot(CANAL, snap(3, corpo="DO_INVASOR"), proof=prova(segredo=b"\x01" * 32))
        self.assertEqual(self.arquivo().read_bytes(), antes)

    def test_sem_prova_em_canal_com_dono_e_recusado_nos_dois_modos(self):
        self.popular(5)
        blind_relay.store_snapshot(CANAL, snap(2, covered=1), proof=prova())
        for modo in ("compat", "enforce"):
            with self.subTest(modo=modo), com_modo(modo), self.assertRaises(snapshot_auth.SnapshotForbidden):
                blind_relay.store_snapshot(CANAL, snap(3, covered=5, corpo="LEGADO"))
        self.assertEqual(self.seriais(), [2, 3, 4, 5])
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "ESTADO")

    def test_duas_gravacoes_simultaneas_sem_dono_so_uma_vence(self):
        for rodada in range(12):
            canal = f"corrida_{rodada}"
            provas = [prova(canal=canal, segredo=bytes([n]) * 32) for n in (1, 2)]
            largada = threading.Barrier(2)
            resultados = []

            def gravar(minha, canal=canal, largada=largada, resultados=resultados):
                largada.wait()
                try:
                    resultados.append(blind_relay.store_snapshot(canal, snap(2), proof=minha)["auth"])
                except snapshot_auth.SnapshotForbidden:
                    resultados.append("403")

            threads = [threading.Thread(target=gravar, args=(p,)) for p in provas]
            for t in threads:
                t.start()
            for t in threads:
                t.join(10)
            self.assertEqual(sorted(resultados), ["403", "owner"], f"rodada {rodada}")
            guardado = json.loads(self.arquivo(canal).read_text(encoding="utf-8"))
            self.assertIn(guardado["ownerHash"], {hashlib.sha256(bytes.fromhex(p)).hexdigest() for p in provas})


class TestRepeticaoEConflito(_Base):
    def test_reenvio_identico_e_idempotente_sem_regravar_nem_podar(self):
        self.popular(6)
        primeiro = blind_relay.store_snapshot(CANAL, snap(2, covered=3), proof=prova())
        self.assertNotIn("idempotent", primeiro)
        self.assertEqual(self.seriais(), [4, 5, 6])
        blind_relay.store_envelope(CANAL, env(2))  # chegou depois: um novo corte apagaria
        arquivo = self.arquivo()
        antes, mtime = arquivo.read_bytes(), arquivo.stat().st_mtime_ns
        time.sleep(0.02)
        segundo = blind_relay.store_snapshot(CANAL, snap(2, covered=3), proof=prova())
        self.assertIs(segundo["idempotent"], True)
        self.assertEqual(arquivo.read_bytes(), antes)
        self.assertEqual(arquivo.stat().st_mtime_ns, mtime)
        self.assertEqual(self.seriais(), [2, 4, 5, 6])

    def test_mesma_epoca_com_corpo_diferente_e_409_com_o_estado_atual(self):
        blind_relay.store_snapshot(CANAL, snap(2, covered=4, corpo="A"), proof=prova())
        with self.assertRaises(snapshot_auth.SnapshotConflict) as erro:
            blind_relay.store_snapshot(CANAL, snap(2, covered=4, corpo="B"), proof=prova())
        self.assertEqual((erro.exception.current_epoch, erro.exception.current_covered_serial), (2, 4))
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "A")

    def test_epoca_menor_e_409(self):
        blind_relay.store_snapshot(CANAL, snap(5), proof=prova())
        with self.assertRaises(snapshot_auth.SnapshotConflict) as erro:
            blind_relay.store_snapshot(CANAL, snap(3, corpo="VELHO"), proof=prova())
        self.assertEqual(erro.exception.current_epoch, 5)

    def test_cobertura_que_recua_com_epoca_maior_e_409(self):
        self.popular(8)
        blind_relay.store_snapshot(CANAL, snap(2, covered=6), proof=prova())
        with self.assertRaises(snapshot_auth.SnapshotConflict) as erro:
            blind_relay.store_snapshot(CANAL, snap(3, covered=2, corpo="BURACO"), proof=prova())
        self.assertEqual(erro.exception.current_covered_serial, 6)


class TestTetosDeSalto(_Base):
    def test_sem_dono_a_epoca_vai_de_1_a_16(self):
        for ruim in (17, 2**62):
            with self.subTest(epoch=ruim), self.assertRaises(ValueError):
                blind_relay.store_snapshot(CANAL, snap(ruim), proof=prova())
        blind_relay.store_snapshot(CANAL, snap(16), proof=prova())

    def test_com_dono_a_epoca_sobe_no_maximo_16(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(CANAL, snap(19, corpo="X"), proof=prova())
        blind_relay.store_snapshot(CANAL, snap(18, corpo="Y"), proof=prova())

    def test_cobertura_vai_ate_o_maior_serial_visto_mais_1000(self):
        self.popular(3)
        with self.assertRaises(ValueError):
            blind_relay.store_snapshot(CANAL, snap(2, covered=1004), proof=prova())
        self.assertEqual(self.seriais(), [1, 2, 3])
        blind_relay.store_snapshot(CANAL, snap(2, covered=1003), proof=prova())
        self.assertEqual(self.seriais(), [])

    def test_variaveis_de_ambiente_sobrescrevem_os_padroes(self):
        self.popular(3)
        with mock.patch.dict(os.environ, {"VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP": "5", "VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP": "2"}):
            with self.assertRaises(ValueError):
                blind_relay.store_snapshot(CANAL, snap(2, covered=9), proof=prova())
            with self.assertRaises(ValueError):
                blind_relay.store_snapshot(CANAL, snap(3, covered=3), proof=prova())
            blind_relay.store_snapshot(CANAL, snap(2, covered=8), proof=prova())

    def test_valor_invalido_da_variavel_volta_ao_padrao(self):
        for ruim in ("", "abc", "-3", "0", "1.5", "9" * 40, "١٢"):
            env_ruim = {"VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP": ruim, "VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP": ruim}
            self.assertEqual(snapshot_auth.max_covered_jump(env_ruim), 1000, repr(ruim))
            self.assertEqual(snapshot_auth.max_epoch_jump(env_ruim), 16, repr(ruim))
        self.assertEqual(snapshot_auth.max_covered_jump({"VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP": " 7 "}), 7)


class TestMigracao(_Base):
    def _grava_legado(self, **campos):
        registro = {"channelId": CANAL, "epoch": 50, "coveredSerial": 10**6, "timestamp": 1, "storedAt": 1, "data": {"snapshot": "LEGADO"}}
        registro.update(campos)
        self.arquivo().write_text(json.dumps(registro), encoding="utf-8")

    def test_registro_legado_sem_dono_nao_vale_contra_snapshot_autenticado(self):
        self._grava_legado()
        blind_relay.store_snapshot(CANAL, snap(2, covered=0, corpo="NOVO"), proof=prova())
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "NOVO")

    def test_registro_auth_false_nao_vale_contra_snapshot_autenticado(self):
        self._grava_legado(auth=False, ownerHash="ab" * 32)
        blind_relay.store_snapshot(CANAL, snap(2, corpo="NOVO"), proof=prova())
        self.assertEqual(blind_relay.get_latest_snapshot(CANAL)["snapshot"], "NOVO")

    def test_compat_com_cliente_antigo_nunca_apaga_envelope(self):
        self.popular(10)
        resposta = blind_relay.store_snapshot(CANAL, snap(2, covered=10))
        self.assertIs(resposta["auth"], False)
        self.assertEqual(self.seriais(), list(range(1, 11)))
        guardado = json.loads(self.arquivo().read_text(encoding="utf-8"))
        self.assertNotIn("ownerHash", guardado)

    def test_compat_mantem_a_regra_de_epoca_crescente_entre_legados(self):
        blind_relay.store_snapshot(CANAL, snap(3))
        with self.assertRaises(snapshot_auth.SnapshotConflict):
            blind_relay.store_snapshot(CANAL, snap(2, corpo="VELHO"))

    def test_enforce_sem_prova_e_403_e_nada_e_gravado(self):
        self.popular(4)
        with com_modo("enforce"), self.assertRaises(snapshot_auth.SnapshotForbidden):
            blind_relay.store_snapshot(CANAL, snap(2, covered=4))
        self.assertFalse(self.arquivo().exists())
        self.assertEqual(self.seriais(), [1, 2, 3, 4])

    def test_enforce_com_prova_segue_o_fluxo_completo(self):
        self.popular(4)
        with com_modo("enforce"):
            resposta = blind_relay.store_snapshot(CANAL, snap(2, covered=2), proof=prova())
        self.assertEqual(resposta["auth"], "owner")
        self.assertEqual(self.seriais(), [3, 4])

    def test_modo_desconhecido_cai_em_compat(self):
        for valor in ("", "ENFORCE ", "enforce"):
            esperado = "enforce" if valor.strip().lower() == "enforce" else "compat"
            self.assertEqual(snapshot_auth.auth_mode({"VOX_RELAY_SNAPSHOT_AUTH": valor}), esperado)
        for valor in ("compat", "qualquer", "0"):
            self.assertEqual(snapshot_auth.auth_mode({"VOX_RELAY_SNAPSHOT_AUTH": valor}), "compat")
        self.assertEqual(snapshot_auth.auth_mode({}), "compat")

    def test_steward_reinicia_o_dono_apagando_o_registro(self):
        blind_relay.store_snapshot(CANAL, snap(2), proof=prova())
        with self.assertRaises(snapshot_auth.SnapshotForbidden):
            blind_relay.store_snapshot(CANAL, snap(3), proof=prova(host="outro.dominio"))
        self.arquivo().unlink()
        resposta = blind_relay.store_snapshot(CANAL, snap(2), proof=prova(host="outro.dominio"))
        self.assertEqual(resposta["auth"], "owner")


class TestSnapshotAuthHttp(_Base):
    def setUp(self):
        super().setUp()
        limiter = rate_limit.RateLimiter({name: rate_limit.Policy(1000, 1000) for name in rate_limit.DEFAULT_POLICIES})
        patcher = mock.patch.object(rate_limit, "LIMITER", limiter)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._parar)

    def _parar(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def chamar(self, metodo, corpo=None, proof=None, canal=CANAL, extra=None):
        headers = dict(extra or {})
        if proof is not None:
            headers[snapshot_auth.PROOF_HEADER] = proof
        data = json.dumps(corpo).encode("utf-8") if corpo is not None else None
        if data is not None:
            headers["Content-Type"] = "application/json"
        url = f"http://127.0.0.1:{self.httpd.server_address[1]}/relay/snapshot/{canal}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=metodo), timeout=5) as resp:
                return resp.status, resp.read().decode("utf-8"), resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read().decode("utf-8"), err.headers

    def test_cabecalho_mal_formado_e_400(self):
        status, _, _ = self.chamar("POST", snap(), proof="nao-e-hex")
        self.assertEqual(status, 400)

    def test_primeira_gravacao_e_201_sem_dono_na_resposta_e_o_get_nao_vaza(self):
        status, corpo, _ = self.chamar("POST", snap(), proof=prova())
        self.assertEqual(status, 201)
        self.assertEqual(json.loads(corpo)["auth"], "owner")
        self.assertNotIn("ownerHash", corpo)
        status, lido, _ = self.chamar("GET")
        self.assertEqual(status, 200)
        self.assertNotIn("ownerHash", lido)
        self.assertNotIn(hashlib.sha256(bytes.fromhex(prova())).hexdigest(), lido)

    def test_reenvio_identico_e_200_idempotente(self):
        self.chamar("POST", snap(), proof=prova())
        status, corpo, _ = self.chamar("POST", snap(), proof=prova())
        self.assertEqual(status, 200)
        self.assertIs(json.loads(corpo)["idempotent"], True)

    def test_prova_errada_e_403_e_sem_prova_em_canal_com_dono_tambem(self):
        self.chamar("POST", snap(), proof=prova())
        self.assertEqual(self.chamar("POST", snap(3), proof=prova(canal="outro"))[0], 403)
        self.assertEqual(self.chamar("POST", snap(3))[0], 403)

    def test_conflito_e_409_com_epoca_e_cobertura_atuais(self):
        self.chamar("POST", snap(5, covered=0), proof=prova())
        status, corpo, _ = self.chamar("POST", snap(4, corpo="VELHO"), proof=prova())
        self.assertEqual(status, 409)
        dados = json.loads(corpo)
        self.assertEqual((dados["currentEpoch"], dados["currentCoveredSerial"]), (5, 0))
        self.assertIn("error", dados)

    def test_teto_de_salto_e_400(self):
        status, _, _ = self.chamar("POST", snap(2**62), proof=prova())
        self.assertEqual(status, 400)

    def test_enforce_sem_prova_e_403_e_compat_aceita(self):
        with com_modo("enforce"):
            self.assertEqual(self.chamar("POST", snap(), canal="canal_enf")[0], 403)
        self.assertEqual(self.chamar("POST", snap(), canal="canal_enf")[0], 201)

    def test_preflight_libera_o_cabecalho_da_prova(self):
        extra = {"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"}
        status, _, headers = self.chamar("OPTIONS", extra=extra)
        self.assertEqual(status, 204)
        self.assertIn(snapshot_auth.PROOF_HEADER, headers.get("Access-Control-Allow-Headers"))


if __name__ == "__main__":
    unittest.main()
