#!/usr/bin/env python3
"""Testes do registro de pares: um endereço com dono conectado não é tomado por outra conexão."""

import unittest

from relay.signaling import PeerRegistry

PUB_DONO = {"kty": "EC", "crv": "P-256", "x": "dono", "y": "dono"}
PUB_ALHEIA = {"kty": "EC", "crv": "P-256", "x": "alheia", "y": "alheia"}
PUB_NOVA = {"kty": "EC", "crv": "P-256", "x": "nova", "y": "nova"}


class Handler:
    """Conexão falsa que só guarda o que receberia."""

    def __init__(self):
        self.messages = []

    def send_json(self, msg):
        self.messages.append(msg)


class TestRegistroConexaoViva(unittest.TestCase):
    def setUp(self):
        self.registry = PeerRegistry()
        self.registry.register("dono", Handler(), address="vx_a", dm_pub=PUB_DONO)

    def mapa(self):
        return self.registry.get_address_map()

    def test_conexao_alheia_nao_toma_endereco_de_peer_conectado(self):
        self.registry.register("intruso", Handler(), address="vx_a", dm_pub=PUB_ALHEIA)
        entrada = self.mapa()["vx_a"]
        self.assertEqual(entrada["peerId"], "dono")
        self.assertEqual(entrada["dmPub"], PUB_DONO)

    def test_dono_que_registra_de_novo_continua_no_mapa(self):
        self.registry.register("intruso", Handler(), address="vx_a", dm_pub=PUB_ALHEIA)
        self.registry.register("dono", Handler(), address="vx_a", dm_pub=PUB_DONO)
        entrada = self.mapa()["vx_a"]
        self.assertEqual(entrada["peerId"], "dono")
        self.assertEqual(entrada["dmPub"], PUB_DONO)

    def test_o_dono_se_registra_de_novo_com_chave_nova(self):
        self.registry.register("dono", Handler(), address="vx_a", dm_pub=PUB_NOVA)
        entrada = self.mapa()["vx_a"]
        self.assertEqual(entrada["peerId"], "dono")
        self.assertEqual(entrada["dmPub"], PUB_NOVA)

    def test_peer_alheio_ainda_entra_na_sala_e_nao_deixa_chave_solta(self):
        outros = self.registry.register("intruso", Handler(), address="vx_a", dm_pub=PUB_ALHEIA)
        self.assertEqual(outros, ["dono"])
        self.assertIsNotNone(self.registry.get("intruso"))
        self.assertEqual(self.registry.get_peer_by_address("vx_a"), "dono")

    def test_endereco_livre_pode_ser_registrado_por_outro_peer(self):
        self.registry.register("outra", Handler(), address="vx_b", dm_pub=PUB_ALHEIA)
        self.assertEqual(self.mapa()["vx_b"]["peerId"], "outra")

    def test_endereco_liberado_quando_o_dono_sai(self):
        self.registry.unregister("dono")
        self.registry.register("novo", Handler(), address="vx_a", dm_pub=PUB_ALHEIA)
        self.assertEqual(self.mapa()["vx_a"]["peerId"], "novo")


if __name__ == "__main__":
    unittest.main()
