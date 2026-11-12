# Login social em Redes Vinculadas

> **Status:** implementada (cada rede depende de configuração de deploy) · **Owner:** mantenedor · **Revisado:** 2026-11-07

"Conectar com login" deixa a pessoa conectar uma rede sem digitar @usuário. Cada rede funciona de um jeito:

| Rede | Como conecta | O que o operador precisa fazer |
|---|---|---|
| **Bluesky** | OAuth do AT Protocol direto no navegador (PAR + PKCE + DPoP). Devolve o @usuário verificado e permite postar direto. | Nada além do deploy: `scripts/write-oauth-deploy-config.mjs` publica `oauth/bsky-client-metadata.json` com a URL do site (`VOX_SITE_URL` ou o Pages do repositório). |
| **Facebook** | SDK do Facebook (`facebookAppId`, já usado no onboarding). A Meta não informa @usuário público: conecta a identidade (nome + id do app). | Secret `VOX_FACEBOOK_APP_ID`. |
| **X, Threads, GitHub, TikTok, Instagram (profissional)** | OAuth 2.0 + PKCE. O relay troca o código pelo @usuário com o segredo do app e **descarta o token** (só identidade). | Criar o app na rede, publicar o ID público no Pages e o segredo no relay (abaixo). |

Sem app configurado, a rede continua com o vínculo manual (@usuário digitado, "Não verificado" até "É minha conta").

## Configuração por rede

1. Crie o app no portal da rede com o **redirect URI** `https://<seu-site>/oauth-callback.html` (ex.: `https://yurikayel.github.io/vox/oauth-callback.html`).
2. No GitHub do repositório → Settings → Secrets and variables → Actions → **Variables**, defina o ID público e a URL do relay:

| Rede | Variável do Pages (ID público) | Escopo pedido |
|---|---|---|
| X | `VOX_X_CLIENT_ID` | `users.read tweet.read` |
| GitHub | `VOX_GITHUB_CLIENT_ID` | `read:user` |
| Threads | `VOX_THREADS_APP_ID` | `threads_basic` |
| TikTok | `VOX_TIKTOK_CLIENT_KEY` | `user.info.basic` |
| Instagram (só contas profissionais) | `VOX_INSTAGRAM_APP_ID` | `instagram_business_basic` |
| Todas | `VOX_OAUTH_RELAY_URL` (ex.: `https://seu-relay.exemplo`) | — |

3. No **relay** (Render/Koyeb/servidor próprio), defina o par de cada rede — o segredo **nunca** vai para o site:

```
VOX_OAUTH_TWITTER_CLIENT_ID / VOX_OAUTH_TWITTER_CLIENT_SECRET
VOX_OAUTH_GITHUB_CLIENT_ID / VOX_OAUTH_GITHUB_CLIENT_SECRET
VOX_OAUTH_THREADS_CLIENT_ID / VOX_OAUTH_THREADS_CLIENT_SECRET
VOX_OAUTH_TIKTOK_CLIENT_ID / VOX_OAUTH_TIKTOK_CLIENT_SECRET
VOX_OAUTH_INSTAGRAM_CLIENT_ID / VOX_OAUTH_INSTAGRAM_CLIENT_SECRET
```

O endpoint é `POST /oauth/exchange` (`relay/oauth_exchange.py`). Provedor sem credenciais responde 501 e o botão some no site.

## Limites conhecidos

- **Instagram pessoal**: a Meta desligou a API de contas pessoais (fim de 2024). Só contas Comercial/Criador conectam por login.
- **Facebook**: sem @usuário público e sem postagem em perfil pessoal (só Páginas).
- **X / Threads / TikTok**: exigem conta de desenvolvedor e, em alguns casos, revisão do app; a API do X tem limites por plano.
- **Desenvolvimento local**: o Bluesky usa o cliente de loopback e volta para `127.0.0.1`; abrir pelo `localhost` redireciona para `127.0.0.1` antes do login.
