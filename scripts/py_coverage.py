"""Cobertura de instruções do relay (`relay/*.py`, sem testes) com catraca, só com a biblioteca padrão.

Roda a mesma descoberta de `npm run test:relay` com `sys.monitoring` (Python 3.12+) ligado e conta,
por módulo, as instruções do AST (docstrings fora) executadas ao menos uma vez. O piso fica em
`scripts/coverage-floor.json` (chave `relay`) e só sobe.

Uso: `npm run coverage:py` · `python scripts/py_coverage.py --raise` (sobe o piso; nunca desce).
"""

import ast
import json
import os
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
RELAY = ROOT / "relay"
FLOOR_FILE = ROOT / "scripts" / "coverage-floor.json"
TOOL_ID = 3


def run_suite():
    """Roda os testes do relay registrando as linhas executadas.

    Returns:
        Tupla (resultado do unittest, dict caminho → linhas executadas).
    """
    hits = {}
    mon = sys.monitoring
    prefix = str(RELAY)

    def on_line(code, line):
        if code.co_filename.startswith(prefix):
            hits.setdefault(code.co_filename, set()).add(line)
        return mon.DISABLE

    mon.use_tool_id(TOOL_ID, "vox-coverage")
    mon.register_callback(TOOL_ID, mon.events.LINE, on_line)
    mon.set_events(TOOL_ID, mon.events.LINE)
    sys.path[:0] = [str(RELAY), str(ROOT)]
    os.chdir(ROOT)
    suite = unittest.defaultTestLoader.discover("relay", pattern="test_*.py", top_level_dir="relay")
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    mon.set_events(TOOL_ID, 0)
    mon.free_tool_id(TOOL_ID)
    return result, hits


def statement_lines(path):
    """Linhas das instruções de um módulo, sem docstrings.

    Args:
        path: Caminho do módulo.

    Returns:
        Conjunto de números de linha.
    """
    tree = ast.parse(path.read_text(encoding="utf-8"))
    lines = set()
    for node in ast.walk(tree):
        is_doc = isinstance(node, ast.Expr) and isinstance(getattr(node, "value", None), ast.Constant) \
            and isinstance(node.value.value, str)
        if isinstance(node, ast.stmt) and not is_doc:
            lines.add(node.lineno)
    return lines


def measure(hits):
    """Soma instruções e instruções executadas de cada módulo do relay.

    Args:
        hits: Saída de `run_suite`.

    Returns:
        Tupla (total, cobertas, linhas por módulo).
    """
    rows = []
    for path in sorted(RELAY.glob("*.py")):
        if path.name.startswith("test_"):
            continue
        stmts = statement_lines(path)
        covered = len(stmts & hits.get(str(path), set()))
        rows.append((path.name, len(stmts), covered))
    return sum(r[1] for r in rows), sum(r[2] for r in rows), rows


def check_floor(pct, raise_floor):
    """Compara com o piso e, se pedido, sobe a catraca.

    Args:
        pct: Percentual medido.
        raise_floor: Se deve gravar o novo piso.

    Returns:
        Código de saída do processo.
    """
    floor = json.loads(FLOOR_FILE.read_text(encoding="utf-8"))
    if raise_floor and pct > floor["relay"]:
        floor["relay"] = pct
        FLOOR_FILE.write_text(json.dumps(floor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Piso do relay sobe para {pct}%.")
    if pct < floor["relay"]:
        print(f"Cobertura do relay {pct}% abaixo do piso {floor['relay']}%.", file=sys.stderr)
        return 1
    print(f"Piso {floor['relay']}% · meta {floor['target']}%.")
    return 0


def main(argv):
    """Ponto de entrada da CLI.

    Args:
        argv: Argumentos após o script.

    Returns:
        Código de saída.
    """
    if sys.version_info < (3, 12):
        print("py_coverage precisa de Python 3.12+ (sys.monitoring).", file=sys.stderr)
        return 2
    result, hits = run_suite()
    if not result.wasSuccessful():
        return 1
    total, covered, rows = measure(hits)
    pct = int(1000 * covered / max(total, 1)) / 10
    print(f"\nCobertura do relay: {covered}/{total} instruções = {pct}%")
    for name, n, c in sorted(rows, key=lambda r: r[2] - r[1])[:8]:
        print(f"  {n - c} descobertas  relay/{name}")
    return check_floor(pct, "--raise" in argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
