"""PM-94 — quem pode falar com o relay (`server.py`).

Regras, em ordem:
1. **Host:** com o relay escutando só em loopback, o cabeçalho `Host` precisa ser um nome de loopback (ou um
   nome liberado em `VOX_RELAY_ALLOWED_HOSTS`, como o endereço de um túnel). Isso barra páginas que trocam o
   DNS do próprio domínio para 127.0.0.1.
2. **Origin:** POST e DELETE vindos de navegador só são aceitos das origens do app (GitHub Pages, Cloudflare
   Pages e qualquer localhost) ou das liberadas em `VOX_RELAY_ALLOWED_ORIGINS`. Pedido sem `Origin` (ferramenta
   de linha de comando, nó de steward) passa.
3. **Content-Type:** POST só com `application/json`, o que obriga o navegador a perguntar antes (preflight).

O limite de escritas por IP não mora aqui: é o token bucket de `rate_limit.py`, aplicado depois destas regras.
"""

import os
from urllib.parse import urlsplit

APP_ORIGINS = ("https://yurikayel.github.io", "https://vox-9df.pages.dev")
LOOPBACK_NAMES = ("127.0.0.1", "localhost", "::1")
WRITE_METHODS = ("POST", "DELETE")


def _env_list(name, env=None):
    raw = (env if env is not None else os.environ).get(name) or ""
    return [item.strip().lower().rstrip("/") for item in raw.split(",") if item.strip()]


def _hostname(value):
    """Nome sem porta, tanto de `Host` (`a:1`, `[::1]:1`) quanto de uma origem (`http://a:1`)."""
    text = str(value or "").strip().lower()
    if "://" not in text:
        if text.count(":") > 1 and not text.startswith("["):
            return text
        text = f"//{text}"
    try:
        return (urlsplit(text).hostname or "").strip("[]")
    except ValueError:
        return ""


def is_loopback(name):
    return _hostname(name) in LOOPBACK_NAMES


def host_allowed(host_header, bound_host, env=None):
    if not is_loopback(bound_host):
        return True
    name = _hostname(host_header)
    return name in LOOPBACK_NAMES or name in _env_list("VOX_RELAY_ALLOWED_HOSTS", env)


def origin_allowed(origin, env=None):
    text = str(origin or "").strip().lower().rstrip("/")
    if not text:
        return True
    if text.startswith(("http://", "https://")) and is_loopback(text):
        return True
    return text in APP_ORIGINS or text in _env_list("VOX_RELAY_ALLOWED_ORIGINS", env)


def is_json_content_type(value):
    return str(value or "").split(";")[0].strip().lower() == "application/json"


def reject_reason(method, headers, bound_host):
    """Motivo para recusar o pedido como `(status, mensagem)`, ou None se ele pode seguir."""
    if not host_allowed(headers.get("Host"), bound_host):
        return 421, "Host não reconhecido por este relay"
    if method not in WRITE_METHODS:
        return None
    if not origin_allowed(headers.get("Origin")):
        return 403, "Origem não autorizada a escrever neste relay"
    if method == "POST" and not is_json_content_type(headers.get("Content-Type")):
        return 415, "Envie Content-Type: application/json"
    return None
