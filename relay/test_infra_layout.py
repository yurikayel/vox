"""Infra do relay: a imagem Docker leva todos os módulos que o server.py importa, e só o job de release escreve
no repositório (PM-111: prova o defeito de `Dockerfile`/`release-binarios.yml`, que não têm teste de execução)."""

import re
import unittest
from pathlib import Path

RELAY = Path(__file__).resolve().parent
ROOT = RELAY.parent
WORKFLOW = ROOT / ".github" / "workflows" / "release-binarios.yml"


def modulos_importados_pelo_server():
    """Nomes de `from relay import a, b, ...` no server.py."""
    texto = (RELAY / "server.py").read_text(encoding="utf-8")
    linha = re.search(r"^from relay import (.+)$", texto, re.MULTILINE)
    return [nome.strip() for nome in linha.group(1).split(",")]


def copias_do_dockerfile():
    """Pares (origens, destino) das instruções COPY do Dockerfile."""
    pares = []
    for linha in (RELAY / "Dockerfile").read_text(encoding="utf-8").splitlines():
        partes = linha.split()
        if partes and partes[0].upper() == "COPY":
            pares.append((partes[1:-1], partes[-1]))
    return pares


def blocos_de_job(texto):
    """Mapa nome do job -> texto do bloco, lido da seção `jobs:` (jobs são as chaves com 2 espaços)."""
    corpo = texto.split("\njobs:\n", 1)[1]
    achados = list(re.finditer(r"^  ([\w-]+):\s*$", corpo, re.MULTILINE))
    fim = [m.start() for m in achados[1:]] + [len(corpo)]
    return {m.group(1): corpo[m.end():f] for m, f in zip(achados, fim)}


class DockerfileDoRelay(unittest.TestCase):
    def test_copia_todos_os_modulos_que_o_server_importa(self):
        copiados = set()
        for origens, destino in copias_do_dockerfile():
            self.assertTrue(destino.rstrip("/").endswith("relay"), f"destino {destino!r} fora do pacote relay/")
            for origem in origens:
                copiados.update(p.name for p in RELAY.glob(origem))
        faltando = [m for m in modulos_importados_pelo_server() if f"{m}.py" not in copiados]
        self.assertEqual(faltando, [], "módulos que o server.py importa e a imagem não copia")

    def test_compose_sobe_o_server_como_pacote(self):
        compose = (RELAY / "deploy" / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn('"-m", "relay.server"', compose)
        self.assertNotIn('"server.py"', compose)


class PermissoesDoReleaseBinarios(unittest.TestCase):
    def test_escrita_so_em_job_que_nao_roda_em_pull_request(self):
        blocos = blocos_de_job(WORKFLOW.read_text(encoding="utf-8"))
        com_escrita = [nome for nome, bloco in blocos.items() if "contents: write" in bloco]
        self.assertTrue(com_escrita, "nenhum job publica a Release")
        for nome in com_escrita:
            condicao_do_job = re.search(r"^    if: .*github\.event_name != 'pull_request'", blocos[nome], re.MULTILINE)
            self.assertIsNotNone(condicao_do_job, f"job {nome} escreve e roda em pull_request")


if __name__ == "__main__":
    unittest.main()
