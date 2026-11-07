"""Troca de código OAuth -> identidade (@usuário) para "Conectar com login" no Vox.

O cliente (navegador) faz o login com PKCE e manda o `code` para cá; o relay usa o segredo do
app (variáveis de ambiente, nunca no cliente), consulta só a identidade e DESCARTA o token.
Nada é persistido. Provedores sem credenciais configuradas respondem 501.

Variáveis por provedor: VOX_OAUTH_<PROVEDOR>_CLIENT_ID e VOX_OAUTH_<PROVEDOR>_CLIENT_SECRET
(PROVEDOR em: TWITTER, GITHUB, THREADS, TIKTOK, INSTAGRAM).
"""
import json
import os
import urllib.parse
import urllib.request

TIMEOUT = 12

PROVIDERS = {
    "twitter": {
        "token_url": "https://api.x.com/2/oauth2/token",
        "me_url": "https://api.x.com/2/users/me?user.fields=profile_image_url",
        "basic_auth": True,
        "id_field": "client_id",
    },
    "github": {
        "token_url": "https://github.com/login/oauth/access_token",
        "me_url": "https://api.github.com/user",
        "basic_auth": False,
        "id_field": "client_id",
    },
    "threads": {
        "token_url": "https://graph.threads.net/oauth/access_token",
        "me_url": "https://graph.threads.net/v1.0/me?fields=id,username,name",
        "basic_auth": False,
        "id_field": "client_id",
    },
    "tiktok": {
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "me_url": "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name,avatar_url",
        "basic_auth": False,
        "id_field": "client_key",
    },
    "instagram": {
        "token_url": "https://api.instagram.com/oauth/access_token",
        "me_url": "https://graph.instagram.com/me?fields=id,username",
        "basic_auth": False,
        "id_field": "client_id",
    },
}


class OAuthError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def credentials(provider, env=None):
    env = env if env is not None else os.environ
    key = provider.upper()
    cid = env.get(f"VOX_OAUTH_{key}_CLIENT_ID", "").strip()
    secret = env.get(f"VOX_OAUTH_{key}_CLIENT_SECRET", "").strip()
    return cid, secret


def _http_json(req, opener):
    with opener(req, timeout=TIMEOUT) as res:
        return json.loads(res.read().decode("utf-8") or "{}")


def _token_request(conf, cid, secret, payload):
    form = {
        "grant_type": "authorization_code",
        "code": payload["code"],
        "redirect_uri": payload["redirect_uri"],
        "code_verifier": payload.get("code_verifier", ""),
        conf["id_field"]: cid,
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}
    if conf["basic_auth"]:
        import base64
        token = base64.b64encode(f"{cid}:{secret}".encode()).decode()
        headers["Authorization"] = f"Basic {token}"
    else:
        form["client_secret"] = secret
    data = urllib.parse.urlencode(form).encode()
    return urllib.request.Request(conf["token_url"], data=data, headers=headers, method="POST")


def parse_identity(provider, me):
    """Normaliza a resposta /me de cada rede para {handle, id, name}."""
    if provider == "twitter":
        d = me.get("data") or {}
        return {"handle": d.get("username", ""), "id": d.get("id", ""), "name": d.get("name", ""), "avatar": d.get("profile_image_url", "")}
    if provider == "github":
        return {"handle": me.get("login", ""), "id": str(me.get("id", "")), "name": me.get("name") or ""}
    if provider == "tiktok":
        u = (me.get("data") or {}).get("user") or {}
        return {"handle": u.get("username", ""), "id": u.get("open_id", ""), "name": u.get("display_name", ""), "avatar": u.get("avatar_url", "")}
    return {"handle": me.get("username", ""), "id": str(me.get("id", "")), "name": me.get("name") or ""}


def _validate(payload):
    provider = str(payload.get("provider", "")).lower()
    if provider not in PROVIDERS:
        raise OAuthError("Provedor desconhecido.")
    for field in ("code", "redirect_uri"):
        if not str(payload.get(field, "")).strip():
            raise OAuthError(f"Campo obrigatório ausente: {field}.")
    return provider


def exchange(payload, env=None, opener=urllib.request.urlopen):
    """Troca o código pelo @usuário. Retorna {provider, handle, id, name}; o token é descartado."""
    provider = _validate(payload)
    cid, secret = credentials(provider, env)
    if not cid or not secret:
        raise OAuthError("Login deste provedor não está configurado neste relay.", 501)
    conf = PROVIDERS[provider]
    tok = _http_json(_token_request(conf, cid, secret, payload), opener)
    access = tok.get("access_token") or (tok.get("data") or {}).get("access_token")
    if not access:
        raise OAuthError(tok.get("error_description") or tok.get("error") or "A rede recusou o código.", 502)
    me_req = urllib.request.Request(conf["me_url"], headers={"Authorization": f"Bearer {access}", "Accept": "application/json"})
    ident = parse_identity(provider, _http_json(me_req, opener))
    if not ident["handle"]:
        raise OAuthError("A rede não informou o @usuário.", 502)
    return {"provider": provider, **ident}
