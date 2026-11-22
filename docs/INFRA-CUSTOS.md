# Infra e custos — mapa operacional

> **Status:** canônico · **Owner:** mantenedor / steward ops · **Revisado:** 2026-11-21
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

---

## 6. Projeção orçamentária de 12 meses — 1.000 e 10.000 usuários ativos (LAN-32)

> **Natureza dos números (estimativas de 2026-11-21):** projeção de planejamento para o portão **G3**, sujeita à validação de carga (`LAN-09`) e à decisão jurídica (`REV-12`/`REV-18`). **Não há garantia de infraestrutura "grátis para sempre"**: free tiers possuem cotas rígidas e risco de suspensão sem aviso ou sem cartão cadastrado ([pesquisa complementar §1-F/H](./research/pesquisa-complementar-2026-11.md)). Câmbio de referência ilustrativo: **US$ 1,00 = R$ 5,80** (variação cambial e IOF não travados).

### 6.1 Premissas por componente

1. **Domínio + DNS (`LAN-06`):** domínio `.org.br` (~R$ 40/ano) ou `.org` (~US$ 12–15/ano), DNS no Cloudflare Free (R$ 0) com ≥ 2 titulares ou titular PJ.
2. **Sinalização e Relay (`REV-01` / `REV-04` / `INF-02`–`INF-03`):**
   - *1.000 ativos/mês:* o Render Free (750 h/workspace + teto de banda desconhecido sem cartão) perde margem operacional para uso contínuo; modela 1 instância paga básica (Render Starter/VPS/Fly ~US$ 5–12/mês) + Workers Paid / Durable Objects (~US$ 5/mês) para failover sem cold start + relays Nostr públicos (R$ 0, sujeitos a risco de auth/PoW).
   - *10.000 ativos/mês:* 2 nós de sinalização dedicados em provedores/regiões distintos + servidor para relay completo público (`server.py`, inbox DM/OAuth, `REV-04`), monitoramento e TLS.
3. **Tráfego TURN Relay (`REV-10` / `INF-01`):**
   - A cota grátis do Cloudflare Realtime TURN é **1.000 GB/mês** (compartilhada com SFU), com cobrança de **US$ 0,05/GB** (≈ R$ 0,29/GB) acima de 1.000 GB. O Worker `workers/turn` corta credenciais perto de ~800 GB/mês no modo gratuito.
   - Em redes móveis com CGNAT simétrico ou uso ativo de "Esconder meu IP" (`LAN-19`), estimamos **15%–25% das sessões** caindo em TURN (~200–400 MB/ativo/mês em mídia/voz):
     - *1.000 ativos:* **200–1.500 GB/mês** em picos → de R$ 0 (dentro dos 1.000 GB) até ~500 GB de excedente (**US$ 0–25/mês**).
     - *10.000 ativos:* **2.500–4.000 GB/mês** → excedente de **1.500–3.000 GB/mês** acima da franquia grátis (**US$ 75–150/mês**, ou alternativa com VPS `coturn` dedicada de alta franquia de banda, ~US$ 60–120/mês para 2 nós + operação).
4. **Cota Arweave / Turbo Upload (`REV-07` / `REV-11`):**
   - A cota gratuita do Turbo (`upload.ardrive.io`) é **~10 MiB vitalícios por carteira e por IP/sub-rede** (nunca reseta). Enquanto `arweaveUpload: false` permanecer ativo, o gasto é **R$ 0**.
   - Caso `REV-11` reative gravação seletiva apenas para âncoras cívicas/cartório (~1–2% das publicações, sem mídia de usuário), créditos Turbo pagos entram imediatamente ao esgotar os 10 MiB iniciais: estimativa de **R$ 0–60/mês** (1k) e **R$ 0–290/mês** (10k).
5. **PJ Brasil, Contabilidade e Reserva Jurídica (`REV-18` / `REV-12`):**
   - *Abertura única (Ano 1, estimativa a confirmar com contador local no `REV-18`):* estatuto, registro de associação em cartório, CNPJ e certificado e-CNPJ: **R$ 1.500–3.000** (cenário 1k) a **R$ 2.000–4.000** (cenário 10k).
   - *Recorrente mensal:* contabilidade mensal de associação sem fins lucrativos + reserva para assessoria jurídica/LGPD/respostas a notificações e relatórios (`REV-20`). Se o parecer `REV-12` dispensar PJ formalmente, esta linha cai para R$ 0 (registrado na nota abaixo da tabela).
6. **Contingência (20%):** aplicada sobre o subtotal recorrente mensal para absorver picos de TURN/banda, variação do dólar e incidentes operacionais.

### 6.2 Tabela consolidada (mensal e 12 meses)

