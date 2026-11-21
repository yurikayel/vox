#!/usr/bin/env python3
"""
safe_path.py — Único ponto onde um nome vindo de fora vira caminho dentro de uma pasta do relay.

Duas portas, nesta ordem: (1) o nome passa por um validador de caracteres (sem regex:
comprimento e conjunto de caracteres, então não há backtracking nem `\\n` final);
(2) o caminho resolvido (`realpath`, que segue symlink) tem de ficar dentro da raiz
também resolvida. A segunda porta é a forma que o CodeQL (`py/path-injection`)
reconhece como barreira e, de quebra, recusa um symlink que aponte para fora da raiz.
"""

import os
import string
from pathlib import Path
from typing import Callable, Container, Union

#: Teto do nome (limite de arquivo na maioria dos sistemas), checado antes de validador.
MAX_NAME_LENGTH = 255

#: Id curto padrão (canal, comunidade): letras ASCII, dígitos, `_` e `-`.
SAFE_CHARS = frozenset(string.ascii_letters + string.digits + "_-")
MAX_ID_LENGTH = 128


def only_chars(
    text: str, allowed: Container[str], min_length: int = 1, max_length: int = MAX_ID_LENGTH
) -> bool:
    """True se `text` é ASCII, tem entre min e max caracteres e só usa `allowed`."""
    return min_length <= len(text) <= max_length and text.isascii() and set(text) <= allowed


def is_safe_id(text: str) -> bool:
    """True para um id curto: 1 a 128 caracteres entre letras ASCII, dígitos, `_` e `-`."""
    return only_chars(text, SAFE_CHARS)


def child_of(
    root: Union[str, "os.PathLike[str]"],
    name: str,
    is_valid: Callable[[str], bool] = is_safe_id,
) -> Path:
    """Caminho de `name` dentro de `root`, ou `ValueError` se `name` não for seguro.

    Nome com mais de `MAX_NAME_LENGTH` caracteres é recusado antes de chamar `is_valid`.
    `is_valid` decide sobre o nome inteiro (por padrão, `is_safe_id`). Depois disso, o
    caminho resolvido com `realpath` tem de começar por `realpath(root) + os.sep`; a
    própria raiz não vale como filho. O arquivo não precisa existir.
    """
    text = str(name)
    if len(text) > MAX_NAME_LENGTH or not is_valid(text):
        raise ValueError("nome fora do formato permitido")
    root_real = os.path.realpath(root)
    full = os.path.realpath(os.path.join(root_real, text))
    if not full.startswith(root_real + os.sep):
        raise ValueError("caminho fora da pasta raiz")
    return Path(full)
