"""Infra do relay: a imagem Docker leva todos os módulos que o server.py importa,
e só o job de release escreve no repositório (PM-111).
"""

import ast
import re
import unittest
from pathlib import Path

RELAY = Path(__file__).resolve().parent
ROOT = RELAY.parent
WORKFLOW = ROOT / ".github" / "workflows" / "release-binarios.yml"


def modulos_importados_pelo_server():
    """Nomes de `from relay import a, b, ...` no server.py."""
    texto = (RELAY / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(texto)
    modules = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "relay":
            for alias in node.names:
                modules.append(alias.name)
    return modules


def copias_do_dockerfile():
    """Pares (origens, destino) das instruções COPY do Dockerfile."""
    pares = []
    for linha in (RELAY / "Dockerfile").read_text(encoding="utf-8").splitlines():
        partes = linha.split()
        if partes and partes[0].upper() == "COPY":
            pares.append((partes[1:-1], partes[-1]))
    return pares


def blocos_de_job(texto):
    """Mapa nome do job -> texto do bloco, lido da seção `jobs:`."""
    corpo = texto.split("\njobs:\n", 1)[1]
    achados = list(re.finditer(r"^  ([\w-]+):\s*$", corpo, re.MULTILINE))
    fim = [m.start() for m in achados[1:]] + [len(corpo)]
    return {m.group(1): corpo[m.end() : f] for m, f in zip(achados, fim)}


class DockerfileDoRelay(unittest.TestCase):
    def test_copia_todos_os_modulos_que_o_server_importa(self):
        copiados = set()
        for origens, destino in copias_do_dockerfile():
            self.assertTrue(
                destino.rstrip("/").endswith("relay"), f"destino {destino!r} fora do pacote relay/"
            )
            for origem in origens:
                copiados.update(p.name for p in RELAY.glob(origem))
        faltando = [m for m in modulos_importados_pelo_server() if f"{m}.py" not in copiados]
        self.assertEqual(faltando, [], "módulos que o server.py importa e a imagem não copia")

    def test_compose_sobe_o_server_como_pacote(self):
        compose = (RELAY / "deploy" / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn('"-m", "relay.server"', compose)
        self.assertNotIn('"server.py"', compose)


def valores_da_instrucao(nome):
    """Argumentos de cada instrução `nome` do Dockerfile (ex.: `USER vox` -> ['vox'])."""
    valores = []
    for linha in (RELAY / "Dockerfile").read_text(encoding="utf-8").splitlines():
        partes = linha.split(None, 1)
        if partes and partes[0].upper() == nome and len(partes) == 2:
            valores.append(partes[1].strip())
    return valores


class SegurancaDoContainer(unittest.TestCase):
    def test_imagem_roda_como_usuario_nao_root(self):
        usuarios = valores_da_instrucao("USER")
        self.assertTrue(usuarios, "Dockerfile sem instrução USER: o processo roda como root")
        self.assertNotIn(usuarios[-1].split(":")[0].lower(), ("root", "0"), "USER final é root")

    def test_imagem_tem_healthcheck(self):
        self.assertTrue(valores_da_instrucao("HEALTHCHECK"), "Dockerfile sem HEALTHCHECK")

    def test_turnserver_nao_traz_senha_de_modelo(self):
        texto = (RELAY / "deploy" / "turnserver.conf").read_text(encoding="utf-8")
        self.assertNotIn(
            "troque-esta-senha-comunitaria", texto, "senha de modelo ainda no turnserver.conf"
        )
        credenciais = [linha for linha in texto.splitlines() if linha.startswith("user=")]
        self.assertTrue(credenciais, "turnserver.conf sem linha user=")
        for linha in credenciais:
            self.assertRegex(
                linha, r"^user=[^:]+:__[A-Z_]+__$", "user= deve ser placeholder, não senha"
            )

    def test_compose_publica_portas_do_relay_so_em_loopback_por_padrao(self):
        compose = (RELAY / "deploy" / "docker-compose.yml").read_text(encoding="utf-8")
        for porta in ("3920", "3921"):
            self.assertRegex(
                compose,
                rf'"\$\{{[A-Z_]+:-127\.0\.0\.1\}}:{porta}:{porta}"',
                f"porta {porta} não publica em 127.0.0.1 por padrão",
            )
        self.assertNotRegex(compose, r'"\$\{[A-Z_]+:-0\.0\.0\.0\}:', "publicação padrão em 0.0.0.0")


class PermissoesDoReleaseBinarios(unittest.TestCase):
    def test_escrita_so_em_job_que_nao_roda_em_pull_request(self):
        blocos = blocos_de_job(WORKFLOW.read_text(encoding="utf-8"))
        com_escrita = [nome for nome, bloco in blocos.items() if "contents: write" in bloco]
        self.assertTrue(com_escrita, "nenhum job publica a Release")
        for nome in com_escrita:
            condicao_do_job = re.search(
                r"^    if: .*github\.event_name != 'pull_request'", blocos[nome], re.MULTILINE
            )
            self.assertIsNotNone(condicao_do_job, f"job {nome} escreve e roda em pull_request")


if __name__ == "__main__":
    unittest.main()
