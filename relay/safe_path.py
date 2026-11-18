#!/usr/bin/env python3
"""
safe_path.py — Único ponto onde um nome vindo de fora vira caminho dentro de uma pasta do relay.

Duas portas, nesta ordem: (1) o nome inteiro tem de casar com um padrão fechado
(`fullmatch`, sem `\\n` final, sem separador, sem `..`); (2) o caminho resolvido
(`realpath`, que segue symlink) tem de ficar dentro da raiz também resolvida. A
segunda porta é a forma que o CodeQL (`py/path-injection`) reconhece como barreira
e, de quebra, recusa um symlink que aponte para fora da raiz.
"""

import os
import re
from pathlib import Path
from typing import Union

#: Id curto padrão (canal, comunidade): letras, dígitos, `_` e `-`.
SAFE_NAME = re.compile(r"[A-Za-z0-9_-]{1,128}")


def child_of(root: Union[str, "os.PathLike[str]"], name: str, pattern: "re.Pattern[str]" = SAFE_NAME) -> Path:
    """Caminho de `name` dentro de `root`, ou `ValueError` se `name` não for seguro.

    `pattern` precisa casar o nome inteiro (`fullmatch`). Depois disso, o caminho
    resolvido com `realpath` tem de começar por `realpath(root) + os.sep`; a própria
    raiz não vale como filho. O arquivo não precisa existir.
    """
    text = str(name)
    if pattern.fullmatch(text) is None:
        raise ValueError("nome fora do formato permitido")
    root_real = os.path.realpath(root)
    full = os.path.realpath(os.path.join(root_real, text))
    if not full.startswith(root_real + os.sep):
        raise ValueError("caminho fora da pasta raiz")
    return Path(full)
