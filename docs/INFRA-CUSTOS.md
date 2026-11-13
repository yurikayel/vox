# Infra e custos — mapa operacional

> **Status:** canônico · **Owner:** mantenedor / steward ops · **Revisado:** 2026-11-13
> Não substitui os runbooks: [ops-shell-mirrors.md](./operations/ops-shell-mirrors.md), [ops-pages-rollback.md](./operations/ops-pages-rollback.md), [ops-dr-drill-checklist.md](./operations/ops-dr-drill-checklist.md), [steward-relay-kit.md](./operations/steward-relay-kit.md).

**Resumo:** hoje o Vox custa **R$ 0/mês** em dinheiro. Ele depende de **free tiers de terceiros** e de um nó público de sinalização. **Pela diretriz vigente (13/11/2026), por enquanto nada deve ser salvo usando Arweave:** toda circulação e preservação passa pela **rede de seguidores** (você replica quem você segue via malha P2P / `replicacao-por-grau-v0`). O Arweave segue previsto apenas para alguns recursos futuros específicos e leitura pública (quando reativado, o upload grátis do Turbo tem cota vitalícia; não prometer ilimitado). Os limites de free tier abaixo são **aproximados**: confirme na fonte antes de decidir (ver Prompt 2 em [brainstorm-autossustento-10-features-2026-11.md](./brainstorms/brainstorm-autossustento-10-features-2026-11.md#prompt-2--viabilidade-a-custo-zero-limites-termos-de-uso-e-lei)).

## 1. Mapa de componentes

| Componente | Onde roda | Como chega lá | Custo | Limite / risco |
|---|---|---|---|---|
| **PWA (shell A)** | GitHub Pages `yurikayel.github.io/vox` | `deploy-pages.yml` (push em `main` tocando `client/**`) | R$ 0 | Limites de banda/tamanho do Pages; conta única do mantenedor. |
| **PWA (shell B, espelho)** | Cloudflare Pages (`vox-9df.pages.dev`) | `deploy-shell-b.yml` (push ou dispatch "DEPLOY") | R$ 0 | Só existe se os secrets `CLOUDFLARE_*` estiverem setados. Registro: [ops-shell-mirrors.md](./operations/ops-shell-mirrors.md) (NET-01 aberto). |
| **Sinalização pública** | Render free (`wss://vox-sentinel.onrender.com`, Oregon) | Blueprint `relay/render.yaml` (autoDeploy do repo) | R$ 0 | **SPOF.** O free tier dorme após inatividade, então o `sentinel-keepalive.yml` pinga a cada 14 min. 750 h/mês **por workspace** (= um só serviço sempre ligado). **Sem cartão, estourar a banda incluída suspende todos os serviços Free até o fim do mês** ([complementar F2](./research/pesquisa-complementar-2026-11.md#f-infraestrutura), REV-21). Cold start. |
| **Relay buddy** (opcional) | ~~Hugging Face Space Docker~~ | `deploy-relay-hf.yml` (force-push de `relay/`) | — | **Morto para Spaces novos:** Docker Spaces agora exigem plano pago ([pesquisa V6](./research/pesquisa-deep-research-2026-11.md)). Alternativa: Cloudflare Durable Object (Workers Free) — REV-01. O Koyeb escala a zero após 1 h e vai para a Mistral ([complementar F3](./research/pesquisa-complementar-2026-11.md#f-infraestrutura)). |
| **Deno Deploy** | — | — | — | **Pausado** (organização suspensa por cobrança). Código em `relay/deno-signaling.js`. |
| **Upload permanente (pausado em 13/11/2026)** | Arweave via Turbo/ArDrive (`upload.ardrive.io`, `turbo-gateway.com`) | `client/js/ans104.js` + `upload.js` bloqueados por padrão (`arweaveUpload: false` em `flags.json` e `feature-flags.js`); reservado para recursos específicos futuros | R$ 0 (desligado hoje) | `https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB). **Confirmado** em [docs.ar.io](https://docs.ar.io/build/upload/turbo-credits): 10 MiB por carteira **e por sub-rede**, e "the allowance never resets". Depois, exige crédito Turbo ou Arweave L1 (pago em AR). |
| **Leitura** | Gateways GraphQL (`turbo-gateway.com`, `arweave.net`, `ardrive.net`) + `ar-io.dev` só para leitura `raw` (não indexa o Vox, PM-50) — `client/config/gateways.json` | Fetch do cliente com fallback ([ADR-004](./adr/004-gateway-honest-fallback.md), [ADR-009](./adr/009-multi-gateway-graphql-corroboration.md)) | R$ 0 | Rate limit dos gateways públicos. 4 gateways, cada um com tempo limite de 8 s; se todos falharem, o cliente diz "gateways fora" (LAN-27). |
| **NAT traversal** | STUN Google, Cloudflare, Twilio | `client/config/signaling.json` | R$ 0 | **Sem TURN** (`"turn": []`), então pares atrás de NAT simétrico/CGNAT móvel podem não conectar. Opção: Cloudflare Realtime TURN (1.000 GB grátis; a credencial precisa ser gerada num Worker) — REV-10. |
| **TURN (REV-10)** | Cloudflare Worker `vox-turn` + Realtime TURN | Deploy manual pelo mantenedor ([workers/turn](../workers/turn/README.md)); o app só usa se `turnCredentialsUrl` estiver em `signaling.json` | R$ 0 até o teto de **800 GB/mês** (franquia de 1.000 GB dividida com o SFU; depois US$ 0,05/GB) | **Ainda não publicado.** Credencial temporária (4 h), só depois de falha direta ou no modo "só TURN"; teto do mês lido da API de análise e limite por IP. Uso desconhecido = não libera. Origem forjada fora do navegador não é barrada; o teto e o limite por IP limitam o estrago. |
| **Trackers WebTorrent** | Trackers públicos | Listados em `signaling.json` | R$ 0 | **Configurados, não usados.** Os relays Nostr têm linha própria abaixo. |
| **Inbox de DM, memória central, `/oauth/exchange`** | `relay/server.py` | Só em máquina de steward / Node Zero (loopback ou túnel Cloudflare) | R$ 0 (hardware do voluntário) | **Não existe instância pública.** DMs entre aparelhos offline e login X/TikTok/Threads/GitHub dependem de alguém expor `server.py`. |
| **Bluesky** | `public.api.bsky.app` + PDS da pessoa | `bsky-feed.js`, `bsky-oauth.js` | R$ 0 | Rate limits da API pública. |
| **Google / Meta SDK** | CDNs das plataformas | `oauth-profile.js`, `social-login.js` | R$ 0 | Dependem de app registrado (IDs públicos via secrets/vars). |
| **Biblioteca Arweave** | `client/vendor/` (o próprio site) | import dinâmico do arquivo vendorizado (PM-11) | R$ 0 | Sem CDN de terceiro no caminho de upload; hash conferido em teste. |
| **Imagens de demo** | `images.unsplash.com` (~35 refs) | hotlink | R$ 0 | Quebra offline; dado de demo. |
| **CI** | GitHub Actions (`ci.yml`, `windows-node-zero-smoke.yml`) | push/PR | R$ 0 (repo público) | — |
| **Sinalização Nostr** (paralela, REV-09) | relays públicos de `signaling.json` → `nostrRelays` (3 por sessão) | — (cliente direto) | R$ 0 | Só eventos efêmeros (kind 25050), não guardados. Saúde medida toda segunda por `nostr-smoke.yml` (REV-19). Um relay pode passar a exigir auth/PoW: o pool é configurável. |
| **Kill-switch** (LAN-08) | `client/config/flags.json` no Pages | deploy normal | R$ 0 | Mudar para `false` e fazer deploy pausa upload, Feira, Pix Zaps ou criar comunidade na próxima recarga; `notice` aparece no topo. |

## 2. Secrets e variáveis (nomes, nunca valores)

| Nome | Tipo | Usado por | Para quê |
|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_PAGES_PROJECT_NAME` | secret | `deploy-shell-b.yml` | Espelho shell B |
| `HF_TOKEN`, `HF_SPACE` | secret | `deploy-relay-hf.yml` | Relay buddy no HF |
| `SENTINEL_NODE_1..3` | secret | `sentinel-keepalive.yml` | URLs a pingar (padrão: Render) |
| `VOX_GOOGLE_CLIENT_ID`, `VOX_FACEBOOK_APP_ID` | secret | `deploy-pages.yml`, `deploy-shell-b.yml` | Login/perfil client-only |
| `VOX_X_CLIENT_ID`, `VOX_THREADS_APP_ID`, `VOX_GITHUB_CLIENT_ID`, `VOX_TIKTOK_CLIENT_KEY`, `VOX_INSTAGRAM_APP_ID` | var | `deploy-pages.yml` | IDs públicos de OAuth ([login-social.md](./specs/login-social.md)) |
| `VOX_OAUTH_RELAY_URL`, `VOX_SITE_URL` | var | `deploy-pages.yml` | Relay de troca OAuth e URL canônica |
| `PILOT_FREEZE` | var | `ci.yml` | Feature freeze do piloto |
| `VOX_OAUTH_<P>_CLIENT_ID/_SECRET` | env do relay | `relay/oauth_exchange.py` | Segredo do app (só no servidor do relay) |

Config gerada no deploy: `scripts/write-oauth-deploy-config.mjs` grava `client/config/oauth.json` e os metadados do Bluesky.

## 3. Descritores de host sem workflow

Estão no repo para quem quiser subir **a sinalização** (`relay/Dockerfile` → `signaling.py`) em outro PaaS. Nenhum workflow usa. Em 2026-11 o `Dockerfile` duplicado da raiz e o `glitch.json` (a Glitch encerrou a hospedagem de projetos) foram removidos:

| Arquivo | Host | Observação |
|---|---|---|
| `relay/render.yaml` | Render | É o que sustenta o nó atual (Blueprint). |
| `relay/koyeb.yaml` | Koyeb (nano) | Porta 8000. |
| `relay/deploy/railway.json` | Railway | `relay/Dockerfile` + healthcheck `/health`. A Railway só lê o arquivo na raiz: copie para lá se for usar. |
| `relay/deploy/zbpack.json` | Zeabur | `signaling.py --host 0.0.0.0`. Mesma observação: a Zeabur lê da raiz. |
| `relay/deploy/` | VPS própria | docker-compose: Caddy (TLS) + signaling + relay + coturn ([README](../relay/deploy/README.md)). É o único caminho com **TURN** e **relay completo** públicos. |

## 4. Pontos únicos de falha (ordem de gravidade)

1. **Sinalização = 1 nó Render + Nostr em paralelo.** Se o Render cair, sobram o caminho Nostr (REV-09, no `main` desde o PR #17, ainda sem medição em campo), a malha local e o BroadcastChannel. O keepalive de 14 min tem só 60 s de folga sobre o sleep de 15 min e depende do agendador do GitHub Actions, que atrasa. Mitigação: medir o Nostr em campo e torná-lo a camada primária (REV-09) + Cloudflare Durable Object como fallback sem sleep (REV-01). O HF deixou de ser opção ([pesquisa](./research/pesquisa-deep-research-2026-11.md)).
2. **Cota grátis do Turbo (mitigada: `arweaveUpload: false` ativo desde 13/11/2026).** `https://upload.ardrive.io/info` em 2026-11-07: `maxItemBytes` 107520 (105 KiB), `lifetimeBytes` 10485760 e `ipBytes` 10485760 (≈10 MiB). Por decisão atual, **nada é salvo usando Arweave por enquanto** — toda publicação e mídia fica na **rede de seguidores** ([replicacao-por-grau-v0](./specs/replicacao-por-grau-v0.md)), reservando o Arweave apenas para recursos específicos futuros (ex.: cartório / âncoras por consenso, possivelmente com Credit Sharing). `arweaveUpload` está desligado por padrão em `client/config/flags.json` e `client/js/feature-flags.js`.
3. **Sem TURN.** Conexão móvel falha atrás de CGNAT, e a opção "Esconder meu IP" (LAN-19) não tem servidor por onde passar. Um coturn custa banda; ver feature 4 (vaquinha transparente).
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

Nada disso é pago hoje. Qualquer gasto futuro deve ser público e opt-in (ver [POSITIONING.md](product/POSITIONING.md): sem custódia, sem alcance pago).