| Linha de custo | 1.000 ativos (mês) | 1.000 ativos (12 meses) | 10.000 ativos (mês) | 10.000 ativos (12 meses) |
|---|---|---|---|---|
| **Domínio + DNS** (`LAN-06`) | R$ 4 – R$ 8 | R$ 48 – R$ 96 | R$ 4 – R$ 10 | R$ 48 – R$ 120 |
| **Sinalização + Relay** (`REV-01` / `REV-04`) | R$ 60 – R$ 120 | R$ 720 – R$ 1.440 | R$ 220 – R$ 450 | R$ 2.640 – R$ 5.400 |
| **TURN Relay** (> 1.000 GB/mês) (`REV-10`) | R$ 0 – R$ 145 | R$ 0 – R$ 1.740 | R$ 350 – R$ 870 | R$ 4.200 – R$ 10.440 |
| **Créditos Turbo / Arweave** (se `REV-11` ativo) | R$ 0 – R$ 60 | R$ 0 – R$ 720 | R$ 0 – R$ 290 | R$ 0 – R$ 3.480 |
| **PJ / Contabilidade / Jurídico** (`REV-18`) | R$ 400 – R$ 900 | R$ 4.800 – R$ 10.800 | R$ 1.000 – R$ 2.500 | R$ 12.000 – R$ 30.000 |
| *Subtotal recorrente* | *R$ 464 – R$ 1.233* | *R$ 5.568 – R$ 14.796* | *R$ 1.574 – R$ 4.120* | *R$ 18.888 – R$ 49.440* |
| **Contingência (20%)** | R$ 93 – R$ 247 | R$ 1.116 – R$ 2.964 | R$ 315 – R$ 824 | R$ 3.780 – R$ 9.888 |
| **Total recorrente (BRL)** | **R$ 557 – R$ 1.480** | **R$ 6.684 – R$ 17.760** | **R$ 1.889 – R$ 4.944** | **R$ 22.668 – R$ 59.328** |
| **Abertura única da PJ (Ano 1)** | — | R$ 1.500 – R$ 3.000 | — | R$ 2.000 – R$ 4.000 |
| **Total Ano 1 com PJ (BRL)** | — | **R$ 8.184 – R$ 20.760** | — | **R$ 24.668 – R$ 63.328** |
| **Total Ano 1 com PJ (USD, ~R$ 5,80)** | — | **US$ 1.411 – US$ 3.579** | — | **US$ 4.253 – US$ 10.919** |

*Infraestrutura técnica pura (sem PJ/contabilidade, caso dispensada pelo `REV-12`):* **R$ 77 – R$ 400/mês** (**R$ 924 – R$ 4.800/ano**, ≈ US$ 159 – US$ 828) para 1.000 ativos; **R$ 689 – R$ 1.944/mês** (**R$ 8.268 – R$ 23.328/ano**, ≈ US$ 1.426 – US$ 4.022) para 10.000 ativos, já incluindo 20% de contingência.

### 6.3 Gatilhos de sustentabilidade financeira e controle de escala

Os gastos acima não são ativados antecipadamente; obedecem ao escalonamento de [gatilho-infra-50-ativos.md](./operations/gatilho-infra-50-ativos.md) e aos critérios do [plano-lancamento-ondas.md](./strategy/plano-lancamento-ondas.md):

| Faixa / Sinal | Estado operacional | Gatilho financeiro e ação obrigatória |
|---|---|---|
| **0 – 50 ativos** (F0 / Piloto G1) | Custo **R$ 0/mês** (1× Render Free + keepalive; sem TURN; `arweaveUpload: false`) | **Bloqueado subir infra paga** antes do limiar de [gatilho-infra-50-ativos.md](./operations/gatilho-infra-50-ativos.md). |
| **> 50 ativos** (Gatilho `INF-01..04`) | Ativa TURN Worker (`teto ~800 GB/mês`) + 2º nó de sinalização + monitoramento de banda (`REV-21`) | Confirmar se há cartão/orçamento de reserva antes de tirar o corte rígido de 800 GB/mês no `workers/turn`. |
| **> 500 ativos ou > 70% da cota free (TURN/Render)** | Alerta amarelo antes de escalar para Onda 2/G3 | Exigir **cobertura confirmada para ≥ 6 meses** (GitHub Sponsors `REV-22`, editais `LAN-36`/NLnet/OTF, ou caixa da associação `REV-18`) antes de ampliar convites. |
| **Portão G3 (Lançamento Público)** | Escala planejada para 1k–10k ativos | Exige **≥ 12 meses de cobertura confirmada** ([Critérios Go/No-Go LAN-28](./strategy/criterios-go-beta-lan28.md)); fontes sempre públicas e opt-in (sem custódia, sem venda de alcance). |
| **Cobertura < 3 meses ou estouro de banda/TURN** | Alerta vermelho (`LAN-34`) | **Pausar convites**, manter `arweaveUpload: false`, manter teto estrito no Worker TURN e publicar aviso transparente antes de suspensão de free tier. |
