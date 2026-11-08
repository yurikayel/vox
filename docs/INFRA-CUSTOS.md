# Infra e custos — mapa operacional

> **Status:** canônico · **Owner:** mantenedor / steward ops · **Revisado:** 2026-11
> Não substitui os runbooks: [ops-shell-mirrors.md](./ops-shell-mirrors.md), [ops-pages-rollback.md](./ops-pages-rollback.md), [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md), [steward-relay-kit.md](./steward-relay-kit.md).

**Resumo:** hoje o Vox custa **R$ 0/mês** em dinheiro. Ele depende de **free tiers de terceiros**, um nó público de sinalização e um subsídio de upload **com cota** (ver abaixo: o upload grátis do Turbo não é ilimitado). Os limites de free tier abaixo são **aproximados**: confirme na fonte antes de decidir (ver Prompt 2 em [brainstorm-autossustento-10-features-2026-11.md](./brainstorm-autossustento-10-features-2026-11.md#prompt-2--viabilidade-a-custo-zero-limites-termos-de-uso-e-lei)).

## 1. Mapa de componentes

| Componente | Onde roda | Como chega lá | Custo | Limite / risco |
|---|---|---|---|---|
| **PWA (shell A)** | GitHub Pages `yurikayel.github.io/vox` | `deploy-pages.yml` (push em `main` tocando `client/**`) | R$ 0 | Limites de banda/tamanho do Pages; conta única do mantenedor. |
| **PWA (shell B, espelho)** | Cloudflare Pages (`vox-9df.pages.dev`) | `deploy-shell-b.yml` (push ou dispatch "DEPLOY") | R$ 0 | Só existe se os secrets `CLOUDFLARE_*` estiverem setados. Registro: [ops-shell-mirrors.md](./ops-shell-mirrors.md) (NET-01 aberto). |
| **Sinalização pública** | Render free (`wss://vox-sentinel.onrender.com`, Oregon) | Blueprint `relay/render.yaml` (autoDeploy do repo) | R$ 0 | **SPOF.** O free tier dorme após inatividade, então o `sentinel-keepalive.yml` pinga a cada 14 min. Cota mensal de horas de instância. Cold start. |
| **Relay buddy** (opcional) | Hugging Face Space Docker | `deploy-relay-hf.yml` (force-push de `relay/`) | R$ 0 | Não roda sem `HF_TOKEN`/`HF_SPACE`. Hoje não está em `client/config/signaling.json`. |
| **Deno Deploy** | — | — | — | **Pausado** (organização suspensa por cobrança). Código em `relay/deno-signaling.js`. |
| **Upload permanente** | Arweave via Turbo/ArDrive (`upload.ardrive.io`, `turbo-gateway.com`) | `client/js/ans104.js` + `upload.js` direto do navegador | R$ 0 para itens de até **105 KiB**, **dentro de uma cota grátis** | `https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB). Leitura provável: ~10 MiB grátis por carteira e por IP, e depois cada item exige crédito Turbo. Acima de 105 KiB o cliente cai em **Arweave L1 (pago em AR)**. É política de terceiro e muda sem aviso — confirmar no Prompt 2. |
| **Leitura** | Gateways GraphQL (`turbo-gateway.com`, `arweave.net`) — `client/config/gateways.json` | Fetch do cliente com fallback ([ADR-004](./adr/004-gateway-honest-fallback.md), [ADR-009](./adr/009-multi-gateway-graphql-corroboration.md)) | R$ 0 | Rate limit dos gateways públicos; só 2 gateways configurados. |
| **NAT traversal** | STUN Google, Cloudflare, Twilio | `client/config/signaling.json` | R$ 0 | **Sem TURN** (`"turn": []`), então pares atrás de NAT simétrico/CGNAT móvel podem não conectar. |
| **Nostr / WebTorrent** | Relays e trackers públicos | Listados em `signaling.json` | R$ 0 | **Configurados, não usados** (`nostr-signaling.js` é stub). |
| **Inbox de DM, memória central, `/oauth/exchange`** | `relay/server.py` | Só em máquina de steward / Node Zero (loopback ou túnel Cloudflare) | R$ 0 (hardware do voluntário) | **Não existe instância pública.** DMs entre aparelhos offline e login X/TikTok/Threads/GitHub dependem de alguém expor `server.py`. |
| **Bluesky** | `public.api.bsky.app` + PDS da pessoa | `bsky-feed.js`, `bsky-oauth.js` | R$ 0 | Rate limits da API pública. |
| **Google / Meta SDK** | CDNs das plataformas | `oauth-profile.js`, `social-login.js` | R$ 0 | Dependem de app registrado (IDs públicos via secrets/vars). |
| **Biblioteca Arweave** | `esm.sh` (em runtime) | import dinâmico | R$ 0 | Dependência de CDN de terceiro no caminho de upload. |
| **Imagens de demo** | `images.unsplash.com` (~35 refs) | hotlink | R$ 0 | Quebra offline; dado de demo. |
| **CI** | GitHub Actions (`ci.yml`, `windows-node-zero-smoke.yml`) | push/PR | R$ 0 (repo público) | — |

## 2. Secrets e variáveis (nomes, nunca valores)

| Nome | Tipo | Usado por | Para quê |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_PAGES_PROJECT_NAME` | secret | `deploy-shell-b.yml` | Espelho shell B |
| `HF_TOKEN`, `HF_SPACE` | secret | `deploy-relay-hf.yml` | Relay buddy no HF |
| `SENTINEL_NODE_1..3` | secret | `sentinel-keepalive.yml` | URLs a pingar (padrão: Render) |
| `VOX_GOOGLE_CLIENT_ID`, `VOX_FACEBOOK_APP_ID` | secret | `deploy-pages.yml`, `deploy-shell-b.yml` | Login/perfil client-only |
| `VOX_X_CLIENT_ID`, `VOX_THREADS_APP_ID`, `VOX_GITHUB_CLIENT_ID`, `VOX_TIKTOK_CLIENT_KEY`, `VOX_INSTAGRAM_APP_ID` | var | `deploy-pages.yml` | IDs públicos de OAuth ([login-social.md](./login-social.md)) |
| `VOX_OAUTH_RELAY_URL`, `VOX_SITE_URL` | var | `deploy-pages.yml` | Relay de troca OAuth e URL canônica |
| `PILOT_FREEZE` | var | `ci.yml` | Feature freeze do piloto |
| `VOX_OAUTH_<P>_CLIENT_ID/_SECRET` | env do relay | `relay/oauth_exchange.py` | Segredo do app (só no servidor do relay) |

Config gerada no deploy: `tools/write-oauth-deploy-config.mjs` grava `client/config/oauth.json` e os metadados do Bluesky.

## 3. Descritores de host sem workflow

Estão no repo para quem quiser subir **a sinalização** (`relay/Dockerfile` → `signaling.py`) em outro PaaS. Nenhum workflow usa:

| Arquivo | Host | Observação |
|---|---|---|
| `relay/render.yaml` | Render | É o que sustenta o nó atual (Blueprint). |
| `relay/koyeb.yaml` | Koyeb (nano) | Porta 8000. |
| `railway.json` | Railway | Dockerfile + healthcheck `/health`. |
| `glitch.json` | Glitch | `signaling.py --port 3000`. |
| `zbpack.json` | Zeabur | `signaling.py --host 0.0.0.0`. |
| `relay/deploy/` | VPS própria | docker-compose: Caddy (TLS) + signaling + relay + coturn ([README](../relay/deploy/README.md)). É o único caminho com **TURN** e **relay completo** públicos. |

## 4. Pontos únicos de falha (ordem de gravidade)

1. **Sinalização = 1 nó Render.** Se ele cair, só sobra a malha local e o BroadcastChannel; o keepalive também depende do GitHub Actions. Mitigações candidatas: features 1 e 2 do [brainstorm](./brainstorm-autossustento-10-features-2026-11.md), adicionar o HF Space ao `signaling.json`.
2. **Cota grátis do Turbo.** `https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB). Uma pessoa que posta foto lo-fi (~50–100 KiB) esgota a cota em algo como 100–200 posts; texto puro dura muito mais. Depois disso, publicar no permaweb custa crédito. **Fatiar mídia (F5) não resolve**, porque a cota é por bytes totais. Mitigações candidatas: mídia servida pela malha com só o hash no Arweave, créditos Turbo comprados pela vaquinha da comunidade (F4) e publicação permanente opt-in.
3. **Sem TURN.** Conexão móvel falha atrás de CGNAT. Um coturn custa banda; ver feature 4 (vaquinha transparente).
4. **Sem relay completo público.** DM offline, cofre e login de várias redes dependem de stewards.
5. **Conta única** no GitHub/Render/Cloudflare do mantenedor ([README § Trabalho necessário](../README.md#trabalho-necessário-para-que-o-projeto-seja-maior-que-qualquer-indivíduo)).

## 5. O que custaria dinheiro se crescesse

| Item | Gatilho | Ordem de grandeza (verificar) |
|---|---|---|
| Crédito Turbo | Carteira ou IP passa da cota grátis (~10 MiB) | Por byte, em crédito Turbo (USD/AR/SOL…) |
| Arweave L1 | Mídias acima de 105 KiB | Por byte, em AR (volátil) |
| TURN (coturn) | Muitos pares em CGNAT | VPS pequena + banda de relay |
| Sinalização paga | Cota do free tier estourada | Plano pago mais barato do PaaS |
| Relay completo público | Inbox/OAuth para todos | VPS pequena |

Nada disso é pago hoje. Qualquer gasto futuro deve ser público e opt-in (ver [POSITIONING.md](../POSITIONING.md): sem custódia, sem alcance pago).
