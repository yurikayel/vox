# Changelog — Vox

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões semânticas: cada entrada é identificada pela **linha do Service Worker** (`CACHE_NAME` em `client/sw.js`) e pelos PRs/commits. Números de testes e SHA da release atual: [docs/release-metadata.json](./docs/release-metadata.json).

Como manter: todo PR com mudança visível acrescenta uma linha em **Não lançado**. Ao fazer merge em `main` com bump de SW, a seção *Não lançado* vira a nova entrada datada.

## [Não lançado]

### Docs: ROADMAP pós-release v7.147 (#319/#320)
- `docs/ROADMAP.md`: § "Onde estamos (nov/2026)" e janela 19–26/11 encerrada — `main` `f39f344`, lacunas LT pós-#310, DOC-06/07 em `main`, foco pós-release em hardening doc.

### E2E Playwright: Mesa TTRPG (UI completa)
- `e2e/test_mesa_ttrpg_e2e.py`: modo jogador (`is-session-player`, drawer Z3, aba Mestre oculta), GM (canvas, fórmula, crônica), acampamento (4 rotas, calendário), mobile.

### Testes: cobertura TTRPG / Mesa (E5.0)
- Novos: `ttrpg-screens-smoke`, `ttrpg-actions-smoke`, `ttrpg-table-tactics`, `dungeon-controller-e4`, `dungeon-layout-style`, `vtt-campaign-reducer`, `vtt-tactics-schema`, `vtt-tactics-reducer`, `canvas-tactics-layers`.
- Correções UI: abas Mestre ocultas para jogador em todas as rotas; drawer Z3 com bandeja visível no desktop.
- Matriz de testes em `mesa-ui-brainstorm-v0.md` §5.1.

### Docs + UI: Mesa Soberana E5.0 — brainstorm UI VTT e layout sessão
- `docs/specs/mesa-ui-brainstorm-v0.md`: anatomia mesa hospedada C/mesa hospedada A/mesa hospedada B/Kraken, zonas Z0–Z5, wireframes, backlog UI.
- `client/js/dungeon/dungeon-ui-contract.js`, `screen-table-layout.js`, `dungeon-layout-style.js`, `client/css/dungeon-layout.css`: modo jogador (mapa hero, drawer crônica/dados), cromo por papel, CSS lazy.
- `mesa-referenciais-vtt-v0.md`: coluna mesa hospedada C + link ao brainstorm.

### Docs: Mesa Soberana — referenciais VTT e roadmap E5
- `docs/specs/mesa-referenciais-vtt-v0.md`: posicionamento vs mesa hospedada A, mesa hospedada B e mesa hospedada D; princípios de produto; matriz fazer/não fazer; backlog E5 (P0–P3).
- `docs/specs/ai-social-dungeon-v0.md`, `docs/FEATURES.md`: links para o spec de referenciais.

### Code: Mesa Soberana (Entrega 4) — campanha longa & polimento
- `client/js/dungeon/vtt-calendar.js`, `vtt-inventory.js`, `vtt-levelup.js`, `vtt-campaign-reducer.js`: calendário customizável com atalhos de tempo, inventário OR-Set na ficha, evolução de nível com marcos imutáveis e ops `CALENDAR_*` / `INVENTORY_*` / `LEVEL_UP_APPLY` (GM para tempo; fail-closed na projeção de notas `gm_only`).
- `client/js/dungeon/obsidian-bridge.js`, `vtt-portable.js`: parse JSON Canvas 1.0 (`mapas/*.canvas` no `.voxrpg.zip`), `data_mundo` na crônica exportada e inventário nas fichas `.md`.
- `client/js/dungeon/screen-notes.js`, `screen-camp.js`, `screen-sheet.js`, `screen-table.js`, `dungeon-persistence.js`, `dungeon-controller.js`: painel de notas por pasta, relógio de campanha, UI de inventário/level-up, import `.canvas` e `dice-3d.js` com `import()` dinâmico + preferência `localStorage` (`vox-dungeon-prefs-v1`).
- `tests/vtt-{calendar,inventory,levelup,canvas,e4-adversarial}.test.js`, `docs/specs/ai-social-dungeon-v0.md`, `docs/FEATURES.md`: suíte E4 sem novos bytes no precache cívico.

### Code: Mesa Soberana (Entrega 3) — tático & combate (iniciativa, condições, névoa, desenho/régua, AoE e portas/andares)
- `client/js/dungeon/vtt-tactics-schema.js`, `vtt-tactics-geometry.js`, `vtt-tactics-reducer.js`: catálogo de 12 condições com decremento automático por turno na iniciativa, portas (`closed`/`open`/`locked`/`secret`, Zero-Spoiler e permissões fail-closed), andares (`elevation_z`), simplificação RDP de polilinhas (`simplifyPolyline`), hit-test de 4 gabaritos AoE (`circle`, `cone`, `cube`, `line`) e névoa de guerra manual.
- `client/js/dungeon/canvas-tactics-layers.js`, `canvas-renderer.js`, `canvas-input.js`: renderização em 8 camadas (desenhos, AoE com destaque nos alvos, portas, badges de condições, névoa `evenodd` e régua em células/metros) + ferramentas interativas no `PointerEvents`.
- `client/js/dungeon/dungeon-tactics-actions.js`, `screen-table-tactics.js`, `screen-table.js`, `dungeon-controller.js`, `vtt-sync.js`, `tests/vtt-tactics-{geometry,combat}.test.js`: barra tática, painel de iniciativa Zero-Spoiler e suíte completa sem novos bytes no precache cívico.

### Code: Mesa Soberana (Entrega 2) — mapa `<canvas>` 2D, tokens, Camada do Mestre e protocolo sync P2P
- `client/js/dungeon/vtt-scene-schema.js`, `vtt-geometry.js`, `vtt-reducer.js`: cenas/andares/tokens (`player` vs `gm`), câmera pan/zoom, grade quadrada/hex, distâncias (`5e`, `5e-alt`, euclidiana, hex), permissões Mestre/Jogador (`isAuthorizedVttOp`) e projeção Zero-Spoiler fail-closed (remove tokens GM e redige PV exato quando `hpVisible === "status"`).
- `client/js/dungeon/canvas-renderer.js`, `canvas-input.js`, `dungeon-scene-actions.js`: renderização 2D sob demanda (0% CPU em repouso), gestos desktop + touch mobile (`PointerEvents`, pinça 2 dedos, snap na grade) e upload de mapas deduplicados por SHA-256.
- `client/js/dungeon/vtt-sync-codec.js`, `vtt-sync.js`: convites `#/dungeon/entrar/:id?gm=...#k=...`, assinatura ECDSA P-256 (`INV-7`) vinculada ao `routeId`, `SNAPSHOT_FILTERED`/`COMMIT_OP` sem vazamentos e `WANT_BLOB`/`BLOB_CHUNK` (16 KiB) com verificação SHA-256 e bloqueio de blobs ocultos.
- `client/js/dungeon/screen-table.js`, `screen-dm.js`, `dungeon-controller.js`, `tests/vtt-{geometry,sync,canvas}.test.js`: tabuleiro 2D e painel Camada GM/convite P2P integrados sem novos bytes no precache cívico.

## [2026-11-20] — SW `v7.147-community-split` (release #306–#317)

### Release
- `develop` → `main`: #306 drain HTTP · #307 cofre v2 · #308 mesh flood · #309–#311 identity/LT-06 · #310 LT-07 · #312–#316 JSDoc · #313 split comunidade (SW v7.147) · #314 Mesa E1 (lazy) · #315 JSON/LT-04 · #317 índice ops. Pós-deploy: hard refresh ([`ops-pages-rollback.md`](./docs/operations/ops-pages-rollback.md)).

### Docs: zera toda a dívida ativa de `audit:docs` fora de `labs/parado/` (199 → 79, -120 achados)
- `client/js/` (24 módulos ativos restantes fora de `labs/parado/`, incluindo `arweave-lib.js`, `chat-bridge.js`, `contacts.js`, `data/profiles-brazil-uf.js`, `electoral-period.js`, `gateway-telemetry.js`, `gossip-retract-ui.js`, `handles.js`, `labs/mofn-lab.js`, `mesh-profile.js`, `nostr-transport.js`, `peers-cache-manifest.js`, `peers-gossip-profile.js`, `pix-key.js`, `post-ownership.js`, `post-wire.js`, `qr-url-gf.js`, `qr-url.js`, `rate-limit.js`, `reply-thread.js`, `repost-index.js`, `repost.js`, `sky-theme.js`, `story-card.js`): JSDoc (`@param`/`@returns`/descrições) nos exports sem alterar lógica.
- `scripts/docs-debt.json`: podado via `npm run audit:docs -- --prune` (199 → 79 achados; 0 achados em módulos ativos, restando apenas `client/js/labs/parado/`).

### Code: blindagem contra JSON não-objeto em storage de cofre/backup e fuzzing `LT-04` sem exclusões
- `client/js/vault/mesh-vault.js`: `loadMine` e `pickHolders` validam `plainRecord` e normalizam `sentTo`/`previousHolders` como arrays (evita `TypeError: ... is not iterable` em `markSent`/`rememberMine`/`pickHolders`); `loadPending` exige `plainRecord(p)` e `plainRecord(p.request)`.
- `client/js/vault/vault-store.js`: `readLocalVaultRecord` rejeita JSON não-objeto no `localStorage` para impedir que lixo local em array/primitivo bloqueie a recuperação remota do cofre.
- `client/js/identity/inbox-backup.js`: `readState` usa `readStoredRecord` (`keystore.js`), ignorando valores não-objeto no `localStorage`.
- `tests/login-properties-files.test.js`, `docs/process/plano-testes-login.md`: remove exclusões de `SEED_STORAGE`, `local-account`, `accounts-vault` e `HELD_STORAGE` no sorteio `LT-04`, exercita `storeSeed`/`holderTick`/`inboxBackup` sob JSON aleatório e adiciona teste `PM-111` red-on-base.

### Refactor: desmembramento de `screens-community.js` (< 25 imports e <= 350 linhas, Fraqueza #14)
- `client/js/app/`: extrai `community-metadata.js` (metadados, `checkCommunityMembership`, `dispatchCommunityModAction`), `community-data.js`, `community-controls.js`, `community-listing-handlers.js`, `community-topic-screen.js` (`showTopic`, `resolveTopicContent`) e `screens-vote.js` (`showProposal`, `showVote`, apuração e voto), reduzindo `screens-community.js` de 40 para 23 imports (1.280 → 187 linhas) com 0 ciclos.
- `client/js/app/route.js`, `client/js/app/init.js`: importam `showTopic`, `showProposal` e `showVote` dos novos módulos focados.
- `client/sw.js`, `docs/release-metadata.json`: registra os 6 novos módulos em `SHELL_ASSETS` e atualiza `CACHE_NAME` para `vox-pwa-v7.147-community-split`.
- `tests/community-forum-refinements.test.js`: catraca `< 25` imports em `screens-community.js` e preservação de exports.

### Code: LT-06c — corrida de criação de conta entre abas e promoção de teste `storage-corrupt-2`
- `client/js/identity/local-account.js` (`LT-06c`): `createAccountUnlessWiped` confere `!hasStoredAccount()` antes de gravar chave de DM e concluir a criação; se outra aba já gravou `vox-local-account-v1` durante a geração assíncrona de chaves, descarta a semente gerada em voo e adota a conta existente.
- `tests/local-account-race.test.js`, `tests/storage-corrupt-2.test.js`, `docs/process/plano-testes-login.md`: teste `PM-111` red-on-base para `LT-06c` e promoção do `TODO` de `local-account` em `storage-corrupt-2.test.js`.

### Docs: quitação de 102 achados JSDoc em 12 módulos raiz de `client/js/` (`audit:docs` 301 → 199)
- `client/js/` (`central-memory-hydrate.js`, `color-mode.js`, `listing-ui.js`, `peers-blob-affinity.js`, `profile-card.js`, `qr-url-codec.js`, `sig-format.js`, `social-login.js`, `steward-wizard.js`, `storage-persistence.js`, `topic-permaweb.js`, `upload.js`): cabeçalhos `@file` e JSDoc (`@param`, `@returns`) nos exports.
- `scripts/docs-debt.json`: podado via `npm run audit:docs -- --prune` (dívida cai de 301 para 199 achados; os 12 módulos zerados).

### Code: LT-07a/b/c — proteção contra redesenho no `hashchange`, focus trap/Escape e retomada do kit de e-mail
- `client/js/app/onboarding.js` (`LT-07a`): `checkOAuthEnrichStep` não redesenha o modal quando `#oauth-enrich-overlay` já está aberto.
- `client/js/render/genesis-entry.js`, `client/js/render/focus-trap.js` (`LT-07b`): `renderOAuthEnrich` ativa focus trap (ignorando seções `[hidden]` e tratando `Escape`), foca o primeiro campo ao abrir e `closeOAuthEnrich` devolve o foco ao elemento anterior.
- `client/js/app/onboarding-email.js` (`LT-07c`): `resumeGenesisEmailKit` reconstrói `to` e `copyText` do `mailtoUrl` salvo em `sessionStorage`, mantendo copiar e baixar funcionais após recarregar a página.
- `tests/onboarding-reload-keyboard.test.js`, `docs/process/plano-testes-login.md`: 3 testes `PM-111` red-on-base.

### Code: LT-06b (cache de conta entre abas) e leitura JSON segura em `local-account.js`
- `client/js/identity/local-account.js`: `getCachedRouteIdSync` e `syncCurrentAccountMetadataToVault` descartam `cachedAccount` quando `vox-local-account-v1` foi apagado do `localStorage` por outra aba (`LT-06b`), impedindo que a conta apagada fique viva em memória ou ressuscite em `vox-accounts-vault-v1`; leituras de JSON (`readVaultMap`, `getProfileEnrichment`, `getPixKey`, `loadStoredLocalAccount`) passam por `readStoredRecord`/`isPlainRecord` (`keystore.js`).
- `client/js/identity/tab-sync.js`, `tests/tab-sync.test.js`, `docs/process/plano-testes-login.md`: limpeza incondicional ao recarregar storage vazio e testes `PM-111` red-on-base.

### Code: cofre na malha — teto de pedidos pendentes por guarda contra flood de avisos
- `client/js/vault/mesh-vault.js`: `addNotice` deixa de descartar avisos antigos não decididos (`slice(-50)`) e aplica teto de 7 avisos pendentes por guarda (`MAX_NOTICES_PER_HOLDER = 7`, teto total 50).
- `client/js/app/mesh-vault-flow.js`: `noteNewRequests` limita a 7 pedidos em aberto não decididos por dona em cada guarda (`MAX_REQUESTS_PER_OWNER = 7`), impedindo que flood de pedidos desloque o pedido inicial da fila de veto.
- `tests/mesh-vault-adversarial-flow.test.js`: reativa teste adversarial de flood de 60 pedidos (`PM-111` red-on-base).

### Code: bordas adversariais do cofre v2 e arquivo cifrado (`.voxid`)
- `client/js/vault/vault-crypto.js`: `encryptVaultV2` valida `iterations` inteiro dentro da faixa aceita por `isV2Record` (`[100_000, 5_000_000]`), recusando com `RangeError` antes de gravar cofre que o app não abriria.
- `client/js/identity/account-backup-wrap.js`: `decryptWrappedBytes` decodifica `env.salt` dentro do `try/catch`, devolvendo erro amigável quando o Base64 do sal está corrompido.
- `tests/cofre-envelope-adversarial.test.js`, `tests/cofre-link-e-backup-adversarial.test.js`: 2 `test.todo` (`🔴`) promovidos a testes ativos (PM-111 red-on-base).

### Code: drena corpo HTTP em erros relay (413/429)
- `readResponseText` em `fetch-timeout.js`; `central-memory`, `graphql` e `upload` leem o corpo antes de fechar a resposta.

### Docs: PM-112 spike mutação Tier A
- `docs/process/pm-112-mutation-spike-2026-11.md` — Stryker adiado; PM-111 + adversarial até F2.

## [2026-11-19] — SW `v7.146-dm-limits-6b` (release #296–#302)

### Release
- `develop` → `main`: #296 mapa BR · #297 IXV/docs · #298 foto comunidade · #299 accept raster · #300 DM 32k + ledger react/read · #301 gatilho INF · #302 [`pacote-anti-bus-factor.md`](./docs/operations/pacote-anti-bus-factor.md). Pós-deploy: hard refresh ([`ops-pages-rollback.md`](./docs/operations/ops-pages-rollback.md)).

### Code: DM #6b — teto de texto 32k e anti-replay de reação/leitura
- `MAX_DM_TEXT_CHARS` (32.768) em `dm-messenger.js`; `maxlength` no compositor; payload acima do teto não vira balão.
- `dm-envelope-ledger.js` + `dm-wire.js`: `env.id` de react/read processado uma vez (`duplicate` no replay).
- SW `v7.146-dm-limits-6b`. Testes adversariais reativados.

### Code: foto de comunidade — raster, compressão e filtro na malha
- `client/js/shared/raster-file-to-jpeg.js`, `community-avatar-image.js`: JPEG na criação/troca; `sanitizeMediaUrl` na renderização; gossip `community`/`community_update` recusa SVG e data URL acima do teto.
- DM reusa `compressRasterFileToJpegDataUrl`. Testes `tests/community-avatar-image.test.js`.

### Docs: catálogo IXV (Énóis → Vox) e glossário (nov/2026)
- `docs/brainstorms/brainstorm-enois-observacao-2026-11.md`: ondas 1–3 com IXV-01…14, §6 índice, §7 explicações (Salas Precisas, Nota de contexto, Coluna).
- `docs/GLOSSARIO.md`: subseção candidatos IXV (**Ágora**, **Explorar**, **Coluna** = blog, Salas Precisas).
- `docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md`: **Ágora** na aba do feed (duplo sentido grego + agora).
- `docs/strategy/mapa-mapa-ecossistema-aposentado-2026-11.md`: §4.2 ponte ao catálogo IXV.

### Docs: alavancas do mapa, observação Énóis, spec PM-23 (nov/2026)
- `docs/strategy/mapa-mapa-ecossistema-aposentado-2026-11.md`: §4.2 Énóis expandido; §4.4 cinco alavancas; §4.5 top 5; §3.1 próxima checagem 2027-02-19; §8 fontes reordenadas.
- `docs/brainstorms/brainstorm-enois-observacao-2026-11.md` (novo): 11 rotas, não-copiar, ondas candidatas.
- `docs/specs/modo-assembleia-v0.md` (novo): stub PM-23 (Loomio/Decidim, rituais, campos planos). Sem código nem bump de SW.

### Docs: mapa do tecido social digital BR (nov/2026)
- `docs/strategy/mapa-mapa-ecossistema-aposentado-2026-11.md`: rede P2P BR de referência reclassificado (concorrente P2P, Conf. A, PolyForm); §2.2 Fediverso BR; §2.3 cívico; §3.1–3.2 tracking; §4 radar de aprendizados; Énóis (GPL-3.0); **Sua Voz** mantida; notas POSITIONING/LESSONS. Sem código nem bump de SW.

### Code: D4 repost-index, ciclo onboarding, D5 SIGV2 ensaio e PM-01 passo 1 (SW `v7.144`)
- `client/js/repost-index.js`: normaliza `localStorage` não-objeto; promove `2 todo` em `tests/repost-index.test.js`.
- `client/js/app/onboarding-oauth-ui.js` (novo): UI OAuth compartilhada; `screens-network.js` abre modal via `import()`; `scripts/cycles-debt.json` **0 ciclos**.
- `client/js/app/route.js`: rotas voxpedia, ajuda-teste e labs/dungeon em `import()` dinâmico; precache −18 arquivos (~2,58 MiB).
- `tests/sig-format.test.js`: ensaio `SIGV2_FROM` (D5).
- `docs/ROADMAP.md`, `docs/strategy/mvp-tecnico-vox-2026-11.md`, `docs/audits/auditoria-features-arquitetura-2026-11.md`: banner e DoD pós-#290–#292.

### Docs: revisão PTLD e reorganização escaneável do `README.md`
- `README.md`: reestruturado (~361 → 269 linhas) preservando todos os fatos e os padrões do `scripts/release_line.py` — alerta `[!IMPORTANT]` de estado logo no topo (laboratório sem piloto, `arweaveUpload: false`, sinalização 1× Render + Nostr sem TURN, infra adiada até >50 ativos, `main` atrás de `develop`), navegação rápida em lista, arquitetura tripartite (`Vox` / `Vox Populi` / `Vox Memoria`, Steward kit ≠ 4º produto e mini-Mermaid de nó único), matriz de plataformas em 3 colunas, quickstart com requisitos (Node ≥ 22, Python 3.11+, `npm ci`, `npm run validate`), capacidades em 5 temas responsivos com legenda fixa (`✅`/`🧪`/`🚧`/`⏸️`) conferida contra `docs/FEATURES.md`, novidades e tags em `<details>`, diagrama Mermaid de arquitetura, seção de transparência técnica, jargão alinhado ao `GLOSSARIO.md`, remoção de nomes legados (`Nó Zero`/`Node Zero`), um emoji único por H2 e links para `mvp-tecnico-vox-2026-11.md`, `auditoria-features-arquitetura-2026-11.md` e `SECURITY.md`.
- `docs/release-metadata.json` e selo/nota de testes no `README.md`: regerados por `npm run release-line` pós-#290/#291 (**2279 passing · 9 skipped · 13 todo**, total 2301 = 1981 JS + 320 Python). Sem código de produto nem bump de SW.

### Docs: taxonomia tripartite `Vox` · `Vox Populi` · `Vox Memoria` e Conexão local (ADR-011)
- `docs/adr/011-taxonomia-tripartite-produtos-vox.md`: emenda formalizando cliente único (`Vox`), nó de apoio + dashboard simples (`Vox Populi`) e nó de memória perene + dashboard CPU/disco/banda (`Vox Memoria`, substituindo `VoxPopuli-ZeroMemory` / `Node Zero`), além de **Conexão local** (*Usando seu nó*, substituindo `Local Boost`) e exclusão mútua de nó local (`Vox Populi` XOR `Vox Memoria`, encerramento limpo ao trocar).
- `docs/GLOSSARIO.md`, `README.md`, `docs/strategy/analise-repositorio-vox-2026-11.md`, `docs/operations/steward-relay-kit.md`: alinhados à nova nomenclatura. Sem alteração de código nem bump de SW.

### Docs: spec do MVP técnico da plataforma (DOC-07, nov/2026)
- `docs/strategy/mvp-tecnico-vox-2026-11.md` (novo): especificação do MVP técnico em 10 seções (recorte do núcleo offline vs lazy vs labs, recuperação soberana, segurança e `SIGV2_FROM`, descentralização honesta sem TURN/Arweave write, escalabilidade incremental PM-01/REV-02/ADR-035/INF >50, corte explícito fora do MVP e DoD verificável); indexado em `docs/README.md`. Sem código de produto e sem bump de SW.

### Docs: relatório de auditoria (Fases 1–3) e alinhamento de `FEATURES.md` (DOC-06, nov/2026)
- `docs/audits/auditoria-features-arquitetura-2026-11.md` (novo): consolidação empírica das Fases 1–3 (README × fatos, camadas/ciclos/portas ADR-035 e PM-01, matriz `FEATURES.md` × código × testes e top 10 gaps doc vs código); indexado em `docs/README.md`.
- `docs/FEATURES.md`: revisado em 19/11/2026 — corrige `idb-store.js` e `node-health-*.js` (todos em `labs/parado/` / `UNPLUGGED_MODULES`), acrescenta Cofre na malha (ADR-037) e `identity/tab-sync.js`, corrige referência de teste `signed-verify` → `assinaturas-e-sinais-malicioso` e atualiza 18 caminhos pós-ADR-035 / #177 (`identity/`, `vault/`, `app/`, `labs/parado/`). Sem bump de SW.

### Docs: README e metadados de release alinhados ao código (auditoria fase 1, nov/2026)
- `README.md`: selo de armazenamento deixa de dizer "Arweave Permaweb" (gravação pausada, REV-07); badge de testes **2276 passing · 9 skipped · 16 todo**; tabela e nota `develop` vs `main` e Release `v7.40`; Android 7.0+; ADRs apontam para o índice (39); PM-83 em laboratório; PR para `develop`; link para [análise do repositório](./docs/strategy/analise-repositorio-vox-2026-11.md).
- `docs/release-metadata.json`: regerado por `npm run release-line` (`667fcda`, 1981 JS + 320 Python = 2301).
- Sem bump de SW. `main` segue no release #262; o README só chega à `main` no próximo release.

### Docs: prompt Claude auditoria + MVP técnico (nov/2026)
- `docs/process/prompt-claude-auditoria-mvp-tecnico-2026-11.md`: missão em 4 fases (README, camadas, FEATURES, spec MVP); indexado em `docs/README.md`. Sem bump de SW.

### Docs: análise honesta do repositório (nov/2026)
- `docs/strategy/analise-repositorio-vox-2026-11.md`: retrato versionado (arquitetura, três portões, gatilho INF >50, estado Git pós-#281–#283); indexado em `docs/README.md`.
- `docs/ROADMAP.md`: nota de leitura calendário 2027 × INF; "Onde estamos" aponta gatilho >50. Sem bump de SW.

### CI: keepalive do Render tolera partida a frio (#280)
- `sentinel-keepalive.yml`: 60 s por tentativa, até 3 tentativas com pausa de 10 s; só conta falha se as 3 falharem, e o log/issue dizem quantas tentativas e o tempo de cada. Aviso no arquivo e no runbook: o cron do GitHub não é pontual; pinger externo de 5 em 5 min é decisão do dono. Sem bump de SW.
### Docs: infra dos relays adiada até 50 usuários ativos (ROADMAP INF-01…04)
- `docs/ROADMAP.md`: seção com o gatilho de >50 usuários ativos e quatro itens preparados (TURN, segundo nó, `VOX_RELAY_TRUST_PROXY_HOPS` e pinger externo, snapshot autenticado no cliente), com runbook e RFC já em `develop`.
### Correção: snapshot do relay cego autenticado (RFC 0002, opção A, modo `compat`)
- `relay/snapshot_auth.py` (novo) e `relay/blind_relay.py`: `POST /relay/snapshot/<canal>` lê `X-Vox-Snapshot-Proof` (64 hex); o relay guarda só o SHA-256 (`ownerHash`) e o primeiro a provar vira dono. Dono diferente ou ausente → `403`; tetos de salto `MAX_COVERED_JUMP` 1000 e `MAX_EPOCH_JUMP` 16 (`VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP`/`_MAX_EPOCH_JUMP`); conflito → `409` com `currentEpoch`/`currentCoveredSerial`; reenvio idêntico → `200` `"idempotent": true` sem regravar nem podar. **Só snapshot autenticado poda**; `VOX_RELAY_SNAPSHOT_AUTH=compat` (padrão) aceita sem prova como `auth: false` sem podar nem travar, `enforce` dá `403`. Decisão e autorização sob o lock existente; `hmac.compare_digest`; a resposta e o `GET` nunca trazem `ownerHash`. `server.py` mapeia `SnapshotForbidden`→403 e `SnapshotConflict` (subclasse de `ValueError`)→409 e libera o cabeçalho no preflight.
- O relay não recebe o `Host`: sem o segredo ele não consegue conferir `host`/`channelId` dentro da prova; o vínculo está no cálculo do cliente (registrado no RFC §3).
- **Pendente (cliente):** origem do `segredoSnapshot` (D2), `EpochCompactor` enviar a prova e conferir `sig` antes de aplicar; enquanto isso nenhum snapshot chega autenticado e **a poda por snapshot fica desligada** (envelopes saem só pelo TTL de 7 dias). Reinício do dono pelo steward: apagar `latest_snapshot.json` do canal. Testes: `relay/test_blind_relay_snapshot_auth.py` (34); os dois `skip` de `TestSnapshotSemAutenticacao` viraram 7 testes; `test_store_snapshot_and_prune_deltas` e os testes de poda do adversarial agora mandam a prova (sem prova não se poda mais). RFC 0002 `accepted`; `relay-api.md` lacuna 12 e kit do steward atualizados. O `skip` do aviso de corte no `GET` segue aberto. Sem bump de SW.
### Correção: sinalização (`signaling.py`) com a mesma política de origem do relay completo (R6)
- Fim do `Access-Control-Allow-Origin: *` e do `Allow-Headers: *`: o CORS usa `request_guard.cors_allow_origin` (valor da lista, `Vary: Origin` sempre, nada de `Allow-*` para origem estranha). O handshake do WebSocket recusa com `403` `Origin` fora da lista ou com caractere de controle; sem `Origin` (cliente nativo, nó Linux) segue permitido. App no GitHub Pages/Cloudflare Pages e `localhost` continuam conectando. Testes: `relay/test_signaling_origem.py` (10); `test_signaling.py` não afirma mais `*`. Sem bump de SW.
### Segurança: contêiner do relay roda como `vox` (não-root), sem senha de modelo no coturn e portas no host só em loopback
- `relay/Dockerfile`: usuário `vox` (uid 10001), `USER vox`, `VOLUME` para `/app/.cache` e `/app/.inbox` (dono `vox`), `HEALTHCHECK` com stdlib em `/health`. A sinalização continua em `0.0.0.0` só dentro do contêiner.
- `relay/deploy/docker-compose.yml`: portas 3921 e 3920 publicadas em `127.0.0.1` por padrão (`VOX_SIGNALING_BIND` / `VOX_RELAY_BIND` para abrir de propósito) e healthcheck por serviço.
- `relay/deploy/turnserver.conf`: senha de modelo trocada por placeholder `__DEFINIR_SENHA_TURN__` (coturn recusa autenticação até o runbook definir a credencial real).
- `relay/render.yaml`: comentário sobre `VOX_RELAY_TRUST_PROXY_HOPS` não definido; valor é decisão do dono do deploy.
- Testes: `relay/test_infra_layout.py` (+4: USER não-root, HEALTHCHECK, sem senha no turnserver, publicação só em loopback). Build da imagem não rodado aqui (Docker indisponível): NOT RUN. Sem bump de SW.
### Docs: divergências doc × código (HARDENING, ADR-002, ADR-021, release-metadata)
- `HARDENING.md`: dívida de camadas é 0 (`layers-debt.json` com `violations: []`); ADR-002 ganha emenda 1 (relay `POST /oauth/exchange`); ADR-021 status "implementado, §2.6 aberta"; `release-metadata.json` e README regenerados (315e334, 1962 JS + 244 Python).
### Correção: CSP — `frame-src` vira lista explícita (R7 da revisão DevSecOps)
- `client/index.html` e `client/_headers`: `frame-src 'self' blob: https:` passa a `'self' blob:` + `accounts.google.com`, `www.facebook.com`, `web.facebook.com`, `staticxx.facebook.com` (os únicos iframes de rede são os dos SDKs de `oauth-profile.js`; os cartuchos usam `srcdoc`).
- Mantidos de propósito: `script-src` com `accounts.google.com` e `connect.facebook.net` (`signInWithGoogle`/`signInWithMeta*` ainda carregam esses scripts quando o operador configura `oauth.json`); `connect-src https: wss:` (relay, gateway, PDS Bluesky e Turbo digitados pela pessoa); `img-src`/`media-src https:` (avatar e mídia de posts vêm de URL remota arbitrária).
- `tests/csp.test.js`: 2 testes novos (`frame-src` sem `https:` solto; `script-src` só com hosts que o código ainda usa).

### Documentação: RFC 0002 propõe autenticar o snapshot do relay cego (lacuna 12 do `relay-api.md`)
- `docs/rfc/0002-snapshot-autenticado-do-relay-cego.md`: prova de dono por cabeçalho no padrão do ADR-027, teto de salto de `coveredSerial` e `epoch`, idempotência, modos `compat`/`enforce`, ataques e testes que fecham os `skip`. **Só proposta, sem código** (`relay/*.py` intocado); decisões D1–D7 pendentes do dono. `docs/specs/relay-api.md` marca a lacuna 12 como proposta. Sem bump de SW.
### Docs: runbook de TURN em produção e segundo nó de sinalização (R10)
- `docs/operations/turn-e-segundo-no.md`: estado medido, caminho A (Worker Cloudflare), caminho B (coturn), segundo nó com failover e variáveis do relay, checklists e decisões do dono. Só documento; limites de free tier marcados NÃO VERIFICADO. Sem bump de SW.
### Correção: gossip P2P com teto de tamanho, tipo só de lista e sincronização que não amplifica banda (R3)
- `client/js/peers.js`: mensagem acima de 1 MiB, post/edição/lápide acima de 512 KiB e cartão acima de 64 KiB são descartados em silêncio e contados (`getGossipDropCounts()`: `oversizedMessage`, `oversizedItem`, `oversizedProfileCard`, `unknownType`); tipos vêm de um `Map` (antes `obj[type]`: `"__proto__"` derrubava `handleVoxMessage`). Constantes e contadores em `peers-gossip-profile.js` (já no precache do SW).
- `client/js/peer-sync.js`: `nonce` e hashes só valem como texto; `SYNC_WANT` só é servido uma vez e só com o nonce do nosso inventário; `loadBlob` que lança deixa o post ir sem blob. `post-supersede.js`: lápide só com `ts` também vale. Testes: os 8 `test.todo` de `p2p-gossip-malicioso` e `peer-sync-malicioso` viraram testes (+2 novos). Sem bump de SW.
### Correção (R1, cripto): transporte Nostr verifica assinatura e não deixa tomar o `peerId` de outro
- `client/js/nostr-transport.js`: `handleEvent` confere formato, kind, sala, destinatário e frescor (±10 min) e depois `verifyEvent` (id + Schnorr) antes de qualquer efeito. O `hello` não ganhou campo: a assinatura do próprio evento cobre pubkey, sala e `peerId`. O primeiro pubkey de um `peerId` vale em `hello`, `peer-info`, `offer`, `answer` e `ice` (antes uma `offer` com `from` alheio sobrescrevia o par). `peer-info` valida tipo e tamanho de `address` (≤256) e `dmPub` (objeto ≤4096 em JSON); evento acima de 128 KiB e `peerId` acima de 128 caracteres são descartados. `b64` deixa de estourar a pilha com payload grande.
- `client/js/nostr-event.js`: `isFreshEvent` e `createSeenWindow` (ids só de eventos verificados, teto 4096 e prazo de 20 min); a janela antiga de 2000 ids era esvaziável por eventos sem assinatura.
- `client/js/nostr-signaling.js`: candidato precisa ser `wss://` com host e sem credenciais; `ws://` e `wss://` vazio saem.
- Testes: os seis `test.todo` de bug de `tests/assinaturas-e-sinais-malicioso.test.js` viraram testes normais, mais seis novos ali e dois em `tests/nostr-event.test.js`. Pendente (arquivo de outra sessão): `getNostrRelays` em `webrtc-peer.js` ainda repassa `ws://` ao transporte. Sem bump de SW.
### Arquitetura: catraca de ciclos de import (ADR-035 §3.4); ciclo `identity/inbox-backup` ↔ `own-posts` desfeito
- `scripts/cycles-audit.mjs` + `cycles-lib.mjs` (chamado por `npm run audit:layers`): componentes fortemente conexos do grafo de imports estáticos por AST; baseline em `scripts/cycles-debt.json` (1 componente de 3 módulos, só desce). `inbox-backup.js` carrega `own-posts.js` por `import()` (sem mudar comportamento). Testes: `tests/cycles-audit.test.js` (4). Sem bump de SW.
### Correção: `Access-Control-Allow-Origin` sai de constante, não do cabeçalho `Origin` (CodeQL 283, py/http-response-splitting)
- `request_guard.cors_allow_origin` devolve a entrada correspondente de `APP_ORIGINS` / `VOX_RELAY_ALLOWED_ORIGINS` (ou a origem de loopback reconstruída de esquema e nome fixos e porta numérica) em vez de ecoar o texto recebido, e recusa origem com CR, LF, tab, espaço, NUL ou outro caractere de controle antes de comparar. Origem de loopback com caminho, usuário ou porta inválida deixa de receber CORS. Testes: `relay/test_cors_origens.py` (13). Sem bump de SW.
### Correção: busca upstream de transação só com id já validado (CodeQL 287)
- `relay/server.py`: `_fetch_transaction` recusa imediatamente se `is_tx_id` falhar (43 caracteres, conjunto fixo), antes de montar o URL nos gateways da lista fechada. Sem bump de SW.
### Correção: caminho do cofre na memória central via `safe_path.child_of` (CodeQL path-injection)
- `relay/vault_store.py`: arquivo `vaults/<id>.json` só é resolvido com `child_of` após validar o nome. Sem bump de SW.
### Correção: e-mail e Senha Soberana fora de `sessionStorage` (CodeQL 282 / 284)
- `app/onboarding-email.js`: o rascunho (`vox-genesis-resume-v1`) guarda só passo, nome e sinalizadores; `pass` e `email` são descartados em `writeGenesisResume`. Após recarregar, e-mail e senha voltam vazios (foco no primeiro campo do passo); na espera da malha a pessoa preenche os dois de novo e o pedido continua pelo endereço em `loadMeshPending`. `readGenesisResume` regrava rascunhos antigos que ainda tinham segredo ou e-mail. Testes: `tests/onboarding-reload-keyboard.test.js`. Sem bump de SW.
### Refatoração: nome externo vira caminho só por `relay/safe_path.py` (alertas CodeQL `py/path-injection` 266–281)
- Novo `child_of(raiz, nome, é_válido)`: validador de caracteres e tamanho (sem regex) como primeira porta e `realpath` do filho com `startswith(realpath(raiz) + os.sep)` como segunda; recusa com `ValueError` (inclui symlink para fora da raiz). Usado em `blind_relay.py` (canal, envelopes, snapshot), `inbox.py` (caixa e mensagem) e `server.py` (`/tx/`, `/vox/index/`, `POST /vox/mirror`). `TX_ID_REGEX` e os demais padrões viram funções de conjunto de caracteres (`is_tx_id`, `is_index_name`, `_is_stored_name`); o `$` aceitava `\n` final. Respostas HTTP iguais; `inbox` com endereço só de símbolos (ex. `!!!`) deixa de gravar na raiz da caixa e passa a recusar. CodeQL não foi rodado localmente: a prova é o job do CI. Nome acima de 255 caracteres é recusado antes do validador e nenhuma regex toca texto externo (`py/polynomial-redos`, alertas 285 e 286). Testes: `relay/test_safe_path.py` (17). Sem bump de SW.
### CI: `red-on-base` só roda contra a base em PR `fix:`; teste de importar posts não depende de turnos do loop
- `scripts/red-on-base.mjs`: PR que não é `fix:` (inclusive `release:` para `main`) não executa os testes novos contra a base; antes o job estourava 10 min com testes que travam na base. O veredito `info` agora diz que não rodou.
- `tests/app-own-posts-ui.test.js`: `importar: arquivo da própria conta…` espera a condição (`waitFor`) em vez de 20 `setImmediate`, que falhava no Node 24 do CI.
### Correção: CORS do relay completo reflete só origem permitida (THREAT-MODEL T32)
- `relay/server.py` deixa de mandar `Access-Control-Allow-Origin: *`: reflete a origem só se for do app (GitHub Pages, Cloudflare Pages), `localhost`/`127.0.0.1` ou de `VOX_RELAY_ALLOWED_ORIGINS`, e sempre manda `Vary: Origin`. Origem estranha ou ausente não recebe `Allow-Origin`, `Allow-Methods`, `Allow-Headers` nem `Allow-Private-Network` (preflight incluso). Testes: `relay/test_cors_origens.py` (9). Pendente: `signaling.py` (só saúde) e `ZeroCentralMemory.cs` ainda usam `*`. Sem bump de SW.
### Correção e testes: transporte Nostr não lança com evento malformado; 15 suítes resgatadas das sessões S30
- `client/js/nostr-transport.js`: `tagValue` aceita evento sem lista de tags ou tag que não é lista (antes `TypeError`).
- Testes novos (dados das sessões Claude da rodada S30, que não tinham equivalente em `develop`): `app-*` (5), `assinaturas-e-sinais-malicioso`, `p2p-gossip-malicioso`, `peer-sync-malicioso`, `boot-scripts`, `qr-url-gf`, `repost-index`, `cofre-envelope-adversarial`, `cofre-link-e-backup-adversarial`, `identidade-chaves-adversarial`. Bugs conhecidos entram como `test.todo`.
### Correção: teto global de conexões no servidor de sinalização
- `relay/signaling.py`: `ThreadedTCPServer` passa a limitar conexões simultâneas (padrão 64, `VOX_SIGNAL_MAX_CONNECTIONS`); acima do teto a conexão nova é fechada na hora, no mesmo padrão de `VoxRelayServer`. Limites por IP (`signal`, `signal_msg`) inalterados. Testes: `relay/test_signaling_connection_cap.py` (5). Sem bump de SW.
### Correção: backpressure do chunked-transfer não deixa setInterval nem listeners pendurados
- `waitForBackpressure` centraliza limpeza do poll (`BACKPRESSURE_POLL_MS`), remove listeners de `bufferedamountlow` / `close` / `error` e honora `AbortSignal`; `sendChunksWithBackpressure` aceita `options.signal` e `ChunkReassembler.dispose()` solta transferências parciais. Sem bump de SW. Testes: `tests/chunked-transfer-timers.test.js`.
### Acessibilidade: alvos de toque ≥44px no compose, nav e ações de post (S30-S12)
- Composer inline (ícones de anexo e **Postar**), abas da sidebar com `pointer: coarse`, curtir/comentar/salvar no feed e overlay de foto passam a `min-height`/`min-width` de 44px só em toque ou viewport ≤767px; botões primários do compositor Ágora (`agora-btn`) e fechar gaveta (`agora-icon-btn`) no mesmo critério. Desktop com mouse mantém densidade anterior. Sem bump de SW — checagem manual: DevTools modo responsivo + inspecionar caixa de toque nos três fluxos.
### Correção: clickjacking no GitHub Pages (THREAT-MODEL T33)
- `client/boot-frame-guard.js` (script estático fora de `client/js/` para não exigir entrada no precache do SW): no boot, se a página não é a janela de topo, esconde o shell e mostra aviso com link `target="_top"`. Testes: `tests/boot-frame-guard.test.js`.
### Correção: toasts anunciam por aria-live sem roubar foco
- `showToast` atualiza regiões `vox-toast-status` (`polite`) e `vox-toast-alert` (`assertive` em erros); o balão visual fica com `aria-hidden`. O shell injeta as regiões no markup. Testes: `tests/toast-live-region.test.js`. Sem bump de SW.
### Correção: integridade e timeout do carregador arweave (S27)
- `client/js/arweave-lib.js` exporta o sha384 do inventário, valida o timeout HTTP (1–120 000 ms) e confere o bundle vendorizado antes do `import()`, alinhado a `docs/DEPENDENCIAS.md`. Testes: `tests/arweave-integridade.test.js`. Sem bump de SW (comportamento só em caminhos Arweave já raros com `arweaveUpload` desligado).
### Acessibilidade: foco do teclado após publicar no compositor
- Após publicação bem-sucedida, o foco vai para o gatilho recolhido do feed ou para a região de anúncio da etapa de revisão (compositor em etapas, resposta e feira). Testes: `tests/compose-focus-after-publish.test.js`. Sem bump de SW.
### Correção: preso de foco em modais e menu ⋯ (S30-S9)
- Módulo reutilizável `client/js/render/focus-trap.js`: Tab e Shift+Tab circulam dentro do diálogo; ao fechar, o foco volta a quem abriu.
- `modal-host` liga o preso quando o contêiner ganha conteúdo; `clearModalHost` desliga e restaura o foco.
- Menu ⋯ da publicação (`post-more-menu`) usa o mesmo preso enquanto a folha está aberta.
- Testes: `tests/focus-trap.test.js` (DOM falso em Node). Sem bump de SW.
### Acessibilidade: alt significativo ou decorativo em imagens do feed, lightbox e compositor
- Posts com legenda visível passam a usar `alt=""` na hero (evita repetir título/corpo para leitores de tela); `imageAlt` explícito, foto sem legenda e prévia do compositor inline seguem regras dedicadas (`photo-chrome.js`, `composer-media.js`, `post-media-lightbox.js`). Testes: `tests/image-alt.test.js`. Sem bump de SW.
### Testes: esperas fixas em suíte legada trocadas por timers simulados ou awaits
- Nove arquivos em `tests/` (`node-health-api`, `contact-notify`, `dom-delegates`, `mesh-vault-ui`, `webrtc`, `chunked-transfer`, `signaling-telemetry`, `nostr-ephemeral-relay`) deixam de usar `setTimeout` real onde dava para manter o comportamento com `mock.timers`, microtarefas, `setImmediate` ou awaits explícitos (`peer-sync.test.js` mantém 50 ms: inventário é disparado sem `await` em `announce`). `tests/setup.js` intocado. Sem bump de SW.
### Testes: login com rede ruim (LT-02 resto, S30-S7)
- `tests/login-rede-ruim.test.js`: relay falso por `fetch` (fora do ar, 5xx, JSON ilegível, lixo, queda no meio); criar e restaurar cofre v2 com cripto real; mensagens honestas (LAN-21) e avisos de `handleRestoreFailure` na volta sem servidor ou com cofre corrompido; separa 5xx de “sem servidor”. Pendência anotada: `probeVaultUrl` sem timeout (S3 / `fetch-timeout`).

### Correção: GET do cofre com corpo ilegível não finge “sem servidor”
- `client/js/vault/vault-store.js` (`probeVaultUrl`): quando o relay responde HTTP 200 mas o JSON quebra, o servidor conta como alcançado (`reachable: true`) em vez de offline; a volta não marca `noServer` e a tela não pede link do e-mail à toa. Prova: `tests/login-rede-ruim.test.js` (red-on-base). Sem bump de SW.
### Correção: conta e rota sincronizadas entre abas (S30-S5)
- Quando a conta ativa ou o hash mudam em outra aba do mesmo origin, esta aba recarrega a identidade a partir do `localStorage` (`switchActiveAccount` / `ensureLocalAccount`) e repinta a rota, sem criar conta nova. Canal `vox-tab-sync-v0` para hash; `storage` para chaves de identidade. Boot em `initGossipListeners` via `client/js/identity/tab-sync.js` (sem entrada no service worker). Testes: `tests/tab-sync.test.js`.
### Documentação: glossário pt-BR da interface (S30-S25)
- [GLOSSARIO.md](./docs/GLOSSARIO.md): linguagem leiga para termos da UI (conta, cofre, malha, par, guardiões, steward, mensagens, comunidades). Entrada no [índice docs/](./docs/README.md). Sem código e sem bump de SW.
### Documentação: ROADMAP alinhado ao `develop` (login, DM, timeout, render)
- `docs/ROADMAP.md`: cabeçalho **Revisado** em 18/11/2026; *Onde estamos* e **REV-09** com prazos no `relay/signaling.py`; **REV-14** com passo 4 (ADR-037); lacunas **LT-02,06,07,09** e **LT-01,03,04,05,08,10** em *Concluído*; **DOC-04** e **PM-115** com evidência de testes de render/DM. Sem código e sem bump de SW.
### Correção: datas em pt-BR centralizadas e sem "Invalid Date"
- `client/js/shared/date-format.js` concentra `parseInstant` e formatação pt-BR (curta, por extenso e só data). Call sites em `render/util.js`, `aviso.js`, `render/aviso.js`, `app/sorteio-flow.js`, `app/natural-mod-flow.js` e `email-kit.js` deixam de chamar `toLocaleString`/`toLocaleDateString` soltos; instantâneo inválido vira texto vazio. Testes: `tests/date-format.test.js`. Sem bump de SW.
### Correção: registro do service worker sem erro engolido (S30-S28)
- `client/js/boot-sw.js`: falha ao registrar `./sw.js` passa a ir para `console.warn` em vez de um `catch` vazio; o app continua sem offline naquele aparelho, mas fica rastreável em diagnóstico. Sem bump de SW (só o boot).
- Testes: `tests/boot-sw.test.js`.
### Correção: jargão nas telas de status, pacto e i18n (S30-S15)
- `#/status`, pacto de boas-vindas e `i18n-pt-br.js` passam a usar português claro alinhado ao glossário da interface (malha, aparelhos, servidor comunitário), sem `gossip`, `verifyPayload`, `IndexedDB` ou `PM-18` na superfície. Algoritmo da conta (`P-256`) permanece visível na tela de status.
- Testes: `tests/jargao-ui.test.js` (novo, 4 casos; falham na base por asserção). Sem bump de SW.
### Testes: LT-08 E2E de login sem falso verde (S30-S2)
- `scripts/login-e2e.mjs`: exit 1 em falha real; `pageerror` do Chromium passa a ser asserção (antes só acumulava); import do Playwright sem `catch` mudo; variáveis `PLAYWRIGHT_CORE_PATH` e `CHROMIUM_EXECUTABLE_PATH` documentadas no cabeçalho.
### Testes: fumaça offline no navegador (S30)
- `scripts/offline-e2e.mjs`: Chromium headless, só loopback; após precache do Service Worker, emula offline e recarrega (servidor local inalcançável), classifica falha de rede como `offline` e cria conta só com nome com chip **Offline** visível. Manual do mantenedor (fora do CI), mesmo modelo que `scripts/login-e2e.mjs`. Sem bump de SW.
### Testes: lacunas em `client/js/app/` (S30-S18)
- Novos: `tests/navigation.test.js` (desvio `setRoute`/`route`), `tests/context-shell.test.js` (`makeShellProps`, quarentena no compartilhar), `tests/route-wire.test.js` (`wireRoute`, `routeImpl`, `routeTitle` e `#/settings/network`). Sem bump de SW.
### Testes: lacunas S30-S21 (`short-id`, `post-supersede`)
- `tests/short-id.test.js`: encurtamento de `vx_`, `0x`, `did:` e conta oficial para rótulo.
- `tests/post-supersede.test.js`: `isSupersededLocally` com lápide, versão local mais nova e choque de autor. Sem bump de SW.
### Testes: malha — inventário peer-sync, tetos PM-52 e ingestão de cache-manifest
- `tests/peer-sync-wants.test.js`: `computeWants`, `inventoryMessage` e ordem de `messagesForWant` (remoções antes de posts e cartões).
- `tests/peers-settings-cap.test.js`: `clampCellularCapMb`, `canServeNow` (Wi-Fi, `wifiOnly`, teto no 4G) e normalização ao salvar preferências.
- `tests/peers-cache-manifest-guard.test.js`: ingestão rejeita formato, assinatura e `communityId` divergente; manifesto antigo não sobrescreve o mais novo; pins de várias comunidades viram prioridade WANT. Sem bump de SW.
### Testes: feed, revisão e canal (`render/`)
- `tests/render-feed-review-channel.test.js`: painel de comentários e composer aninhado escapam ids hostis; quarentena local desabilita compartilhar com `data-id` seguro; pílula "em revisão" e shells do canal. Complementa PR #232 (dm, pauta, tag-polis). Sem bump de SW.
### Testes: cofre no armazenamento e limpeza local (S19)
- `tests/vault-store-adversarial.test.js`: cópia local revogada não expõe registro; JSON corrompido no aparelho cede ao cofre remoto mais novo; gravação local/remota e revogação com marca `revoked`.
- `tests/account-backup-wrap-adversarial.test.js`: `peekBackupKind`, senha vazia, adulteração do envelope e iteração fora da faixa no wrap do arquivo de soberania.
- `tests/local-wipe-adversarial.test.js`: confirmação dupla, política de chaves pessoais vs neutras e tolerância à ausência de `indexedDB`. Sem bump de SW.

### Correção: relay cego não perde deltas no cold boot; memória central confere item e blob
- **Snapshot apaga por serial, não por timestamp:** só somem os envelopes com `0 < serial <= coveredSerial`; antes, um delta com relógio atrasado e serial acima da cobertura era apagado em silêncio. Snapshot que recua `coveredSerial` agora dá `400` (abriria um buraco). Sem `coveredSerial` nada é apagado (vale o TTL de 7 dias).
- **Listagem:** com `since_serial` a ordem é por serial, então a página cortada em 100 é contígua e o cliente pagina sem pular itens. Arquivo ruim no disco (serial/timestamp fora do formato) não derruba mais a listagem do canal; `serial`/`timestamp` inválidos na entrada dão `400`.
- **Ids de envelope:** derivados do conteúdo (`env_<ts>_<sha256>`); antes, mesmo timestamp com nonce vazio ou igual nos 16 primeiros caracteres sobrescrevia o envelope anterior de outro remetente. Reenvio idêntico é idempotente e não renova a validade.
- **Memória central:** `MAX_ITEM_BYTES` (512 KB) passa a valer para post, perfil, tombstone e manifesto; o SHA-256 do blob é conferido contra `hash` (mesma regra do `computeBlobHash` do cliente), então lixo sob hash alheio deixa de bloquear o blob verdadeiro.
- **Só documentado (mudança de contrato):** snapshot sem autenticação e `GET` sem aviso de corte em 100 ([relay-api.md](./docs/specs/relay-api.md), "Mudanças de contrato pendentes"). Testes: `relay/test_blind_relay_adversarial.py`, `relay/test_central_memory_limites.py`. Teste alterado de propósito: `test_store_snapshot_and_prune_deltas` (poda por serial) e fixtures de blob em `test_server.py` e `test_relay_limites_e_rotas.py` (hash agora confere). Sem bump de SW.
### Correção: storage corrompido nos guardiões, na trava de chaves e nas saídas (rodada 2)
- `guardians.js`, `key-lock.js`, `account-exit.js` e `identity-seed.js` leem o `localStorage` pelos helpers comuns de `identity/keystore.js` (`readStoredRecord`, `writeStoredJson`, `ownRecord`): array, número, string, null, `__proto__` e JSON inválido contam como vazio, sem misturar chaves de índice no mapa nem apagar o que é válido; entradas e divisões malformadas são ignoradas.
- Cota cheia não lança nem finge: `storeHeldShare`, `applyReceipt` e `recordOwnerSplit` devolvem `false`, `dropHeldShare` devolve `null`, `lockKeys` devolve `null` (a cópia anterior segue valendo) e `sendGuardianShares` responde `storage-full` com aviso na tela. Testes: `tests/storage-corrupt-2.test.js`. Casos de `local-account.js` ficam como `todo` no mesmo arquivo.
### Correção: relay atende várias conexões e o 413 chega legível
- `relay/server.py` usava `HTTPServer` (uma conexão por vez, sem prazo de socket): um cliente lento travava todos. Agora é `VoxRelayServer` (`ThreadingHTTPServer`, threads daemon, teto de 64 conexões em `VOX_RELAY_MAX_CONNECTIONS`) e cada leitura/escrita tem prazo de 10 s (`VOX_RELAY_SOCKET_TIMEOUT`). `inbox.py` e `vault_store.save_vault` ganharam lock (um leitor podia ver o JSON pela metade e apagar a mensagem; dois pedidos simultâneos podiam virar os dois dono do mesmo cofre).
- Respostas 413/429 fechavam sem ler o corpo e o cliente recebia reset (erro 10053 no Windows). Agora toda resposta traz `Content-Length` e `Connection: close`, e o relay drena até 1 MiB (máx. 2 s) do corpo pendente antes de fechar. `blind_relay.store_envelope` passa a sanear o `nonce` do envelope (virava parte do nome do arquivo; com `../` ou `\` escapava do diretório do canal). Testes: `relay/test_relay_threading.py` (10). Sem bump de SW.
### Correção: "Apagar conta local" apaga de fato e só diz "apagadas" quando apagou
- Sai também a credencial TURN própria (`vox-custom-turn-config`) e o cache de apelidos→endereço (`vox-handles-cache`); antes ambos ficavam na lista de "neutros". O cofre de chaves (`keystore.js`) fecha cada conexão ao terminar a operação, atende o aviso de versão e `closeKeystore()` solta tudo (e esquece a chave do aparelho em memória) antes de `deleteDatabase`; o armazém de laboratório (`vox-store-db`) também solta a conexão no aviso de versão. Banco que o navegador bloqueia (outra aba segurando) não conta mais como apagado: `wipeLocalDevice` devolve `{ complete, pending }` e o Perfil mostra aviso de erro pedindo para fechar as outras abas. Sem bump de SW (`CACHE_NAME` só no release). Testes: `tests/device-wipe.test.js`.

### Infra: `vox-relay` do docker-compose sobe e `release-binarios` só escreve no release
- `relay/Dockerfile` copia todos os módulos para `/app/relay/` (pacote, `PYTHONPATH=/app`) em vez de quatro arquivos soltos; o `server.py` (que faz `from relay import ...`) passa a subir com `python -m relay.server`. O CMD padrão segue sendo só o sinalizador (`relay/signaling.py`), usado por Render/HF. `relay/.dockerignore` deixa os `test_*.py` de fora; o compose aponta cache e caixa de entrada para os volumes (`VOX_RELAY_CACHE_DIR`, `VOX_RELAY_INBOX_DIR`).
- `release-binarios.yml`: o build roda com `contents: read` (inclusive em `pull_request`); `contents: write`, `id-token` e `attestations` ficam no job `publicar`, que não roda em PR. Sem mudança no SW.
### Correção: cartão de contexto da DM revalidado na tela e na restauração do backup
- A restauração do backup no e-mail gravava o cartão, a citação e a foto da DM crus, e a tela os lia crus: `href` externo ou `javascript:`, foto por URL externa (pixel de rastreio) e campos de 1 MB passavam. Agora `sanitizeStoredDm` normaliza na restauração e `render/dm.js` revalida na leitura (cobre também linhas já gravadas). `id`, `pixKey`, `communityId` e autor da citação acima de 200 caracteres são descartados, não cortados. Testes: `tests/dm-card-restore-adversarial.test.js`.
### Acessibilidade: título e foco por rota; botões só com ícone rotulados
- O roteador (`routeImpl`) passa a definir `document.title` como "Tela · Vox" e mover o foco para o h1 da tela (`tabindex=-1`) (`routeTitle` em `route-parse.js`, `announceRoute` em `route.js`). Botão de ocultar resposta (🛡️) e de remover conta do cofre (✕) ganham `aria-label`. Testes: `tests/a11y-rotas-botoes.test.js`. Sem mudança em `sw.js` (CACHE_NAME fica para o release).
### Correção: apagar conta no meio da criação não traz a conta de volta
- `wipeLocalAccount` passa a incrementar uma época e soltar a criação em voo de `ensureLocalAccount`; a criação confere a época antes de gravar conta, chave de DM e entrada no cofre local e, se o wipe rodou no meio, desfaz a semente e a chave de DM que já tinha gravado. Quem esperava recebe a conta nova, nunca a apagada; chamada feita depois do wipe não entra mais na criação antiga. Duas abas (conta que ressuscita na outra aba) continua fora. `client/sw.js` e `CACHE_NAME` não mudaram. Testes: `tests/local-account-wipe-race.test.js`.
### Correção: vazamentos de WebSocket de sinalização e de listener no lab Open Frames
- `connectSignaling` reaproveita o socket vivo da mesma URL (ou solta e fecha o antigo) em vez de abrir um novo a cada `savePeerSettings`/`initWebRtc`, inclusive em chamadas concorrentes. O lab Open Frames remove o listener `message` ao remontar e ao sair da rota (`hashchange`). `client/sw.js` intocado (CACHE_NAME só no release). Testes: `tests/vazamentos-ws-labs.test.js`.
### Documentação: PRs mesclados que não tinham linha (#181–#218)
Entradas acrescentadas por conferência dos PRs mesclados em `develop` com este arquivo. Só acréscimo; nada reescrito. Os PRs anteriores ao #177 já entram por tema nas seções abaixo. Sem bump de SW.
- **Relay:** rate limit por IP em token bucket, por classe de endpoint (`mailbox`, `beacon`, `write`, `signal`, `signal_msg`), com 429 e `Retry-After` (`relay/rate_limit.py`, #203). Testes de `GET /`, `/status`, `/ping` e `/peer/beacon` (`relay/test_relay_get_endpoints.py`, 7 casos, #194).
- **Segurança e identidade:** "Apagar conta local" passa a apagar toda chave `vox-`/`vox_`/`vox.` do storage (exceto lista de preferências neutras) e os bancos IndexedDB `vox-cache-db`, `vox-keystore` e `vox-store-db` (`identity/local-wipe.js`, #197).
- **DMs:** `tests/dm-adversarial.test.js` (33 casos) e 5 correções pequenas que eles provaram necessárias (#202).
- **Cofre na malha:** testes de relógio nas bordas de 5 min, 24 h e 72 h (LT-05, `tests/mesh-vault-clock.test.js`, 8 casos, #189) e testes adversariais com correções pequenas em `vault/*` e `mesh-vault-flow.js` (#218).
- **Plano de testes do login:** LT-02 falhas de rede (`tests/login-network-faults.test.js`, 7 casos, #207), LT-04 propriedades com semente fixa (#208), LT-08 E2E em navegador local, manual do mantenedor (`scripts/login-e2e.mjs`, #198); matriz do plano atualizada (#216).
- **Testes de rota:** `#/communities` (`tests/route-communities.test.js`, #195).
- **ADR:** emendas de revisão dos ADR-034, 035 e 036, sem mudar status (#181).
- **Documentação:** JSDoc do lote 5, `client/js/render` (#215); 9 âncoras `#L` corrigidas no dossiê arquivado (#191); 4 contradições entre specs, ROADMAP e código (embed, moderador natural, mochila, matriz do CI) (#192); escolha de modelo e esforço por tarefa no método de agentes (#199); fluxo de PR para `develop` no `antigravity-operating.md` (#206).

### Documentação: modelo de ameaças com cinco ameaças abertas (T30–T34)
- [THREAT-MODEL.md](./docs/THREAT-MODEL.md): slowloris no relay, 413 sem drenar o corpo, CORS `*` em GETs sem auth, GitHub Pages sem cabeçalhos de segurança e endereço do cofre v1 sem sal; cada uma com arquivo:linha e mitigação proposta. Só docs; sem bump de SW.
### Documentação: sub-itens abertos de LT-06 e LT-07 no plano de testes do login
- `docs/process/plano-testes-login.md` §5.1 lista, com arquivo:linha, os achados abertos de duas abas e de recarga/teclado. Só documentação; sem correção prometida.

### Docs: relay-api §6 alinhado ao rate limit real e `VOX_RELAY_TRUST_PROXY_HOPS` por deploy
- Referências de linha atualizadas, `signal_msg` descarta sem resposta e por IP, riscos de hops baixo (balde único, caso do nó Render hoje com 0) e alto (spoofing de `X-Forwarded-For`) e valor por host. `client/sw.js` intocado.

### Correção: `fetch` sem prazo ganha timeout (`fetch-timeout.js`)
- Helper `fetchWithTimeout` (AbortController + prazo padrão 8 s, aceita `signal` externo, rejeita mesmo se o `fetch` ignorar o signal). Migrados `central-memory`, `graphql` (inclui `gateways.json`), `upload` e `turn-credentials` (rede muda cai na espera padrão). `central-memory-hydrate` e `memory-server-choice` não fazem `fetch` direto. Teste: `tests/fetch-timeout.test.js`. Release: se o módulo novo entrar no precache, incluir `fetch-timeout.js` em `client/sw.js` (não tocado aqui).
### Correção: erros engolidos na DM não perdem mais chave nem mensagem
- `ensureDmKeys` e a caixa de saída guardam o texto ilegível em `*-ilegivel` antes de regravar; a mensagem vencida só sai da caixa depois de marcada "Não entregue"; `dispatchSealedEnvelope` devolve `failed` quando nem a caixa guardou; DM direta que não abre, reação não enviada e backup que não monta agora avisam a pessoa. Testes: `tests/dm-erros-engolidos.test.js`.

### Correção: avisa no passo de criação quando a conta não grava no aparelho
- `ensureLocalAccount` registra falha de quota/bloqueio e o onboarding mostra aviso em `#oauth-enrich-error` sem travar o fluxo. Testes: `tests/local-account-storage-full.test.js`, `tests/onboarding-steps.test.js`.

### Correção: storage corrompido (JSON não-objeto) não quebra malha nem conta
- Leitores das cópias na malha e das sementes ignoram JSON que não é objeto (top-level e, nas cópias, cada entrada inválida); mesmo tratamento que chave ausente ou JSON inválido. Testes: `tests/storage-corrupt.test.js`.

### Correção: foco no campo certo após erro na entrada (LT-07)
- `setOAuthEnrichError` aceita `focusId` opcional; `validateEmailEntryIssue` aponta nome, e-mail ou senha conforme a falha. Testes: `tests/onboarding-steps.test.js`.

### Correção: entrada retoma após recarga (LT-07)
- Rascunho da criação de conta e espera do cofre na malha voltam no `sessionStorage` após recarregar a página; o pedido à malha continua pelo endereço já gravado. Foco inicial na tela da frase; cartão de impressão fora da ordem de Tab. Testes: `tests/onboarding-reload-keyboard.test.js`.

### Correção: relay — espelho recusa corpo grande cedo
- `POST /vox/mirror` compara `Content-Length` com o teto de 256 KiB antes de ler o corpo e responde 413 com `mirror.body_too_large`, alinhado ao restante dos handlers de escrita.

### Correção: uma só conta quando `ensureLocalAccount` corre em paralelo
- Chamadas simultâneas com armazenamento vazio compartilham a mesma criação em voo e o mesmo `routeId` persistido. Teste: `tests/local-account-race.test.js`.

### Correção: acessibilidade do login (cofre na malha e "Já tenho conta")
- Faixa "Foi você?" é anunciada quando aparece (`role="alert"`, em vez de `alertdialog`); depois de responder, o foco vai para a próxima faixa ou para um lugar estável, e não cai no `body` (WCAG 4.1.3 e 2.4.3). Região de status da malha fica sempre no DOM, vazia até ter texto; erro de "Já tenho conta" sem `aria-live` duplicado; seta do "← Voltar" escondida do leitor. SW `v7.143`. Testes: `tests/mesh-vault-ui.test.js`.

### Documentação: ADR-039, Rust por fases (proposed)
- [ADR-039](./docs/adr/039-rust-por-fases.md) (**proposed**): mais Rust com o tempo, onde ganha em segurança, em 6 fases (fundação de CI, `vox-core` de referência, Argon2id do cofre, troca da cripto própria e ML-KEM, relay, nó nativo). A chave privada P-256 do navegador continua no WebCrypto não exportável; WebAssembly só para o que o WebCrypto não tem. Decisão A-27 em [DECISOES.md](./docs/DECISOES.md). Sem código e sem bump de SW.

### Testes: "Corrigir e-mail" revoga o endereço errado (LT-03)
- `tests/email-kit-correct.test.js`: com criptografia real e só rede/storage falsos, o e-mail errado deixa de abrir (revogado com a prova de dono), o certo com a mesma senha abre o mesmo `routeId`, a senha não vai ao `mailto:`/storage/rede, e corrigir para o mesmo e-mail não estraga nada.
- Correção: `createEmailAccountKit` recusa e-mail sem `@` antes de gravar; antes gravava o cofre novo e revogava o anterior para só então falhar ao montar o kit (a tela já barrava, a função não).

### Documentação: emenda da revisão do ADR-038
- `about` do manifesto é só o texto longo (apresentação, regras, links); título, descrição curta, foto, categoria e modo de publicação continuam só no `community_update`, para não haver duas fontes.
- O `community_update` passa a seguir o mesmo cálculo de versão do manifesto quando o v1 for implementado (futuro limitado a 10 minutos, sem volta): hoje uma atualização datada no futuro distante trava título e descrição. Testes esperados acrescentados na spec v1 §9.
- Linha "manifesto de comunidade v1 — planejado" em [FEATURES.md](./docs/FEATURES.md). Sem código, sem bump de SW.

### Documentação: ADR-038, subrede e manifesto de comunidade v1 (proposto)
- [ADR-038](./docs/adr/038-subrede-malha-e-manifesto.md) (**proposed**): a comunidade é um território assinado na malha mais um manifesto que só sugere. Mesma regra de permissão do PM-09; `issuedAt` só cresce; tema por lista fechada com contraste; módulos aceitos pela pessoa, um por um; extensões só na v2; fork é `communityId` novo.
- Spec [community-manifest-v1](./docs/specs/community-manifest-v1.md) substitui o rascunho v0. Ameaça T28 no [THREAT-MODEL](./docs/THREAT-MODEL.md), decisão A-26 e EXP-03 no ROADMAP apontando para o ADR. Sem código e sem bump de SW.

### Novidade: cofre na malha e tela única de volta (ADR-037)
- Quem entra com e-mail e senha passa a ter o cofre cifrado (o mesmo v2) copiado para até 7 laços mútuos, guardiões primeiro, que o guardam como caixa preta. Num aparelho novo, se o cofre não está em lugar nenhum, o Vox pede o cofre à malha por uma caixa cega do relay: quem guarda avisa a dona ("Foi você?") e libera depois de 24 h, ou já com "Fui eu"; "Não fui eu" veta aquele pedido. Pedido vale 72 h. Sem servidor de contas e sem criptografia nova (`client/js/vault/mesh-vault.js`, `client/js/app/mesh-vault-flow.js`, `client/js/app/mesh-vault-ui.js`).
- "Já tenho conta" vira um caminho só: e-mail, senha e Entrar; kit, frase, guardiões, QR e arquivos ficam em "Outras formas de voltar".
- Correção encontrada pelo plano de testes: "Apagar conta local" agora apaga também as cópias guardadas para outros, o pedido de volta e os avisos.
- Ameaça T27 no [THREAT-MODEL](./docs/THREAT-MODEL.md), decisão A-25 e [plano de testes do login](./docs/process/plano-testes-login.md) (invariantes, matriz por caminho e lacunas LT-01–LT-10).
- Testes: `tests/mesh-vault.test.js` (21), `tests/mesh-vault-flow.test.js` (20, vários aparelhos com relay falso e criptografia real), `tests/mesh-vault-ui.test.js` (9). SW `v7.141`.

### Documentação: aceite dos ADR-034, ADR-035 e ADR-036
- **ADR-035** passa a **accepted** (camadas e contextos; catraca `audit:layers` no CI; `vault/` e `identity/` feitos).
- **ADR-034** e **ADR-036** passam a **aceito como direção** (direção aceita pelo mantenedor; nada implementado sem RFC 0002 e LAN-18 onde couber). Atualiza [DECISOES.md](./docs/DECISOES.md) A-22–A-24. Sem bump de SW.

### Documentação: JSDoc do lote 3 (`client/js/app/`)
- JSDoc completo (cabeçalho `@file`, `@param`, `@returns`) em todos os exports dos módulos de `client/js/app/` listados na dívida de documentação. Só comentários mudaram. `npm run audit:docs -- --prune` reduz a dívida de 1.602 para 1.392 achados. Sem bump de SW (comportamento igual).

### Correção: replicação no Bluesky por login leva o link do post
- Com a conta do Bluesky ligada por login (OAuth), a replicação automática montava o texto com um campo `url` que a carga não tem, e o link canônico do post sumia. Agora os dois caminhos (login e App Password) usam o mesmo texto: título, corpo e link, até 295 caracteres (`linked-accounts.js`).
- Testes: `tests/bsky-oauth-replication-link.test.js` (novo, 2 casos; os 2 falham no código de antes). SW `v7.140`.

### Documentação: JSDoc do lote 2 (malha, WebRTC, contas vinculadas e cache)
- JSDoc completo (descrição, `@param`, `@returns`) em todos os exports de `peers.js`, `webrtc-peer.js`, `linked-accounts.js` e `cache-node.js`, mais o cabeçalho `@file` de `peers.js` e de `cache-node.js` (que tinha só um comentário de linha). Só comentários mudaram: os tokens de código dos quatro arquivos são idênticos aos de antes. A dívida de `audit:docs` cai de 1.736 para 1.602 achados (`scripts/docs-debt.json`, `--prune`). Sem bump de SW (comportamento igual).

### Documentação: JSDoc do lote 1 (moderação e sincronização)
- JSDoc completo (descrição, `@param`, `@returns`) em todos os exports de `moderation.js`, `peer-sync.js`, `report-review.js` e `vox-link.js`, mais o cabeçalho de `moderation.js`. Só comentários mudaram; nenhuma linha de código. A dívida de `audit:docs` cai de 1.870 para 1.736 achados (`scripts/docs-debt.json`, `--prune`). Sem bump de SW (comportamento igual).

### Dívida: módulos não plugados vão para `labs/parado/` (ADR-035)
- Os 21 módulos que nenhuma tela carrega (`UNPLUGGED_MODULES` no `sw.js`) saíram da raiz de `client/js` (e de `render/`) para `client/js/labs/parado/`, com um README que diz o que são e como plugar. Pela regra de camadas, só `app` e o laboratório podem importá-los. Sem mudança de lógica: só caminhos de import; `settings-guardian` e `node-health-badge` passam a importar `escapeHtml` de `shared/html.js` (base), já que `labs` não importa `render`.
- Caminhos atualizados em `UNPLUGGED_MODULES`, `permaweb-manifest.json`, testes, `docs-debt.json` e docs. SW `v7.139`.

### Testes: vermelho na base (PM-111)
- **Job `red-on-base` no CI (só PR):** roda os testes novos ou alterados contra o código da base (`scripts/red-on-base.mjs` e `scripts/red-on-base-reporter.mjs`). Em PR `fix:` ao menos um precisa falhar por asserção; falha por import ou função ausente é inconclusiva. Nos outros PRs só informa. Rótulo `red-on-base:skip` para `fix:` de CI ou documentação. Regra em [TESTES.md §3.4](./docs/TESTES.md#34-vermelho-na-base-o-teste-prova-o-defeito-pm-111).
- Testes: `tests/red-on-base.test.js` (novo, 9 casos), com um repositório git de mentira.

### Testes: base do plano para código feito por IA (PM-110)
- **CODEOWNERS sem caminho morto:** 8 linhas apontavam para arquivos que mudaram para `client/js/identity/` e `client/js/vault/` e não marcavam mais nada como sensível. Agora marcam as duas pastas, mais `sig-format.js`; `tests/codeowners-paths.test.js` reprova caminho que não existe.
- **[TESTES.md](./docs/TESTES.md):** nova §3.3 (o Tier A dos testes são as linhas de `client/js/` do CODEOWNERS) e a §4 conferida com o `ci.yml` (job `e2e-mesh`, Python 3.15, CodeQL, e o ESLint do CI não cobre `tests/`).
- **ROADMAP:** PM-111…PM-115 abertos (vermelho na base, mutação no diff do Tier A, smokes no `e2e-mesh`, contratos, higiene dos testes). Sem mudança no cliente nem no SW.

### Dívida: camadas zeradas (ADR-035)
- `post-more-menu.js` e `post-more-actions.js` (menu ⋯ das publicações) abrem a folha, ligam os cliques e disparam fluxos: são controle, não montagem de HTML. Foram de `render/` para `app/` sem mudar a lógica (só caminhos de import).
- `moderation.js` não importa mais `app/natural-mod-flow.js`: ganha `setNaturalHideLoader(fn)`, e o `app.js` liga o carregador do moderador natural na partida, ainda sob demanda e atrás da flag de laboratório. Sem carregador, não há arquivamento natural (como sem a flag).
- `scripts/layers-debt.json` fica vazio: 8 → 0 imports proibidos; daqui em diante qualquer import que suba de camada reprova o CI.
- Testes: `tests/moderation-natural-loader.test.js` (novo, 3 casos). 3 testes mudaram só o caminho do arquivo lido. SW `v7.138`.

### Dívida: dois módulos de tela voltam para `app/` (ADR-035)
- `inline-composer.js` e `dom-delegates.js` só eram usados pela camada `app` e importavam fluxos dela; foram movidos para `client/js/app/` sem mudar código (só os caminhos de import). A dívida de camadas cai de 11 para 8 imports proibidos (`scripts/layers-debt.json`, `--prune`).
- Caminhos atualizados no precache do SW, `permaweb-manifest.json`, testes, `docs-debt.json` e links de docs. SW `v7.137`.

### Segurança: cartão de perfil só entra assinado
- **Cartões vindos da sincronização** (memória central e malha ao conectar) passam a valer só com o cartão assinado pelo dono (`signedCard`), conferido pela chave da própria conta e pelo `routeId`; campos soltos de nome, foto e bio que chegam junto não são mais confiados. O cartão de cada conta é guardado no diretório com a forma assinada, que é o que viaja na sincronização ([ADR-021](./docs/adr/021-integridade-na-entrada-forma-assinada.md)).
- O nome que chegava junto da identidade do par ao conectar não é mais aplicado; nome e foto chegam no cartão assinado.
- Um cartão vencido só remove o cartão de quem o assinou (a validação vem antes do vencimento) (`peers-gossip-profile.js`, `peers.js`, `central-memory.js`).
- Efeito visível: um nome conhecido só por outro caminho sem assinatura não chega mais pela sincronização; os nomes continuam vindo dos posts assinados e dos cartões assinados.
- Testes: `tests/profile-card-assinatura.test.js` (novo, 7 casos; os 7 falham no código de antes). Dois testes mudaram de propósito para mandar cartões assinados (`central-memory.test.js`, `profile-card-share.test.js`), pois o comportamento antigo era aceitar cartão sem assinatura. SW `v7.136`.

### Correção: lab do AI Social Dungeon (revisão de 16/11)
- **CD do co-mestre:** a tela do mestre lia `dc`, mas o roteador de regras entrega `suggestedDc`; a sugestão mostrava sempre CD 14. Agora mostra a da regra (Persuasão 13, Investigação 15…) (`screen-dm.js`).
- **Slider de comunidades:** com 0% a comunidade aparecia com 614/410 MB (`||` trocava 0 pelo valor padrão); agora mostra 0 MB. O arrasto redesenhava a tela inteira a cada passo, trocando o próprio slider na mão da pessoa; agora só os rótulos e o chip "Próximo turno" mudam (`screen-camp.js`, `dungeon-controller.js`).
- **Atestação de lore:** confirmar o mesmo card duas vezes somava testemunha; agora é uma atestação por pessoa, e contestar troca a anterior (`dungeon-state.js`).
- **`op_id` sem colisão:** ids vinham da hora + tamanho do ledger (`dungeon-state.js`) ou só do tamanho do ledger (`applyTurnResolutionToSheet` em `rpg-sheet-and-lore.js`); dois jogadores geravam o mesmo id e juntar os ledgers perdia uma jogada. Agora são aleatórios (`crypto.randomUUID()`). Spec atualizada.
- Testes: `tests/dungeon-revisao.test.js` (novo, 5 casos; os 5 falham no código de antes). SW `v7.135`.

### Segurança: eslint 10.15.0 (minimatch 11)
- Dependência só de desenvolvimento: `eslint` ^10.14.0 → ^10.15.0, que traz `minimatch` 11.0.9 no lugar de 10.2.6 (alerta Dependabot moderado GHSA-g3hv-75wg-m249, negação de serviço por expansão de padrões). Nada vai para o navegador; sem bump de SW. `npm audit`: 0 vulnerabilidades. Inventário em `docs/DEPENDENCIAS.md`.

### Correção: Service Worker só intercepta GET
- **`client/sw.js`:** o listener de `fetch` passava todo pedido do mesmo domínio pelo caminho do cache, inclusive POST/PUT/DELETE (por exemplo, para um relay servido no mesmo domínio). O Cache API não guarda nem casa esses métodos, e o corpo do pedido atravessava o SW à toa; em `config/signaling.json`, um POST tentaria `cache.put` e geraria uma rejeição não tratada. Agora só GET passa pelo SW; o resto vai direto à rede pelo navegador.
- Testes: `tests/sw-fetch-methods.test.js` (novo, 2 casos; roda o `sw.js` real numa sandbox `node:vm` e falha no código de antes). SW `v7.134`.

### Correção: sinalização com prazos e mensagens fragmentadas
- **`relay/signaling.py`:** o handshake HTTP passa a ter prazo total, e o resto de um quadro precisa chegar num prazo depois do cabeçalho; antes, uma conexão que não terminava segurava a thread dela sem limite. Pares registrados e quietos continuam conectados.
- **Fragmentos:** mensagens em vários quadros (FIN=0 + continuação) são remontadas, com teto para a soma; antes, o primeiro pedaço era lido como mensagem inteira e o resto era ignorado. Erros de protocolo encerram a conexão.
- Testes: `relay/test_signaling_robustez.py` (novo, 8 casos; os 5 de servidor falham no código de antes). Só o servidor de sinalização mudou; o cliente não muda (sem bump de SW).

### Correção: lab de Open Frames em iframe volta a responder
- **`#/labs/frames`:** o demo roda em iframe `sandbox` sem `allow-same-origin` (origem opaca), e o navegador entrega as mensagens dele com origem `"null"`; o host só aceitava a origem do app e recusava tudo, então o iframe não redimensionava e as ações não chegavam. Agora, para iframe opaco, o host aceita `"null"` só quando a mensagem vem da janela do próprio iframe (`open-frames-host.js`); mensagens de outras janelas são recusadas mesmo com a origem na lista. O lab mostra a última ação recebida.
- **Script do demo fora do HTML:** a CSP publicada (`_headers`, `script-src 'self'` sem `'unsafe-inline'`) bloquearia o script inline de `client/embed/frame-demo.html`; ele foi para `client/embed/frame-demo.js` (no precache).
- `allow-same-origin` continua proibido junto de `allow-scripts` (o frame sairia do sandbox). Spec atualizada (`docs/specs/open-frames-v2.md`).
- Testes: 4 casos novos em `tests/open-frames-host.test.js`. SW `v7.133`.

### Correção: Open Frames no feed contam as ações de todos e o botão não trava
- **Apuração:** o cartão de enquete ou abaixo-assinado era desenhado só com a ação deste aparelho; votos e assinaturas de outras pessoas (recebidos por gossip e guardados) só apareciam depois de votar de novo. Agora, quando o cartão entra na página, a apuração é completada com todas as ações guardadas (`client/js/app/frame-ui.js`, novo, no precache).
- **Botão:** depois de um voto bem-sucedido o botão ficava desabilitado em "Gravando…"; agora volta ao normal e a escolha fica marcada.
- **Voto mudado:** a enquete contava, para quem mudou de voto, o voto mais antigo (as ações chegam da mais nova para a mais velha); agora vale o de maior `ts` (`frames.js`).
- Testes: `tests/frame-ui.test.js` (novo, 5 casos). SW `v7.132`.

### Correção: login do Bluesky abandonado não captura o login seguinte; `iss` conferido
- **Callback escolhido pelo `state`:** um login do Bluesky iniciado e não concluído deixava o fluxo guardado na aba, e o callback seguinte de outra rede (GitHub, X, Threads…) ia para o Bluesky e falhava uma vez. Agora o callback vai para o fluxo cujo `state` confere; qualquer callback, e qualquer novo início de login, encerra os fluxos pendentes da aba (`social-login.js`).
- **`iss` (RFC 9207):** quando o servidor do Bluesky anuncia `authorization_response_iss_parameter_supported`, callback sem `iss` é recusado; antes, a ausência passava (`bsky-oauth.js`). `iss` diferente do emissor continua recusado.
- Testes: `tests/social-login-callback.test.js` (novo, 5 casos, `fetch` falso). SW `v7.131`.

### Correção: a cópia impressa da frase não fica na página
- **Imprimir cartão** (`#/frase`) põe uma cópia do cartão com as 12 palavras no `body` só para a impressão. Antes, ela só saía no `afterprint`; em navegador que não dispara esse evento, a cópia ficava na página depois de sair da tela, contra a regra de que a frase vive só na tela. Agora sai também ao trocar de rota, ao sair da página e ao seguir para a conferência; imprimir de novo não empilha cópias; sem `print()` no navegador, nem entra.
- Lógica em `client/js/app/phrase-print.js` (novo, no precache); testes em `tests/phrase-print.test.js`. SW `v7.130`.

### Conta numa pasta só, com portas de entrada (ADR-035 §3.2, segundo contexto)
- **`client/js/identity/`:** 15 módulos da conta (conta local, travamento e chaves em repouso, semente, frase de recuperação, arquivo de soberania, saídas soberanas, limpeza local, guardiões e backup no e-mail) mudaram para a pasta, com `git mv`. Nenhuma regra mudou; a identidade está congelada para tudo que não seja correção.
- **Portas:** fora da pasta, importa-se por `identity/index.js` ou, para quem só precisa da chave do aparelho e da chave de DM (`crypto-dm.js`, `wallet.js`), por `identity/keys.js`, que evita o ciclo `crypto-dm → identity/index → local-account → crypto-dm`. `npm run audit:layers` reprova import de fora que pule as portas.
- **Ficaram na raiz:** `shamir-gf256` (também do RPG), `signed-verify`, `sig-format` e os módulos de contas sociais.
- **Documentação:** os exports movidos ganharam JSDoc completo; as 64 entradas de dívida do `audit:docs` desses arquivos foram pagas, não renomeadas. Links em README, ARCHITECTURE, IDENTITY e ADRs apontam para o caminho novo.
- **Ciclos:** o componente com ciclo do grafo de imports foi de 113 para 120 módulos (a porta e 6 módulos que só usavam `local-account`); registrado no ADR-035.
- Testes: imports e caminhos lidos nos testes apontam para `client/js/identity/`, sem mudar asserções; caso novo em `tests/layers-audit.test.js` para as portas da conta. SW `v7.129`.

### ADR-036 proposto: agilidade criptográfica e transição pós-quântica
- **Inventário** de onde cada algoritmo é usado no cliente (assinatura e DM em curva elíptica; cofre, semente e chaves em repouso simétricos; Arweave, Nostr e Bluesky definidos pelos protocolos deles).
- **Regra:** todo formato novo diz o seu algoritmo dentro do que é assinado; o leitor recusa algoritmo desconhecido.
- **Direção:** DM v2 híbrida (ECDH + ML-KEM-768) primeiro, por causa do "guarda agora, abre depois"; assinatura com pré-compromisso ML-DSA junto da RFC 0002 (ADR-034); a frase de 12 palavras restaura também as chaves novas. Nada de código; atualizados DECISOES (A-24) e o índice de ADRs.
### Cofre numa pasta só, com porta de entrada (ADR-035 §3.2, primeiro contexto)
- **`client/js/vault/`:** `vault-crypto`, `vault-store`, `vault-legacy`, `passphrase-vault` e `oauth-vault` mudaram para a pasta, com `git mv` (o histórico segue o arquivo). Nenhuma regra mudou.
- **Portas:** fora da pasta, importa-se por `vault/index.js` (o que é público: migração v1, login social, Senha Soberana, cofre no link, servidores de memória) ou por `vault/envelope.js` (só cifrar e abrir um registro, usado por `key-lock.js` e `inbox-backup.js` para não fechar um ciclo de imports). O `oauth-vault.js` deixou de reexportar peças dos outros módulos; isso agora é papel da porta.
- **Conferência:** `npm run audit:layers` reprova import de fora da pasta que pule a porta (`CONTEXT_DOORS` em `scripts/layers-lib.mjs`). Hoje não há nenhum.
- **Documentação:** os exports do cofre ganharam JSDoc completo; as 26 entradas de dívida do `audit:docs` desses arquivos foram pagas, não renomeadas.
- Testes: os testes passam a importar os caminhos novos (`vault/index.js` no lugar de `oauth-vault.js`), sem mudar asserções; caso novo em `tests/layers-audit.test.js` para a regra da porta. SW `v7.128`.

### ADR-035 proposto: camadas e contextos no cliente, com catraca no CI
- **Regra de camadas:** `app` importa qualquer camada; `render` só `render` e `base`; `base` só `base`; `labs`/`dungeon` só `labs` e `base`, e só `app` carrega o laboratório. `npm run audit:layers` lê os imports pela árvore sintática (espree), entra no `validate` e no CI e reprova import proibido novo. Os 11 imports que já sobem de camada (6 arquivos) ficam em `scripts/layers-debt.json`, numa lista que só diminui.
- **Direção:** uma pasta por assunto com porta de entrada (`index.js`), um assunto por PR, começando por `vault/`; caminho único para operações de conta; armazenamento local com dono; os módulos não plugados (já fora do precache, PM-04) saem da raiz para `labs/` ou do repositório.
- Testes: `tests/layers-audit.test.js` (novo). Atualizados DECISOES (A-23), HARDENING, índice de ADRs e `scripts/README.md`. Sem mudança no app.

### Correção: trocar a Senha Soberana pelo Perfil; pôr e-mail tira do ar o cofre só-senha
- **Senha atual:** o cartão "Soberania & Sincronização" ganha o campo "Senha atual, só para trocar a Senha Soberana". Antes, depois do primeiro cofre a conta ficava travada pela senha, e uma senha nova dava "Senha incorreta" sem ter onde informar a antiga. Com a senha atual, a conta é aberta, gravada com a nova e o endereço antigo é revogado.
- **E-mail:** gravar o cofre com e-mail (Perfil ou assistente de backup) revoga o cofre só-senha anterior da mesma senha, como a restauração já fazia (ADR-032 §6.3). Antes, ele ficava no ar e abria só com a senha. Só é revogado o que existe; endereço sem cofre não ganha marca.
- **Revogação só quando o cofre novo chegou lá fora:** se nenhum servidor aceitou o cofre novo, o antigo continua nos servidores (é o único) e só a cópia deste aparelho sai. Antes, um servidor que recusava o novo e aceitava a revogação deixava a conta sem cofre remoto. Vale também para a troca de senha e o kit de e-mail.
- **Trocar a senha e pôr e-mail de uma vez** também tira do ar o cofre só-senha da senha antiga; antes a senha antiga continuava abrindo a conta.
- O campo "Senha atual" é limpo depois de gravar; antes, o clique seguinte (ex.: o QR) dava "Senha incorreta".
- Testes: `tests/profile-vault-change.test.js` (novo; 6 casos, os de revogação falham com o código anterior). SW `v7.127`.

### ADR-034 proposto: raiz e subchaves por aparelho
- Desenho para perder o celular sem perder a conta: a chave de assinatura de hoje vira a raiz (o `vx_…` não muda), cada aparelho assina com uma subchave delegada, e a raiz publica um registro de chaves com as revogadas. Nada de código; a forma assinada nova pede a RFC 0002 e a revisão externa de cripto (LAN-18). Atualizados ADR-032 §3.6, DECISOES (A-22), ROADMAP (PM-13) e o índice de ADRs.

### Correção: o QR do Perfil para outro aparelho volta a funcionar
- **"📲 QR Code para Celular" sempre falhava:** o link do cofre tinha uns 251 bytes no endereço oficial, e o codificador de QR ia só até a versão 9 (230 bytes). Agora o QR leva um cofre mínimo: a conta, a semente da frase de 12 palavras e o nome, se couber, cifrados só pela senha (`buildQrSyncRecord`). O cofre completo continua gravado e o link continua levando tudo; Pix e o resto chegam por eles. Conta de antes da frase não tem semente e recebe o motivo em vez de um QR que não abre.
- **Codificador de QR:** ganha a versão 11 (321 bytes, ECC L, 4 blocos, contagem de 16 bits). A versão 10 fica de fora, porque em ECC L ela mistura blocos de dois tamanhos.
- Testes: `tests/qr-sync-record.test.js` (novo) e a versão 11 em `tests/qr-url.test.js`. O teste antigo que esperava erro com 231 bytes mudou de propósito: 231 bytes agora vai para a versão 11, e o erro passa a ser acima de 321. SW `v7.126`.

### Correção: entrar em outra conta não herda nada da anterior; cofre do Perfil com o e-mail da conta
- **Frase, guardiões, arquivo `.voxid` e cofre** passam todos por `importLocalAccountBundle`. Quando a conta que entra é outra, a que estava ativa vai inteira para o cofre local (nome, Pix, enriquecimento, chave de DM), e a que entra fica com o que é dela: do pacote ou, se já esteve neste aparelho, do cofre local. Antes, entrar pela frase ou por um `.voxid` sem nome e sem Pix deixava o nome, a chave Pix e os dados de login da conta anterior na nova, e um `.voxid` sem chave de DM ficava com a chave de DM da anterior.
- **Trocar de conta sem chave de DM guardada** gera uma chave nova em vez de manter a da conta que estava ativa.
- **Cartão "Soberania & Sincronização" do Perfil:** campo de e-mail (opcional) para quem criou a conta com e-mail; o cofre é gravado com ele, como na entrada (ADR-032 Emenda 1). Conta com saída por e-mail e campo vazio pede confirmação, porque sem o e-mail o endereço do cofre sai só da senha. O link e o QR levam o cofre cifrado só pela senha (`syncBundle`), que não sai do aparelho. Os dois botões saíram de `screens-profile.js` para `app/profile-vault-sync.js`; o link é montado com `textContent`, não com `innerHTML`.
- Testes: `tests/restore-account-switch.test.js` (novo; 3 dos 4 falham no código anterior). SW `v7.125`.

### Correção: diretório de perfis reconhece foto de login social pelo host
- `profile-directory.js` decidia se dois cartões eram a mesma pessoa procurando "googleusercontent.com/", "fbcdn.net" e afins em qualquer parte da URL da foto, e cortava o resto. Duas fotos diferentes de um mesmo site, com esse trecho na query, viravam "a mesma pessoa", e a deduplicação ou a poda apagava um cartão. Agora usa `detectSocialAvatarType` (host da URL, só https), a mesma regra de `account-social-match.js` (#150) e de `people-index.js`; na Meta, `psid`/`asid` são lidos como parâmetros da query, não por trecho.
- Testes: `tests/profile-directory-avatar.test.js` (novo; 2 dos 4 falham no código anterior). SW `v7.124`.

### Guardiões, parte 3d: trocar e tirar guardiões (ADR-032 passo 3)
- **Trocar (`#/guardioes`):** com guardiões escolhidos, a tela mostra o estado, explica a troca e o botão vira "Trocar: dividir de novo e enviar", aberto no mínimo atual. A divisão nova revoga a anterior para quem a tinha; quem saiu apaga o pedaço, quem ficou guarda o novo, e os pedaços antigos não se juntam com os novos.
- **Tirar todos os guardiões:** com confirmação. Esquece a divisão e tira a saída `guardioes` antes de mandar a revogação assinada a cada guardião, então guardião offline não deixa a conta marcada como protegida. Recibo atrasado não devolve a saída.
- **Botões de texto da tela** ("Tirar todos", "Parar de guardar") ganham o estilo de link; antes apareciam como botão cru do navegador.
- `removeAllGuardians` (`app/guardians-flow.js`), `clearOwnerSplit` (`guardians.js`). Testes: `tests/guardians-trocar.test.js` (novo) e o arnês comum `tests/guardians-harness.js`, que saiu de `tests/guardians.test.js` sem mudar os testes da 3b. SW `v7.123`.

### AI Social Dungeon como demonstração de laboratório, sem IA (ADR-033)
- **Laboratório `#/dungeon` / `#/labs/dungeon`:** 4 telas de mesa de RPG (acampamento, mesa, ficha, escudo do mestre), isoladas do feed cívico. Cada tela diz que é demonstração: a narração é um roteiro fixo (o selo é "Roteiro"), os outros jogadores e guardiões são de exemplo e nada sai da aba.
- **De verdade:** o d20 é sorteado no aparelho (`crypto.getRandomValues`, sem viés de módulo), e o cofre de Shamir do mestre abre só com o gatilho do jogo (posição [3, 1] e d20 ≥ 15) e 3 das 5 partes (`sealLoreVaultSecret` / `unlockLoreVaultSecret`). Na demonstração, as 5 partes ficam neste aparelho.
- **Saiu o que não era verdade:** selos "IA Local" e "Sabiá-3 BR", o seletor de "Cérebro de IA" com a Maritaca, o hash inventado do dado, "guardiões online", "0 servidores centrais via WebRTC", "Zaps de Apoio" e a reserva de disco que não acontecia.
- **Sem prioridade por chave paga:** o bônus de +10000 para o aparelho com chave da Maritaca saiu de `community-pillar-pool.js`, e o narrador passa a ser o aparelho mais capaz.
- **ADR-033:** IA só no RPG e primeiro no próprio aparelho. Serviço externo só com a chave da própria mesa e o consentimento de todos os jogadores.
- Módulos puros (`community-pillar-pool.js`, `rpg-sheet-and-lore.js`, `rpg-crypto-table.js`, `rpg-maritaca-router.js`, este sem chamada de rede) e a spec `ai-social-dungeon-v0.md` §0 com o que existe e o que é desenho. Testes: `tests/ai-social-dungeon.test.js`, `tests/ai-social-dungeon-coverage.test.js`, `tests/route-parse.test.js`. SW `v7.122`.

### QR do pedido de volta aos guardiões (ADR-032 passo 3c)
- **Tela do pedido (`#/voltar`):** botão "Mostrar QR para quem está do seu lado". O guardião aponta a câmera, abre o pedido e confere o código ali mesmo.
- **Codificador de QR** (`qr-url-codec.js`, `qr-url-layout.js`): ia até a versão 5 (106 bytes); agora vai até a 9 (230 bytes), com os dados em dois blocos intercalados a partir da versão 6, mais padrões de alinhamento e o bloco de informação de versão a partir da 7. O link do pedido, uns 146 bytes, sai em versão 7. `#/guardiao` passa a ser um link aceito pelo QR.
- Testes: `tests/qr-url.test.js` (versões 2–9 ida e volta, bits de versão conferidos com a tabela da norma, link do pedido). Conferido também com o leitor de QR do OpenCV, fora do app. SW `v7.121`.

### Entrada com nome, e-mail e senha e kit de volta no e-mail da própria pessoa (ADR-032 Emenda 1)
- **Entrada em uma etapa:** nome ou apelido, e-mail e senha (mínimo de 12 caracteres). "Criar conta" gera a semente, entra, grava o cofre e abre um rascunho `mailto:` da pessoa para ela mesma. Sem e-mail, a conta nasce só com o nome, como antes, com a faixa de conta provisória.
- **O e-mail não sai do aparelho para nenhum servidor do Vox.** O endereço do cofre, a prova de dono e a chave saem de `e-mail:senha` (PBKDF2-SHA256, 600 mil iterações, `vault-crypto.js`). O servidor de memória só vê um identificador de 64 caracteres.
- **O cofre leva a semente:** a volta refaz a chave de assinatura e a de DM e mantém a frase de 12 palavras. A semente só é aceita se der o mesmo `vx_…`. Cofres antigos, só de senha, continuam abrindo e migram para o endereço novo; o antigo é revogado. Trocar e-mail ou senha também revoga o endereço anterior.
- **Kit no e-mail** (`email-kit.js`): link `#/sync?b=…` (o cofre vai no fragmento, que não chega a servidor nenhum), código `VOX1:…`, data, nome e `vx_…`. **A senha nunca vai.** A frase de 12 palavras só vai se a pessoa marcar a caixa, que vem desmarcada, e o Perfil registra a data. Se o rascunho não abrir: copiar o e-mail pronto ou baixar um `.txt`.
- **"Já tenho conta":** e-mail e senha (busca o cofre no aparelho e nos servidores de memória), ou colar o link, o código ou o texto inteiro do e-mail. Continuam valendo a frase, os guardiões, o QR do outro aparelho e os arquivos.
- THREAT-MODEL T26. Testes: `tests/vault-v2.test.js`, `tests/email-kit.test.js`, `tests/onboarding-steps.test.js`. SW `v7.120`.

### Guardiões, parte 3c: devolver a conta (ADR-032 passo 3)
- **Aparelho novo, `#/voltar`** (também em "Já tenho conta" → "Com os guardiões"): diz qual é a conta (link do perfil ou `vx_…`), gera uma chave temporária (só nesta aba, 24 h, cifrada pelo aparelho) e mostra o link do pedido e um código de 4 palavras. Junta as respostas coladas ou da caixa temporária e entra quando tiver o mínimo: a mesma conta, a mesma DM e a mesma semente.
- **Guardião, `#/guardiao?…`**: mostra o nome e a foto que ele mesmo conhece, há quanto tempo o pedido foi criado e o código. Só devolve depois de marcar que conferiu o código por voz ou pessoalmente. Recusa pedido de mais de 24 h, adiantado, da própria conta ou de conta que não guarda.
- A resposta vai selada para a chave temporária: pela caixa `vxtmp_` (sem o `routeId` da dona), quando há relay, e sempre como texto para colar. Pedaço sem a assinatura da dona não conta, e conta juntada diferente da pedida é recusada antes de trocar chave.
- `guardian-return.js`, `app/guardian-return-flow.js`, `render/guardian-return.js`, `app/screens-guardian-return.js`; `p256.js` comprime o ponto; `account-phrase.js` ganha `restoreFromSecret`. Spec §13 registra o que mudou do §7. Testes: `tests/guardian-return.test.js`. SW `v7.119`.

### Triagem da varredura de cobertura (2026-11-16)
- Dos 99 arquivos `tests/coverage-*` do Antigravity, nenhum entra. 73 clicavam telas num DOM falso sem conferir quase nada, e 14 são do dungeon (vão no PR dele). Os 12 de funções puras misturavam checagens reais, já cobertas pelos testes existentes, com tautologias. Os defeitos reais que eles acharam já estão corrigidos e testados (`tests/achados-cobertura.test.js`).
- **Relay:** entra `relay/test_relay_limites_e_rotas.py` (11 testes), com rotas, limites de tamanho (413), entradas ruins (400), validação de manifesto e quadros WebSocket. A versão original escrevia na pasta `.cache/central_memory` real do relay; agora todas as pastas do relay ficam num diretório temporário. Os três testes com nome de meta de cobertura ganharam nome de comportamento, e as chamadas sem checagem saíram.
- **E2E:** entra `e2e/test_vox_e2e.py` (`npm run test:e2e`, fora do CI): Chromium real com a rede de fora bloqueada, cobrindo entrada e recarga, as rotas principais, os assistentes e dois navegadores na malha. Os testes do dungeon voltam com o PR dele. Documentado em `docs/TESTES.md` §3.1–3.2.

### Correções achadas pela varredura de cobertura (2026-11-16)
- **Comunidade:** a busca vazia, a foto de reserva do autor, o Pix/zap da Feira e o status do anúncio quebravam com `ReferenceError`, porque `escapeHtml`, `brcode` e `listing` eram usados em `app/screens-community.js` sem import. O ESLint do cliente agora reprova nome sem import (`no-undef`).
- **Editar post:** o modal não abria, porque `init.js` chamava uma função e um contêiner que não existem. Agora abre em `#modal-container` com `renderPostEditModal`, e Esc e o clique fora fecham só ele.
- **Mini-apps (Open Frames):** o voto não era gravado. Os botões são desenhados com `data-index`, mas o clique lia `data-btn-index` e chamava funções que não existem. Agora o clique grava o voto assinado e redesenha a apuração.
- **Pix:** `getPixKey()` devolve o registro guardado, e a consulta Pix, o perfil e o anúncio da Feira o tratavam como texto (`toLowerCase` quebrava; o campo mostrava `[object Object]`). O texto agora sai de `storedPixValue` (`pix-key.js`).
- **Moderação local:** a lista de bloqueados e silenciados mostrava `[object Object]`, e Desbloquear não fazia nada; agora usa o `routeId` do registro.
- Testes: `tests/achados-cobertura.test.js`. Os quatro falham sem a correção. SW `v7.118`.

### Fluxo de branches: PR para `develop`, depois `main`
- PRs de feature passam a mirar `develop`; `develop` vai para `main` por PR quando o lote fecha. `develop` foi alinhada com `main` (`1fc0ccc`) e ganhou as mesmas regras de proteção (PR obrigatório, 5 checks, sem force push, sem apagar). CI e CodeQL rodam também em `develop` (`ci.yml`, `codeql.yml`). CONTRIBUTING, CONTRIBUTORS, AGENTS, CLAUDE e DEV §0 dizem isso.

### Modelo de ameaças: T24 (frase) e T25 (guardiões) (ADR-032, antes da parte 3c)
- `docs/THREAT-MODEL.md` ganha as duas linhas prometidas no ADR-032: o que segura e o que sobra na frase de recuperação e nos guardiões, incluindo as condições que a parte 3c (pedir de volta) tem que cumprir para entrar. Só documentação; sem SW novo.

### Guardiões, parte 3b: escolher, dividir, guardar e confirmar (ADR-032 passo 3)
- **Tela `#/guardioes`** (`app/screens-guardians.js`, `render/guardians.js`): escolhe de 3 a 7 pessoas entre os **laços mútuos** (você segue ou tem nos contatos, e a pessoa avisou que adicionou você), o mínimo que devolve a conta (padrão **3 de 5**, explicado em palavras), pede a Senha Soberana se a conta estiver travada, e mostra quantos confirmaram. Também lista de quem você guarda a volta, com "Parar de guardar". Link "Prefiro guardiões" na tela da frase.
- **Mensagens assinadas por DM cifrada** (`guardians.js`, `app/guardians-flow.js`, ligado em `app/dm-wire.js`): pedaço, recibo e revogação. O pedaço só é guardado se veio da própria dona, com assinatura válida, e se o guardião a segue; fica cifrado pelo aparelho e nunca em claro (aparelho sem chave do aparelho recusa o pedaço; `sealJsonStrict` em `keystore.js`), sem tela para abrir (no máximo 20 donas, nunca a própria conta, entra na limpeza local).
- **A saída "guardiões" vale com o mínimo de recibos** e cai se alguém parar de guardar e o total ficar abaixo dele. Divisão nova revoga a antiga; recibo da divisão antiga não conta mais (`clearAccountExit` em `account-exit.js`).
- Devolver a conta (pedido com chave temporária) é a parte 3c. Testes: `tests/guardians.test.js` (dona e três guardiões reais no mesmo navegador). SW `v7.117`.

### Guardiões, parte 3a: Shamir em GF(256) (ADR-032 passo 3)
- `client/js/shamir-gf256.js`: divide a semente (ou a chave, em conta antiga) em N pedaços, de 2 a 7, e junta M deles de volta (Lagrange em zero, corpo do AES). Recusa pedaços de divisões diferentes, repetidos, de tamanhos diferentes e M menor que 2. Puro: sem tela, sem rede, ainda não ligado a nada. Spec: `docs/specs/guardioes-v0.md` §3. Testes: `tests/shamir-gf256.test.js` (exemplos do FIPS-197, vetor fixo 3 de 5, todos os subconjuntos de 2 de 2 a 7 de 7). Fica em `UNPLUGGED_MODULES` (fora do precache) até a parte 3b ligá-lo; sem SW novo.

### Spec dos guardiões aceita (ADR-032, passo 3 — antes do código)
- `docs/specs/guardioes-v0.md`: Shamir em GF(256) sobre a semente (ou a chave, em conta antiga), pedaços assinados pela dona e entregues cifrados por DM, caixa preta no guardião, saída só com M recibos, pedido de volta com chave temporária e conferência por voz ou pessoalmente, troca de guardiões por divisão nova, ameaças (T25) e entrega em 4 partes. Três pontos em aberto para decidir antes do código. Só documentação.

### Tela da frase de recuperação e entrar pela frase (ADR-032, passo 2 — tela)
- **`#/frase`** (`app/screens-phrase.js`, `render/recovery-phrase.js`): mostra as 12 palavras (ou 24, em conta antiga, com o aviso de que DMs antigas não voltam por elas), pede a Senha Soberana se a conta estiver travada, imprime um cartão de uma página e pede 3 palavras sorteadas de volta. Só aí a frase conta como saída e a faixa de conta provisória some.
- **"Criar minha saída"** na faixa agora leva para a frase; "Prefiro senha e cofre" continua levando ao assistente do cofre (`#/backup`).
- **Já tenho conta → frase** (`account-phrase.js`, `app/onboarding.js`): digitar as palavras traz a mesma conta (mesmo `routeId`; DM e semente também, se forem 12 palavras), sem rede. Aceita acento, maiúscula e só as 4 primeiras letras.
- Ainda sem QR no cartão (o leitor de QR do app só lê links do Vox, e pôr a frase num link a vazaria). Testes: `tests/account-phrase.test.js`. SW `v7.116`.

### Frase de recuperação: contas novas nascem de uma semente (ADR-032, passo 2 — núcleo)
- **Conta nova nasce de uma semente de 128 bits** (`identity-seed.js`, `local-account.js`): assinatura e DM saem da mesma semente por HKDF-SHA256 (`recovery-phrase.js`), e a semente vira **12 palavras** da lista BIP-39 em português (`data/bip39-pt.js`, MIT). Contas antigas têm a frase de **24 palavras** tirada da própria chave (sem as chaves de DM).
- **P-256 em JS** (`p256.js`) só para calcular o ponto público a partir do escalar (FIPS 186-5 A.2.1), conferido contra chaves do WebCrypto.
- **Semente protegida como a chave:** cifrada pelo aparelho; quando a conta trava (ADR-026), vai para a cópia da Senha Soberana (`key-lock.js`) e sai do aparelho. Limpeza local e remoção de conta levam a semente junto.
- A tela para ver, confirmar e imprimir a frase vem no próximo PR. Decisões no ADR-032 §5.1–5.2. Testes: `tests/recovery-phrase.test.js`. SW `v7.115`.
### Pronomes, gênero e orientação sexual opcionais nos perfis
- **Qualquer pronome + opções opcionais** (`client/js/profile-identity-meta.js`, `client/js/render/profile-identity-meta.js`, `client/js/app/profile-identity-meta-ui.js`): perfis agora têm campos opcionais para **pronomes** (texto livre para suportar todos os pronomes + atalhos rápidos incluindo `Jacaré 🐊` como humor), **gênero** e **orientação sexual**.
- **Cabeçalho, Pessoas, P2P e Backup**: pílulas discretas com tooltip no hover no cabeçalho do perfil (`client/js/render/profile.js`, `client/css/style.css`), selo de pronome em **Pessoas** (`client/js/people-index.js`, `client/js/render/oauth-modals.js`), propagação no cartão P2P assinado (`profile-card.js`, `mesh-profile.js`, `peers-gossip-profile.js`, `profile-directory.js`) e preservação no `.voxid` e backup por e-mail (`account-backup.js`, `inbox-backup.js`).
- **Service Worker**: novos módulos incluídos em `SHELL_ASSETS` e `CACHE_NAME` incrementado para `vox-pwa-v7.114-real-network-audio-video-upload`.

### Conta provisória até ter saída; Google e Meta fora da entrada (ADR-032, passo 1)
- **Entrada sem Google, Meta e GitHub** (`render/oauth-modals.js`): a entrada pede só o nome. Importar nome e foto vai para Perfil (`render/oauth-import.js`, `openOAuthEnrichModal({ mode: "import" })`), com o aviso "Não guarda sua conta".
- **Faixa "Esta conta só existe neste navegador"** (`app/account-exit-banner.js`) para quem tem conta e ainda não tem saída soberana, com "Criar minha saída" (`#/backup`) e "Agora não" (volta em 7 dias ou 10 posts). Não bloqueia nada.
- **Registro local das saídas** (`account-exit.js`): conta só o que está fora do navegador — cofre aceito por um servidor de memória (`saveRemoteVaultRecord` agora diz quantos aceitaram), `.voxid` com senha baixado ou importado, backup no e-mail mandado ou restaurado. Conta já travada por senha antes do registro conta uma vez como backup anterior.
- **Assistente de backup honesto** (`app/screens-guided.js`): se nenhum servidor guardou o cofre, diz isso e oferece baixar o arquivo cifrado, em vez de "Cofre salvo".
- Testes: `tests/account-exit.test.js`, `tests/account-exit-banner.test.js`; `tests/onboarding-steps.test.js` passa a exigir a entrada **sem** os botões dos provedores. SW `v7.113`.

### Ajuste de ícone de conexão para `🔗🟢` / `🔗❌`
- **Terminologia simplificada**: ícone de conectado atualizado de `🔗✅` para `🔗🟢` (mantendo `🔗❌` para desconectado/offline) nos selos/seções de Pessoas, status do relay, toasts e badge de conta vinculada; `CACHE_NAME` incrementado para `vox-pwa-v7.112-real-network-audio-video-upload`.

### Texto conciso, espaçamentos em Sua rede e emojis `🔗✅` / `🔗❌`
- **Terminologia simplificada**: selo e seção em **Pessoas** (`#/people`) e status do relay/conexões (`client/js/render/oauth-modals.js`, `client/js/i18n-pt-br.js`, `client/js/render/network.js`, `client/js/app/onboarding.js`, `client/js/app/screens-network.js`, `client/js/explode-dispatch.js`) passaram de `"Na malha"` / `"Conectado"` / `"Offline"` para os emojis `🔗✅` (conectado) e `🔗❌` (não conectado).
- **Menos carga cognitiva em `#/settings/network`**: textos encurtados e espaçamento ampliado nos cartões **Sua rede**, **Backup no seu e-mail**, **Seus posts num arquivo**, **Estatísticas / Comprovante**, **Convide amigos** e blocos abaixo (`client/js/render/network.js`, `client/js/app/inbox-backup-ui.js`, `client/js/app/own-posts-ui.js`, `client/js/render/util.js`, `client/css/agora.css`, `client/css/style.css`).
- **Service Worker**: `CACHE_NAME` incrementado para `vox-pwa-v7.111-real-network-audio-video-upload` e metadados de release atualizados.

### ADR-032 aceito: login perene, a conta nasce com saída
- `docs/adr/032-login-perene-a-conta-nasce-com-saida.md`: Google e Meta saem da entrada (limpar o navegador e entrar com Google hoje cria uma conta nova); a conta fica "provisória neste navegador" até ter uma saída soberana — frase de recuperação/cartão no papel, guardiões (Shamir pela malha) ou Senha Soberana; passkey (ADR-031) e segundo aparelho viram atalhos. Índices de ADR, `DECISOES.md` e REV-14 no `ROADMAP.md` apontam para ele. Só documentação.

### Remover modal pós-pacto e usar "Conectado" em Pessoas
- **Sem modal pós-pacto**: removidos `renderPostPactConnectModal` e `closePostPactConnectModal` (`client/js/app/onboarding.js`, `client/js/render/oauth-modals.js`, `client/js/render.js`) e o CSS exclusivo `.post-pact-*` (`client/css/style.css`); ao aceitar o pacto, o usuário segue direto para o feed ou tela de convite.
- **Convide amigos recolocado**: botão **Compartilhar** + chave cidadã + `<details>Ver link técnico</details>` passaram para a tela **Pessoas** (`#/people`) e **Sua rede** (`#/settings/network`) via `renderInviteFriendsCard` (`client/js/render/util.js`).
- **Terminologia**: selo e seção `"Na malha"` renomeados para `"Conectado"` / `"Conectados"` (`client/js/render/oauth-modals.js`, `client/js/i18n-pt-br.js`).
- **Service Worker**: `CACHE_NAME` incrementado para `vox-pwa-v7.110-real-network-audio-video-upload` e metadados de release atualizados.

### Seus posts num arquivo e restauração conferida (PM-72, parte 2)
- **Novo card em Sua rede** (`client/js/app/own-posts-ui.js`): "Baixar meus posts" gera `vox-meus-posts-AAAA-MM-DD.json` com os próprios posts na forma assinada e a mídia de cada um; "Restaurar de um arquivo" traz de volta. Sem senha: o que a pessoa publicou já é público na rede.
- **Volta conferida** (`client/js/own-posts.js`): só entra post desta conta, com assinatura que confere, que não foi superado por edição ou apagamento guardado, e mídia só se bate com o hash assinado. Arquivo de outra conta é recusado com mensagem.
- **Backup no e-mail** (`client/js/inbox-backup.js`): passou a levar os posts na forma assinada (`postEntries`) e a restaurar pelo mesmo caminho. Antes restaurava a forma de tela sem conferir nada. Backups antigos (`posts`) continuam voltando como antes.
- **Regra de "já superado" num só lugar** (`client/js/post-supersede.js`): a malha (`peers.js`) e o arquivo usam a mesma.
- `idb-store.js` não foi plugado: os posts já vivem no IndexedDB e a fila dele grava no Arweave, pausado (REV-07). Testes em `tests/own-posts.test.js`; `tests/inbox-backup.test.js` passa a publicar posts assinados. SW `v7.109`.

### Pausar gravação ativa no Arweave no cliente (`arweaveUpload: false`, REV-07)
- **Kill-switch desligado por padrão**: `"arweaveUpload": false` em `client/config/flags.json` e `FLAG_DEFAULTS.arweaveUpload: false` em `client/js/feature-flags.js` (com mensagem atualizada preservando o estado pausado).
- **Guardas nos fluxos de escrita**: `client/js/topic-permaweb.js`, `client/js/inline-composer.js`, `client/js/app/screens-compose.js`, `client/js/mesh-profile.js`, `client/js/app/screens-community.js` e `client/js/app/screens-profile.js` agora respeitam `featureFlags.isFeatureEnabled("arweaveUpload")` antes de abrir o aviso de permanência, tentar enviar ao Turbo/Arweave ou acusar Permaweb indisponível — mantendo toda circulação na rede de seguidores.
- **Testes e documentação**: `tests/feature-flags.test.js`, `tests/upload.test.js` e `tests/topic-permaweb.test.js` atualizados para o padrão desligado; docs (`DECISOES.md`, `ROADMAP.md`, `FEATURES.md`, `INFRA-CUSTOS.md`, `README.md`, `ARCHITECTURE.md`, `ADR-019`, `briefing-parecer-g1.md` e `piloto-g1-convite.md`) alinhados; `CACHE_NAME` incrementado para `vox-pwa-v7.108-real-network-audio-video-upload`.

### Documentação: zero gravação no Arweave por enquanto e preservação pela rede de seguidores
- Atualizados `README.md`, `ARCHITECTURE.md`, `docs/ARCHITECTURE.md`, `docs/DECISOES.md` (`I-05`, `A-02`, `A-08`), `docs/adr/019-esquecer-por-padrao-e-memoria-civica.md`, `docs/FEATURES.md`, `docs/ROADMAP.md` (`REV-07`, `REV-11`), `docs/INFRA-CUSTOS.md`, `docs/IDENTITY.md`, `docs/product/POSITIONING.md`, `docs/legal/COMPLIANCE-BR.md`, `docs/legal/briefing-parecer-g1.md`, `docs/pilot/piloto-g1-convite.md`, `docs/pilot/piloto-comunidade-go-no-go.md` e `docs/README.md`: formalizada a diretriz de que **por enquanto nada deve ser salvo usando Arweave** (reservado para alguns recursos futuros e leitura pública), operando a circulação e a preservação pela **rede de seguidores** (replicação de quem se segue na malha), com transparência sobre a pendência de desligamento de `arweaveUpload` em `client/config/flags.json` e do `PM-74`.

### Expurgo dos perfis e contas de teste excedentes (`Yuri Kayel`)
- **Identidades de teste (`client/js/data/test-route-ids.js`)**: incluídos os 17 `routeId`s excedentes/pré-gênese de `"Yuri Kayel"` (`128 -> 145` entradas ordenadas), regenerando os guardas de servidor em `relay/genesis_data.py` e `packaging/zero-central-memory-windows/src/GenesisData.cs`.
- **Filtro GraphQL pós-gênese (`client/js/genesis.js`)**: `filterGraphqlData` agora descarta transações cujas tags `Route-Id`, `Author`, `Author-Address` ou `Owner` pertencem a `TEST_ROUTE_IDS`.
- **Limpeza local de posts (`client/js/demo-seed.js`)**: `isOldOrMockPost` também verifica `p.owner` e `p.routeId` (além de `p.author`) durante `purgeMockDemoSeed`.
- **Cache do Service Worker (`client/sw.js`)**: `CACHE_NAME` incrementado para `vox-pwa-v7.107-real-network-audio-video-upload` e metadados de release atualizados.

### TURN para redes móveis: Worker de credenciais e nova tentativa depois de falha (REV-10)
- **Worker novo** em `workers/turn/`: entrega credenciais temporárias (4 h) do Cloudflare Realtime TURN só às origens do app. Para de entregar no teto do mês (`BUDGET_GB`, padrão 800 GB, lido da API de análise do Cloudflare) ou com o uso desconhecido, e limita 30 credenciais por IP por hora (guarda só hash do IP). Deploy manual pelo mantenedor ([README](./workers/turn/README.md)).
- **No app** (`client/js/turn-credentials.js`): quando uma conexão direta falha sem TURN, pede credencial e quem inicia tenta esse par de novo, uma vez por sessão. Conexões novas passam a levar o TURN, mas o ICE continua preferindo o caminho direto. No modo "só TURN", pede ao abrir. As credenciais ficam só em memória e, depois de erro ou recusa, o app espera (`Retry-After`, até 1 h).
- **Desligado até o deploy:** `turnCredentialsUrl` vazio em `signaling.json` mantém o comportamento de antes. O lint passa a cobrir `workers/`. Testes novos em `tests/turn-worker.test.js` e `tests/turn-credentials.test.js`; SW `v7.106`.

### Teste E2E de dois navegadores na malha P2P no CI (PM-99)
- Novos scripts `scripts/mesh-e2e.mjs` e `scripts/nostr-ephemeral-relay.mjs` (zero dependências externas além de `playwright-core` + Chromium): sobem o app estático, o servidor WebSocket (`relay/signaling.py`) e um relay Nostr efêmero (`kind 25050`), abrem dois contextos Chromium isolados, completam a entrada, conectam WebRTC `vox-peer-v0` em duas rodadas separadas (`ws` e `nostr`) e verificam a chegada do post assinado no feed do segundo navegador.
- Correção de corrida WebRTC detectada pelo novo E2E em `client/js/webrtc-peer.js`: rastreamento de `makingOffer` durante `createOffer()` (evita glare enquanto `signalingState` ainda está `"stable"`), fila `pendingIceCandidates` para candidatos que chegam antes de `setRemoteDescription` e guarda de identidade `RTCPeerConnection` após `await` para não fechar a conexão substituta.
- Novo job `e2e-mesh` em `.github/workflows/ci.yml` e testes unitários em `tests/nostr-ephemeral-relay.test.js` e `tests/webrtc.test.js`. SW `v7.105`.

### Medição local de sinalização (WebSocket vs Nostr) em `#/status` (PM-18)
- Novo módulo `client/js/signaling-telemetry.js` ligado a `webrtc-peer.js` e `nostr-transport.js`: conta tentativas, sucessos, falhas e tempo médio de conexão por caminho (`ws` vs `nostr`), além do tempo até o primeiro par abrir `vox-peer-v0` em cada sessão (últimas 30 sessões). Tudo fica apenas no `localStorage` do aparelho, sem envio automático e sem IDs de pares.
- `#/status` (`render/status.js` + `app/screens-status.js`) passa a exibir a tabela comparativa WebSocket × Nostr, última/média/mediana do primeiro par e botões **Copiar relatório** (para a retrospectiva do piloto) e **Zerar**. Testes em `tests/signaling-telemetry.test.js` e `tests/status-render.test.js`. SW `v7.104`.

### Segurança: diretório de perfis sem poluição de protótipo e URL de avatar validada (CodeQL 199/200/201/166)
- `client/js/profile-directory.js` passou a manipular os cartões em `Map` e recusar chaves reservadas (`__proto__`, `constructor`, `prototype`).
- `client/js/shared/html.js` exporta `sanitizeMediaUrl`, aplicada em `client/js/app/screens-community.js` antes de atualizar `img.src` ao vivo pela malha. Testes em `tests/escape-valores-rede.test.js`. SW `v7.103`.

### Configurações de rede: campos de TURN escapados (alerta 112 do CodeQL)
- `client/js/render/network.js` punha o endereço, o usuário e a credencial do servidor TURN direto no atributo `value`, sem escapar. O que a pessoa digitava (ou colava) nesses campos podia virar marcação ao reabrir as configurações. Os três campos e o host do relay no rótulo de estado agora passam por `escapeHtml`.
- Teste em `tests/render.test.js`. SW `v7.102`.

### Armazenamento durável plugado ao ter conta e ajuste de backlog para fundamentais
- `storage-persistence.js` saiu da lista de módulos não plugados e passou a rodar por `client/js/app/storage-durability-flow.js` no boot (`app.js`) e ao aceitar o pacto (`app/onboarding.js`): quem já tem conta pede persistência (`navigator.storage.persist()`) e, em aba comum do Safari/WebKit, vê uma vez a faixa orientando adicionar o Vox à Tela de Início contra a limpeza automática de 7 dias.
- Quem só está lendo não recebe o pedido nem a faixa até concluir a entrada. Testes novos em `tests/storage-durability-flow.test.js`. SW `v7.101`.
- `docs/ROADMAP.md` e `docs/FEATURES.md` atualizados para refletir entregas recentes (`#92`, `#94`+`#115`, `#101`, `#108`, `#118`) e promover os fundamentos (`REV-14`, `PM-72`, `REV-10`) para `Agora (P0)`.

### Link de convite já preenche a entrada
- Quem abre `#/connect/<id>?convite=` sem ter entrado ainda: o aparelho guarda quem chamou (7 dias, só local, `client/js/invite-arrival.js`). A tela de entrada diz "Ana te chamou para o Vox" e avisa que Ana fica nos contatos.
- Depois do pacto (18+), quem chamou vira contato (com o aviso "adicionou você") e a pessoa cai na tela de quem chamou, com o cartão do vínculo para aceitar. O convite de compartilhar o próprio link fica para depois, em vez de mais uma tela.
- O vínculo assinado continua sendo aceito à mão, no cartão. Teste novo em `tests/invite-arrival.test.js`; SW `v7.100`.

### Onboarding só na primeira ação que escreve, em duas telas, e "Já tenho conta" com o QR do outro aparelho
- Quem abre o Vox lê na hora: **Início**, **Pessoas**, link de convite (**Conectar**) e link de sincronização entraram na leitura antes de entrar (PM-54). A entrada aparece na primeira curtida, resposta, post ou voto, ou no botão **Entrar no Vox**. A faixa de baixo ficou com uma frase só.
- Saiu a tela de portão "Entrar — sou humano" (e a arte da cantina saiu do precache, -79 KB). Quem chega por uma tela de escrita (compor, mensagem, carteira, votar) vai direto para a entrada.
- Os botões de login dizem o que fazem: **Nome e foto do Google / da Meta / do GitHub**. Eles não levam a conta para outro aparelho.
- Quem é novo vê duas telas em vez de quatro: **Entrar no Vox** (Google, Meta ou GitHub trazem nome e foto, ou a pessoa escreve o nome) e o pacto (18+). Saíram a tela de boas-vindas com os três cartões de princípios e o menu "Como quer entrar?"; o pacto no onboarding ficou só com a confirmação de 18+ e as ações.
- **Já tenho conta** explica o caminho com o outro aparelho (Perfil → QR para outro aparelho) e, sem ele, entra pelos backups do e-mail (`.txt`, vários de uma vez) com a Senha Soberana, ou só pela Senha. Login com Google ou Meta continua sem levar a conta para outro aparelho (PM-90): o ID do login não é segredo.
- Removidas de `agora.css` as regras das telas que saíram (3,6 KB). Testes de propósito alterados: `tests/onboarding-steps.test.js` (etapas `entry`, `have` e `pact`), `tests/sovereign-agora.test.js` (sem o título antigo e os cartões de princípios), `tests/cantina-gate.test.js` e `tests/read-first.test.js` (Início e Pessoas abrem para leitura; saíram os testes do clique por baixo do portão) e `tests/render.test.js` (saiu o teste do portão). SW `v7.99`.

### Valores de fora escapados antes de entrar na tela
- O formato da foto de um post (`aspectRatio`) vem de quem publicou; agora só valores conhecidos (`original`, `1:1`, `4:5`, `3:4`, `4:3`, `16:9`, `9:16`) entram no HTML, pelo novo `normalizePostAspect` em `render/util.js`. Vale no feed e no tópico.
- Escapados também: os endereços de relay nas configurações de rede, o @handle no formulário de reivindicação, a inicial do avatar no perfil e o nome da comunidade no texto alternativo da foto.
- Achados na triagem dos alertas do CodeQL na `main`. Teste novo em `tests/escape-valores-rede.test.js`; SW `v7.98`.

### Moderador natural: a moderação prevalece e a data do arquivamento é conferida (revisão do #94)
- Atrás da flag `vox.lab.moderador`. Um arquivamento natural sobre o post de outra pessoa tornava visível de novo um post que a moderação tinha escondido; agora o que a moderação escondeu não é substituído nem desfeito pelo arquivamento natural (`client/js/moderation.js`).
- O `ts` do arquivamento, assinado pelo padrinho, só vale entre a data do post e o relógio do aparelho, com 5 minutos de folga (`isPlausibleHideTime` em `client/js/natural-mod.js`). Data no futuro impedia o `unhide` da moderação de desfazer; data retroativa zerava a contagem de reversões.
- Limite que continua: sobre post antigo, anterior às reversões, a data retroativa ainda passa (descrito em `docs/specs/moderador-natural-v0.md`).
- 3 testes novos em `tests/natural-mod.test.js`. SW `v7.97`.

### Moderador natural (PM-83, lotes A a F)
- Lógica de quem responde por quem a partir dos vínculos assinados: padrinho, ou a pessoa mais próxima (vínculo comum mais antigo, membro da comunidade primeiro), nunca a outra parte. Tela **Meus vínculos** no topo de Pessoas. Laboratório `vox.lab.moderador`.
- **Lote E:** "Pedir mediação" vai, por mensagem cifrada, ao moderador natural de cada parte, com o cartão do post e sem arquivar nada; sem vínculo, segue para a moderação da comunidade.
- **Lotes B a D:** a denúncia também vai, por mensagem cifrada, ao moderador natural de cada lado. O aviso a N1 sai do aparelho da moderação, para N1 não saber quem denunciou; o caso guardado não tem quem denunciou; motivo grave não vai. Em Pessoas → Meus vínculos: arquivar para todos (só padrinho, com a prova do vínculo, até 30 afilhados e menos de 3 reversões em 90 dias), mandar para revisão ou não decidir. Os outros aparelhos conferem a prova antes de esconder; a moderação desfaz.
- **Lote F:** trocar de padrinho uma vez (vale 7 dias depois, com as duas assinaturas) e vínculo "só para mediação", que nunca dá poder de arquivar. As opções aparecem no cartão do convite com a flag.
- Precache: os 4 módulos novos entram no `SHELL_ASSETS`; testes de `verifyLink` ajustados para devolver `mediationOnly` e `switchFrom`. SW `v7.96`.

### Sorteio cívico (lote 4)
- Na aba de avisos, a moderação cria um sorteio com a lista de membros congelada. Testemunhas se comprometem com um segredo e revelam depois do fecho; a moderação apura e todo aparelho recalcula o mesmo resultado. Basta uma testemunha honesta; quem não revela fica apontado. Laboratório `vox.lab.aviso`.
- Precache: `logo-mark.png` e `icon-white-192.png` com paleta (−20 KB, visualmente iguais). SW `v7.95`.

### Aviso de contato: limite de alertas e sem consulta extra ao abrir
- No máximo 3 alertas (toast e notificação do sistema) por hora para "adicionou você". Como chave nova não custa nada, alguém poderia encher a tela de alertas; os avisos além do limite entram só na seção **Quem adicionou você**.
- O app não consulta mais a caixa de mensagens do relay ao abrir, em qualquer tela. A consulta segue ao entrar em **Pessoas** e em **Mensagens**.
- Teste novo em `tests/contact-notify.test.js`; SW `v7.94`.

### Precache sem teto de bytes (PM-02)
- Decisão do mantenedor (2026-11-12): o precache deixa de ter teto. O teste `tests/shell-reachability.test.js` continua somando o shell e imprime o total, mas nenhum número reprova o CI; saíram a constante `SHELL_BUDGET_BYTES` e o histórico de medições.
- A disciplina de manter o precache enxuto dentro do razoável passa a ser cobrada na revisão (regra em [docs/HARDENING.md](./docs/HARDENING.md), seção "Peso do precache"). O teste PM-04 (módulo inalcançável fora do precache) não mudou.

### Diretório: domínio do avatar do Google conferido pelo host da URL
- `client/js/people-index.js` decidia se um avatar era do Google ou da Meta procurando o domínio em qualquer parte da URL (alertas do CodeQL). A regra do Google agora lê o host com `new URL`, exige `https:` e aceita só `googleusercontent.com` e subdomínios. A regra da Meta saiu: só valia para URLs idênticas, caso que a comparação anterior já resolve.
- `client/js/app/contact-notify-flow.js` importa `shortId` de `short-id.js`, não mais de `render/util.js`.
- Teste novo em `tests/people-index.test.js`. SW `v7.93`.

### Domínio não importa mais a camada de UI para escapar texto
- Nada muda na tela. `escapeHtml` saiu de `client/js/render/util.js` para `client/js/shared/html.js` (módulo sem imports) e `shortId` para `client/js/short-id.js` (domínio, porque conhece a conta oficial). `render/util.js` reexporta os dois, então os módulos da UI seguem importando de lá.
- Seis módulos do domínio (`civic-credential.js`, `community-unread.js`, `explode-dispatch.js`, `inline-composer.js`, `perma-notary.js`, `people-index.js`) passam a importar da origem. Nenhum módulo de domínio importa mais `render/util.js`; sobra o `render.js`, que é o barril da própria UI.
- As duas funções ganharam JSDoc (eram dívida) e saíram de `scripts/docs-debt.json` pelo `--prune`.
- Peso: +1.454 B de cabeçalho e JSDoc, sem código novo, pagos em parte tirando de `style.css` e `agora.css` 33 seletores de 23 classes que nenhum JS/HTML do cliente gera mais (-970 B). Nenhuma regra inteira saiu: só o seletor órfão dentro da lista, então o estilo de quem aparece na tela não muda. Medido em 2.019.122 bytes após o merge da `main` (teto de 2.019.348 bytes mantido).
- SW `v7.92`.

### Aviso cifrado quando alguém adiciona você aos contatos
- Ao adicionar alguém aos contatos (em **Conectar** ou na lista de membros da comunidade), o aparelho envia um aviso assinado e cifrado E2E pelo canal direto (`kind: "contact_added"`, sem criar mensagem falsa na conversa de DM).
- Quem recebe vê o aviso na seção **Quem adicionou você** no topo de **Pessoas** (`#/people`), com botão **Adicionar de volta** e **Dispensar**, além de toast no app e notificação do sistema se autorizada.
- Seguir autor continua silencioso para preservar o anonimato de leitura.
- Módulos `client/js/contact-notify.js` e `client/js/app/contact-notify-flow.js`; testes em `tests/contact-notify.test.js`; SW `v7.91`.

### Diretório e prévia de conexão usam a foto carregada e não escondem outras contas Google/Meta
- A linha do diretório de cidadãos (`renderPeopleResultRow`) e a prévia de conexão (`renderConnectPreview`) passam `p.avatarUrl` / `profile.avatar` para `renderAvatarHtml`, em vez de depender só do cartão sincronizado em `profileDirectory`.
- Corrigida a deduplicação social em `profile-directory.js` (`hasSameSocialAvatar` considerava iguais quaisquer duas URLs de Google/Meta distintas, apagando o outro cartão em `localStorage`, e `normalizeSocialAvatarBase` perdia `?psid=/asid=` do Facebook) e em `people-index.js` / `local-account.js` (mesmo nome + domínios Google/Meta diferentes deixam de colidir). Duas contas Google/Meta distintas com o mesmo nome agora aparecem separadas no diretório com suas fotos.
- Testes novos em `tests/people-chosen-name.test.js` e `tests/people-index.test.js`.
- SW `v7.90`.

### Política do teto de bytes do precache (PM-02)
- Atualizadas a nota em `tests/shell-reachability.test.js` e a seção **Peso do precache (PM-02)** em [docs/HARDENING.md](./docs/HARDENING.md): o orçamento do precache segue como disciplina para crescer o mínimo e evitar desperdício real, mas deixa de ser limite duro que exija cortes improdutivos quando uma mudança já está enxuta. Limites de código e JSDoc seguem inalterados.

### Backup semanal e mensal no seu e-mail
- Nova seção **Backup no seu e-mail** em Sua rede (`#/settings`): liga com a Senha Soberana uma vez; semanal e mensal podem ser desligados. Ao abrir o app com um backup vencido, um aviso oferece **Enviar para meu e-mail**: o app prepara um `.txt` cifrado e abre o compartilhar do sistema (Gmail, Outlook, Mail); onde o navegador não compartilha arquivo, baixa.
- Sem servidor: o Vox não guarda nem conhece o endereço. O arquivo leva as chaves (com a de DM), perfil, Pix, contatos, texto das DMs e os próprios posts do período; só a Senha abre. O mensal repete de propósito o conteúdo das semanas.
- **Restaurar Backup** (Perfil) aceita vários arquivos `.txt` de uma vez e aplica do mais antigo ao mais novo.
- Depois da revisão: chaves e par de backup num só envelope de 600 mil iterações (antes as chaves iam no `.voxid`, de 210 mil); post editado ou apagado no período entra no backup; o arquivo é montado antes do toque, para o compartilhar não recusar por demora; misturar `.voxid` com backups dá erro claro em vez de ignorar arquivos; o download só libera o endereço temporário depois (`share.downloadBlob`, usado também pelo `.voxid`); as DMs são lidas numa leitura só (`cache-node.getAllDmMessages`).
- Peso: os dois módulos novos e a ligação nas telas (+13,4 KB). Pagos em parte removendo a folha POSSE pós-publicação, que nada abria desde o cockpit Ecoe (2168dae; -9,5 KB com o CSS; decisão do mantenedor; 4 testes que liam o código da folha saíram ou foram ajustados), e recomprimindo `icons/icon-mark-black-128.png` em paleta exata (pixels idênticos, -517 B). O resto, 2.717 B, sobe o teto do precache para 2.004.623 bytes.
- Testes novos em `tests/inbox-backup.test.js`; documentação em [IDENTITY.md](./docs/IDENTITY.md#backup-no-seu-e-mail-clientjsinbox-backupjs-clientjsappinbox-backup-uijs).
- SW `v7.89`.

### Contas sem nome não sujam mais a rede
- Uma conta que nunca escolheu nome (a chave criada na primeira visita, numa aba anônima ou num navegador novo) não manda mais cartão de perfil para a memória central, para a malha nem para o Arweave. Era a origem das centenas de perfis vazios no NodeZero. Assim que a pessoa escolhe um nome, o cartão passa a sair como antes.
- O aparelho para de publicar juntas todas as contas do cofre: só a conta ativa publica o próprio cartão. Publicar todas de uma vez contava a quem lesse que eram da mesma pessoa.
- Quem desligou "aparecer na malha" não tem mais o próprio cartão reenviado pela sincronização com a memória central.
- Cartão sem nome que chega de um app antigo ou da memória central não é guardado nem repassado.
- Peso pago removendo 13 exportações que nada usava (textos e listas soltas em `i18n-pt-br.js`, `bsky-feed.js`, `media-lofi.js`, `gossip-retract-ui.js`, `peers.js`, `app/photo-tag-persist.js`) e a regra CSS `.gossip-edited-pill`, que nada gerava.
- Teste novo em `tests/profile-card-share.test.js`; emenda no [ADR-003](./docs/adr/003-profile-card-gossip.md).
- SW `v7.88`.

### Diretório: homônimo de outra chave não some mais dentro de "Você"
- Quando outra conta tinha exatamente o seu nome, o diretório a tratava como você e a escondia dentro da linha "Você". Duas pessoas reais com o mesmo nome (duas "Maria Silva") não se viam. Achado com duas contas "Yuri Kayel" do mantenedor, uma em cada navegador: cada uma só via a si mesma.
- Agora o nome igual só une contas que moram no mesmo aparelho (a sua e as do seu cofre), como antes. Uma chave de fora com o mesmo nome aparece como outra pessoa. A união por foto (mesma foto do Google ou da Meta) não mudou.
- Teste novo em `tests/people-index.test.js`; o teste que une as contas do cofre com o mesmo nome segue igual.
- SW `v7.87`.

### Selo "Malha ativa" nas configurações
- O selo **Malha ativa / Offline / Só leitura** saiu da barra do topo (pedido do mantenedor) e passou para o cabeçalho da tela **Sua rede** (`#/settings`), antes dos outros estados. Continua levando à Saúde do nó, com o detalhe (ex.: "2 aparelhos") ao passar o mouse. O estado da rede segue também no rodapé da barra lateral e na gaveta de identidade, como antes.
- `render/shell.js` era do Lote A do Antigravity, mas não havia trabalho dele em aberto no arquivo; a mudança foi feita a pedido direto do mantenedor e registrada no `lobby.md`.
- SW `v7.86` (era v7.83; a main chegou a v7.85 com o #102 e o #104).

### Nomes de usuário no amarelo da Ágora Soberana
- O nome de quem publica aparece no amarelo do design system (`--sa-secondary`, o mesmo da faixa "Bem-vindo ao Vox"), em post, resposta, legenda de foto, cabeçalho do perfil e lista de membros da comunidade. Antes era o branco do texto. No modo claro o token já troca para o ocre escuro, que mantém contraste AA sobre o fundo claro.
- Sobre a foto, o nome usa o amarelo claro fixo (`--sa-secondary-fixed-dim`, novo token em `client/css/agora.css`) nos dois modos, porque ali o fundo é a imagem, não o tema.
- SW `v7.85`.

### Roadmap e backlog de 2027 (documentação)
- **Calendário 2027 no [ROADMAP](./docs/ROADMAP.md#calendário-2027):** dezembro e os quatro trimestres, com tema, marco (G1, G2, G3), itens por ID e uma data de desistência em cada trimestre. Todo ID aberto ganhou um trimestre ou entrou na lista "fora de 2027".
- **Brainstorm do ano** em [docs/brainstorms/brainstorm-roadmap-2027.md](./docs/brainstorms/brainstorm-roadmap-2027.md): norte de dez/2027 com piso e meta, datas fixas (NLnet, assinatura v2, assembleias, semestres, eleição municipal de 2028), ideias por eixo, triagem, riscos e decisões pendentes do mantenedor.
- **Backlog:** 11 linhas novas (PM-99…PM-109: teste de dois navegadores no CI, modo ensaio, lápide de conta, fim da convivência v1, relatório trimestral, garantia da praça, caminho de volta do POSSE, árvore do repasse, turma de extensão, editais brasileiros, preparo de 2028) e 4 promovidas do brainstorm de melhorias (PM-01, PM-13, PM-18, PM-23). Sem mudança de código nem de SW.

### Corte da gênese nos servidores e na malha P2P; gênese em 12/11 00:00
- **Gênese passa para 2026-11-12 00:00 (Brasília)** (era 11/11 20:55), a pedido do mantenedor: "nada anterior a hoje". As contas e os posts criados entre 20:55 e a meia-noite também ficam de fora.
- **Memória central recusa o que o cliente já recusa** (relay Python em [`relay/genesis_guard.py`](./relay/genesis_guard.py), nó em C# em `packaging/zero-central-memory-windows/src/GenesisGuard.cs`): cartão de conta de teste, post de autor de teste e post criado antes da gênese não entram. O que já está no disco sai ao carregar o estado. Motivo: um aparelho ainda na versão antiga reenviava tudo na primeira sincronização, e o NodeZero, limpo à mão duas vezes, voltava a ter 134 perfis de teste segundos depois.
- **Malha P2P:** quem recebe um GOSSIP (ou GOSSIP_UPDATE) de conta de teste ou de post anterior à gênese não guarda nem repassa (`client/js/peers.js`). Antes só a purga da abertura seguinte limpava.
- **Fonte única:** a lista e a data continuam em `client/js`; `node scripts/gen-genesis-guard.mjs` gera `relay/genesis_data.py` e `GenesisData.cs`, e `tests/genesis-guard-sync.test.js` falha se divergirem. O CI do Windows compila o nó e roda `GenesisGuardCheck.cs`.
- Testes: `tests/gossip-retract.test.js` usava datas de 1970 (`ts: 1000`), que agora são anteriores à gênese; as datas passaram a ser relativas a `GENESIS_MS`, com os mesmos intervalos.
- O NodeZero só passa a recusar depois de recompilado e reinstalado (`packaging/zero-central-memory-windows/build.ps1`). SW `v7.84` (v7.83 está no #101).

### Lote UI 2 das telas sem layout do Stitch: compositores e entrada
- **Compositor que não pode abrir agora explica e dá saída.** Aviso para quem não é da moderação: "Avisos são da moderação", com "Abrir um tópico" e "← Voltar à comunidade" (antes era uma frase solta). Oferta em comunidade sem feira: "Feira comunitária não ativada", com "Propor a abertura da feira" (abre o compositor de proposta da comunidade) e volta (antes era uma caixa vermelha de erro). A aba Feira da comunidade usa o mesmo bloco e ganhou o atalho para propor.
- **Etapas do compositor sem vão:** saiu a altura mínima de 180px do corpo da etapa, que deixava um buraco entre o campo e os botões Voltar/Continuar nas etapas curtas.
- **Onboarding, "pular":** o botão dizia "Pular — continuar só com vx_" (a chave crua como identidade). Agora diz "Pular por agora — escolho o nome depois", com a nota de que sem nome a conta não aparece no diretório de pessoas e que dá para escolher em Perfil.
- SW `v7.82`.

### Lote UI 1 das telas sem layout do Stitch
- **Diretório de Cidadãos:** só aparece quem escolheu um nome (mais você e o perfil Vox). Contas só com a chave `vx_…` — da malha, do cofre deste aparelho ou dos contatos — saem da lista; continuam achadas pela chave completa na busca. A linha mostra nome e @, sem a chave (que fica no perfil). Sua própria conta ainda sem nome aparece como "Você", com o botão "Escolher nome". Linhas separadas por fio, ações compactas; "Mensagem P2P" virou "Mensagem".
- **`#/compose`** abre o compositor (antes caía em "Página não encontrada").
- **Saúde do nó:** a leitura do Arweave aparece como Normal / Instável / Leitura reserva, não o código interno (`all_ok`).
- **Voxpedia:** o título abre a página; antes, no celular, ela começava pelo índice.
- **Guias da rede e da carteira:** a escolha da primeira etapa virou cartões de opção (como o "O que você vai publicar?"), com a explicação de cada opção à vista.
- Precache: +4,8 KB pagos recomprimindo `icons/icon-white-192.png` em paleta (pixels idênticos, −10,1 KB); teto baixado para 0,2% acima do medido.
- SW `v7.81` (v7.79 reservado ao #94, v7.80 ao #98).

### Data de corte da rede viva (gênese) e purga dos dados de teste
- **Gênese em 2026-11-11 20:55 (Brasília):** o que foi publicado antes é tratado como teste. A leitura do Arweave (GraphQL) e a memória central deixam esses itens de fora.
- **Purga no aparelho, a cada abertura do app (decisão do mantenedor):** apaga do aparelho, sem volta, posts e cartões de perfil anteriores à gênese, as comunidades `demo-*` e a conta de teste `vx_WAqxgW` dos contatos. Isso inclui posts antigos da própria pessoa. Nada é apagado no Arweave; só a cópia local.
- **Contas de teste fora do diretório (pedido do mantenedor):** as 128 contas criadas nos testes (sem nome escolhido, a Ana Lúcia de teste e as seis contas "Yuri Kayel" do mantenedor, inclusive a que ele usava) estão em [`client/js/data/test-route-ids.js`](./client/js/data/test-route-ids.js). O aparelho apaga cartão, contato e posts delas e recusa cartão novo delas vindo da malha ou da memória central: cada aparelho regravava o cartão com a data do recebimento, então o corte por data sozinho não as tirava. Fica só o perfil oficial Vox; nos aparelhos do mantenedor, a chave da conta antiga sai pelo botão "Apagar conta local" do perfil.
- Corrige a definição circular de `--sa-error` (o vermelho de erro do tema escuro ficava indefinido).
- SW `v7.80` (v7.79 está reservado ao #94).

### Norma de documentação e revisão das últimas 24 h (PM-98)
- **Norma nova** em [docs/process/documentacao.md](./docs/process/documentacao.md): cabeçalho em todo módulo, JSDoc completo em todo export (`@param`, `@returns`, `@throws`, `@type` com unidade), o porquê nos comentários e a tabela do que atualizar em cada tipo de mudança (spec, FEATURES, ROADMAP, ADR, THREAT-MODEL, CHANGELOG).
- **`npm run audit:docs`** ([scripts/docs-audit.mjs](./scripts/docs-audit.mjs)) lê a árvore sintática e reprova export sem JSDoc, parâmetro sem `@param`, retorno sem `@returns`, link relativo quebrado e doc fora do índice. Entra no `npm run validate` e no CI. A dívida antiga (2.296 itens, medida na `main`) fica em [scripts/docs-debt.json](./scripts/docs-debt.json) como catraca: só diminui.
- **Código das últimas 24 h documentado por completo** (−252 itens de dívida): aviso assinado, página leve de conferência, chamada de ação, competências, termo de convivência, denúncia e mediação, assinatura (`signed-verify.js`), armazenamento por modo e Guardião, DM. Só comentários mudaram; os tokens do código foram comparados antes e depois.
- Documentação técnica alinhada: a spec do aviso dizia "proposta, não implementada" e agora diz o que está no ar e em qual PR; o FEATURES ganhou as linhas do aviso, da chamada de ação, das competências, do termo e da mediação; o ROADMAP ganhou o **PM-97**. Um comentário solto em `report.js` voltou para a função certa e o cabeçalho de `screens-community.js` voltou para o topo.
- Precache: os comentários vão para o celular (o app não tem build). Foram pagos trocando `cantina-gate.jpg` por WebP (−40,5 KB, visualmente igual; a mesma troca do PR #94). Teto do orçamento baixado para 0,2% acima do medido. SW `v7.78` (era v7.75; subiu no merge com a main, que já estava em v7.77).
### Telas 6–8 do Stitch: tópico, página da comunidade e pauta
- **Tópico:** trilha "Comunidades / comunidade / Tópico", post original como estela com friso, título serifado, divisor "◆ Respostas (N)" em bronze, linhas-guia por nível de resposta (até 4) e doca "Escreva sua resposta…" presa acima da barra inferior no celular (some em tópico encerrado).
- **Página da comunidade:** números reais (membros conhecidos, tópicos carregados, pautas em votação), pauta aberta em destaque na aba Posts e coluna lateral com "Sustentada por vizinhos" e a semeadura em telas largas (≥1100px). A coluna lateral volta de propósito (antes tinha sido tirada); o teste de render que proibia a coluna foi ajustado.
- **Pauta:** trilha até "Governança / Pauta", proponente em destaque, apuração por opção com porcentagem e, em telas largas, apuração e cédula numa coluna ao lado. Botões da cédula com `aria-pressed`.
- Precache: a camada nova foi paga tirando 18,9 KB de regras CSS que nenhuma tela usa mais (barra de apuração antiga, cartões e abas antigos de comunidade e feed, restos da camada anterior); conferido com estilo computado idêntico em todas as rotas, antes e depois da poda. A tela da pauta saiu de `render/community.js` para `render/proposal.js`. Teto do orçamento mantido (o medido ficou abaixo dele). Dois testes que exigiam o CSS do título de post de foto e do wordmark V/O/X antigo (que nenhuma tela desenha mais) foram ajustados. SW `v7.77`.

### Correções de tela achadas no tour Playwright (P0)
- **Botões ativos sem texto:** `--primary` nunca foi definido no CSS, então a ordenação ativa da comunidade ("Atividade Recente"), a tag cívica ativa e a pílula de tag ficavam com texto branco em fundo transparente. Agora usam `--accent` / `--on-accent`, que acompanham o tema claro e escuro.
- **Comunidade rolava de lado no celular:** as abas Posts / Membros / Classificados / Governança alargavam a página para 462px numa tela de 412px. Agora rolam dentro da própria barra.
- **Palavras quebradas no meio** ("e/stimativa", "0.0 M/B"): `.card .meta` usava `word-break: break-all`; passou a `overflow-wrap: anywhere`, que só quebra o que não cabe (endereços longos).
- **Erro vermelho no primeiro passo do onboarding** ("Google/Meta requerem oauth.json…"): sai o erro; os botões de Google e Meta só aparecem quando o `config/oauth.json` traz o id do cliente.
- **Rota inexistente caía na Ágora sem aviso:** nova tela "Página não encontrada" com o endereço pedido e links de volta; `#/@arroba` passa a abrir o perfil do handle.
- SW `v7.76`.

### ADR-023, emenda 1 (aceita): moderador natural
- Mediação vai para o padrinho (ou o mais próximo) das duas partes, sem arquivar nada. "Mais próximo" só por vínculo assinado, sem sinais de interação. Teto de 30 afilhados com poder firme; perda do papel por 3 reversões em 90 dias, por comunidade; recusar sem custo; "Meus vínculos"; trocar de padrinho uma vez; vínculo só para mediação. Ordem dos lotes do PM-83.

### Termo de convivência e pedido de mediação (lote 3)
- A moderação pode publicar um **termo de convivência**; quem entra assina o hash do termo junto com a entrada. Se o termo mudar, quem já entrou é avisado e pode assinar de novo. Laboratório `vox.lab.aviso`.
- **Pedir mediação** no menu ⋯ do post: abre a conversa cifrada com a moderação com o cartão do post, sem ocultar nem arquivar nada.
- Precache: a imagem dentro do `icon.svg` passou a PNG com paleta (−12,7 KB, visualmente igual). SW `v7.73`.

### Competências só no aparelho (lote 2)
- Na aba de avisos, **Minhas competências** fica só no aparelho (não vai para o perfil nem para a rede) e serve para sugerir um papel quando chega uma chamada de ação com vaga. Sem diretório público. Laboratório `vox.lab.aviso`. SW `v7.72`.

### Chamada de ação no aviso (lote 1)
- A convocação ganha **papéis com vagas e quórum mínimo** ("Jurídico 2, comunicação 3"). Quem assume um papel manda a resposta assinada **por DM cifrada a quem convocou**; o público vê só a contagem por papel que a coordenação publica, e o estado (aberta, quórum atingido, sem quórum). Nomes só no aparelho da coordenação. Laboratório `vox.lab.aviso`.
- Precache: saiu o `profile-vox-official-512.png` (cópia exata do `icon-512.png`); o perfil oficial usa o `icon-white-192.png`. Teto do orçamento baixado para 0,2% acima do medido. Teste do avatar do perfil oficial ajustado ao arquivo novo. SW `v7.71`.

### Armazenamento por modo, banda proporcional e camadas de mídia só para economia
- **Nó leve: 100 MB fixos** (era 25). **Apoiador: de 512 MB a 1 GB** (era 250 MB; começa em 1 GB). **Modo Guardião: 2 GB fixos** (era a escolha entre 50 e 500 MB). O campo de disco fica travado em 100 no nó leve e aceita de 512 a 1024 no apoiador.
- **Banda proporcional ao disco**: até o dobro por dia. Nó leve de 50 para **200 MB/dia**, apoiador de 500 MB para **1 a 2 GB/dia**, Guardião até 4 GB/dia. A pessoa pode baixar o teto diário, nunca passar do dobro. O 4G segue com teto próprio (5 MB/dia). O assistente guiado oferece 50, 100, 150 ou 200 MB/dia.
- Na spec da replicação por grau, o teto único de 750 MB vira a tabela por modo.
- Os próprios posts **contam no teto**: a Full é o original publicado e o backup local. **Apagar aqui apaga para todo mundo**, pela retração assinada, e a tela avisa que não há volta.
- ADR-029: Half e Full **só economizam banda e espaço**, não controlam acesso. Quem segue pede a Full, e ninguém confere; saiu o comprovante de seguir.
- Testes que fixam os padrões e limites (`peers`, `seeder-guardian`, `supporter-mode`) atualizados para os valores novos; testes novos para o disco por modo e a banda proporcional. SW `v7.70`.

### ADR-030 (aceito): trazer do Bluesky (PESOS)
- A pessoa continua postando no Bluesky e traz os próprios posts para o Vox: fila com confirmação ao abrir o app, sem servidor, assinados pela chave dela, com o original (`origin`) dentro da assinatura. Destino padrão no perfil; comunidade só por escolha em cada item.
- Só posts de raiz da conta vinculada por login. Sem eco com a replicação Vox→Bluesky. Imagens pelo PDS da pessoa (o CDN do Bluesky não libera CORS); vídeo como link. Apagar no Bluesky segue a preferência da pessoa nas configurações: perguntar (padrão), apagar no Vox também ou manter.
- A preservação vem das cópias de quem segue (replicação e backup orgânico, idealmente em caixa preta, sem manuseio); o Arweave segue só como cartório.
- Recusados: nó assinando sem o aparelho, extensão que captura texto no X ou no Threads, webhook, e X/Threads/Instagram como fonte. Detalhes no [ADR](./docs/adr/030-trazer-do-bluesky-pesos.md).

### ADR-029 (aceito): mídia em duas camadas, 360p e 720p
- Decisões do mantenedor (11/11/2026):
  - **sem teto de 100 KB por item**: os pedaços ficam só como unidade de transporte;
  - **duas camadas**: quem **segue** o autor recebe a Full (720p, q80, Opus 96 kbps) sem fazer nada, e a guarda e serve a outros seguidores; quem não segue recebe só a Half (360p, q60, 48 kbps); nas configurações, dá para preferir a Half;
  - **30 fps** em todo vídeo.
- O Arweave fica como cartório (texto e hash).
- A [spec da mídia v2](./docs/specs/midia-v2.md), a [replicação por grau](./docs/specs/replicacao-por-grau-v0.md) e o PM-71 foram atualizados. A ferramenta de medição passou a 30 fps.
- Tamanhos das camadas novas ainda não medidos. Não há codificador no app ainda, então nada muda na tela.

### ADR-028 (aceito): ponte com o Fediverso via Bluesky
- Sem servidor ActivityPub próprio. Quem quiser ser seguido no Mastodon ou no Threads liga o Bridgy Fed na própria conta do Bluesky, para onde o Vox já publica. Aviso de núcleo não atravessa automaticamente. Gatilho para rever registrado no [ADR](./docs/adr/028-ponte-activitypub-via-bluesky.md).

### Aviso assinado: lote D (no app, atrás da flag de laboratório)
- Aba `#/c/<id>/avisos` e compositor `#/compose/aviso?c=<id>` em três etapas (tipo, texto, quando e onde), só para dono e moderação. Cartão com selo, código, respostas assinadas (membros e de fora separados) e contagem colada.
- Depois de publicar, a folha de envio mostra o texto do WhatsApp; o link de conferência só aparece quando a coordenação pede. "Colar respostas do WhatsApp" publica só os números; "Cancelar ou corrigir" publica um cancelamento assinado.
- Com `localStorage["vox.lab.aviso"] = "1"`, a comunidade mostra o aviso ativo no topo e o caminho para a aba. Sem a flag, nada aparece.
- Precache: os módulos do aviso (~31 KB) foram pagos tirando do precache o `icon-white-512.png` (41 KB), que dentro do app só aparecia em 48 px e agora usa o de 192 px, já cacheado. O arquivo de 512 px continua no ar para o manifesto do PWA e o OAuth. O teto desce pela catraca (2.062.350). SW `v7.69`. 6 testes.
- Corrigido antes do merge: o link de conferência gerado no app agora leva a forma assinada do aviso (`getPostRecord`); o registro local normalizado tem campos a mais e abria como "Não confie".

### Aviso assinado: lote C (página leve de conferência)
- `client/aviso.html` + `client/aviso/aviso-page.js`: abre o link de conferência sem conta e sem carregar o app, confere a assinatura no aparelho e mostra verde (chave já conhecida), amarelo (primeira vez: guarda a chave), vermelho (alterado) ou vermelho de chave nova para grupo **ou nome** já conhecido, com botão "A coordenação confirmou este código". Respostas prontas para colar no grupo (`wa.me`). CSP própria, sem rede (`connect-src 'none'`), fora do precache.
- A conferência de assinatura saiu de `local-account.js` para `client/js/signed-verify.js` (sem mudar comportamento) e a lógica de link/códigos para `client/aviso/aviso-link.js`, sem dependências (a página é entrada à parte, como `embed/`: fora do app e do precache). SW `v7.68`. 6 testes.

### Aviso assinado: link de conferência sob demanda
- O teste no WhatsApp mostrou que o link funciona, mas o paredão de texto é hostil. O aviso agora vai limpo; o link vai numa segunda mensagem, só quando a coordenação pede (`buildAvisoLinkMessage`). Dilemas e saídas futuras (link curto pelo Arweave, formato compacto) registrados na [spec](./docs/specs/aviso-assinado-v0.md#dilemas-registrados-em-11112026).

### Aviso assinado: lote B (contar respostas coladas, ainda não plugado)
- `client/js/aviso-replies.js`: lê os dois formatos de exportação do WhatsApp e linhas soltas, reconhece ciente, vou, talvez e não vou (palavras e emojis), fica com a última resposta de cada nome, ignora resposta com código de outro aviso e devolve só números. Em `UNPLUGGED_MODULES`: precache e `CACHE_NAME` sem mudança. 4 testes.

### Aviso assinado: lote A (lógica pura, ainda não plugada)
- `client/js/aviso.js`: montar e validar o aviso (`cobranca` recusado), selo só de dono ou moderação, topo, vencimento e cancelamento, respostas e contagem colada, códigos, texto do WhatsApp e link de conferência ([spec](./docs/specs/aviso-assinado-v0.md)). Fica em `UNPLUGGED_MODULES`: precache e `CACHE_NAME` sem mudança. 9 testes em `tests/aviso.test.js`.

### Docs: spec do aviso assinado (proposta)
- [Aviso assinado v0](./docs/specs/aviso-assinado-v0.md), primeira peça da [síntese](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md):
  - o aviso é um tópico com campos de aviso, e só tem selo quando vem de dono ou moderação;
  - o texto vai pronto para o WhatsApp;
  - uma página leve, sem conta, confere a assinatura no celular de quem abre;
  - respostas assinadas no Vox e contagem das respostas coladas do WhatsApp, só com números.
- Proposta, **não implementada**: nada de código neste PR.
- As três perguntas abertas da spec respondidas: tipo desconhecido é guardado e repassado sem aparecer no feed; código de 4 caracteres basta; limite do link no WhatsApp fica para teste no piloto.

### Docs: a síntese troca a analogia "WeChat" pela ágora
- A [síntese — a praça de colunas](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) ganha a seção "A imagem: a ágora": mapa entre os edifícios da ágora de Atenas e as peças do Vox, o **sorteio** como peça candidata depois das seis, e onde a palavra não entra (marca pública, tela, romantização). O [doc dos nichos](./docs/brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md) aponta a troca.

### Docs: brainstorms da captação, do refino e dos nichos, e a síntese dos seis
- [Dez estratégias de captação](./docs/brainstorms/brainstorm-captacao-por-perfil-2026-11-10.md), [refino: da praça-cartório à rede de ação](./docs/brainstorms/brainstorm-refino-rede-de-acao-e-soberania-2026-11-10.md) e [nichos como colunas de um "WeChat democrático"](./docs/brainstorms/brainstorm-nichos-colunas-wechat-democratico-2026-11-10.md), ligados ao [índice](./docs/README.md) e à [estratégia de 90 dias](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md). Só ideias; nada de código.
- [Síntese — a praça de colunas](./docs/brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) consolida os seis brainstorms de 10/11 (vale a síntese quando divergirem), com pesquisa nova sobre o PL 5.746/2026 e o campo pró-democrático de centro e de direita. As seis peças comuns entram no ROADMAP como **candidatas**, sem caixa.

### Docs: brainstorms do terceiro lugar e do público
- [O Vox como "terceiro lugar"](./docs/brainstorms/brainstorm-terceiro-lugar-2026-11-10.md) e [para quem e com que gestos](./docs/brainstorms/brainstorm-publico-e-gestos-conhecidos-2026-11-10.md), ligados à [estratégia de 90 dias](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md) e ao índice. Ações candidatas; nada vira caixa no ROADMAP sem o mantenedor.

### Correção: o texto dizia Ed25519, a conta usa P-256 (SW v7.67)
- Três textos do app afirmavam que a chave da conta é **Ed25519**; a conta assina com **ECDSA P-256** (`key-lock.js`, `local-account.js`). Ed25519 só existe em `vox-identity.js`, ainda não plugado. O compositor e a criação de identidade deixam de citar algoritmo; a tela de status mostra "P-256 (ECDSA)".
- Mesma correção nas páginas de download e da revolução e em dois docs ([POSITIONING](./docs/product/POSITIONING.md), [infra participativa](./docs/strategy/infra-participativa-blindagem-crescimento.md)). Teste novo (`tests/rotulos-algoritmo-assinatura.test.js`) impede a volta do texto errado.

### Docs: rascunhos para o piloto G1 (estratégia de 90 dias)
- [Estratégia por ponto fraco](./docs/strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md) registrada, com as decisões de 10/11: cunha do piloto é o modo assembleia para grupos de WhatsApp; segunda pessoa ainda não escolhida.
- Rascunhos prontos, **nada enviado e nenhuma issue criada**: [briefing do parecer do G1](./docs/legal/briefing-parecer-g1.md) (5 perguntas fechadas, REV-12/LAN-01), [roteiro da conversa](./docs/pilot/piloto-g1-roteiro-conversa.md) e [convite](./docs/pilot/piloto-g1-convite.md) do piloto (PIL-01), [10 primeiras tarefas e guia](./docs/process/primeiras-tarefas-contribuidor.md) (PM-41) e [segunda pessoa em etapas](./docs/process/segunda-pessoa-acesso-gradual.md) (LAN-30).

### Segurança: assinatura cobre campos aninhados (PM-85, SW v7.66)
- **Forma `sigv: 2`** (`client/js/sig-format.js`, [ADR-021 §2.6](./docs/adr/021-integridade-na-entrada-forma-assinada.md)): o texto assinado leva todas as chaves, ordenadas, em qualquer profundidade, então `photoTags` e `mediaRef` passam a ser cobertos. O `sigv` vai dentro do que é assinado; versão desconhecida não verifica.
- **Convivência:** o aparelho confere v1 e v2 desde já e passa a assinar v2 em **24/11/2026**, para quem ainda não atualizou não descartar os posts novos.
- **Marca de foto em post alheio v1** aparece como "não verificada".
- **Peso:** `sig-format.js` entrou no precache pago com a remoção de três funções que nada chamava (`renderPhotoTitleHtml`, `renderIgLikesLine`, `formatBlobSize`); o teto do PM-02 não mudou.

### Segurança: pipeline (PM-95)
- **CodeQL** (`.github/workflows/codeql.yml`): análise estática de actions, JS, Python e C# em todo PR, no `main` e toda segunda-feira (`security-extended`).
- **Dependabot** (`.github/dependabot.yml`): npm, imagem Docker do relay e GitHub Actions. O relay usa só a stdlib, então não há pip.
- **Actions fixadas por SHA de commit**, com a versão em comentário; o teste de inventário ([DEPENDENCIAS §5](./docs/DEPENDENCIAS.md)) quebra se aparecer action por tag.
- **Token do CI só lê** (`permissions: contents: read` no `ci.yml`).
- **Auditoria de segredos** (`scripts/secrets-audit.mjs`, com teste): pega chave PEM privada de qualquer tipo e JWK privada (o formato das chaves do Vox), em vez do grep de duas frases.
- **`.github/CODEOWNERS`** e ruleset do `main` com branch atualizada antes do merge (`strict`). Aprovação obrigatória fica para quando houver segunda pessoa revisora.

### Segurança: autorização no relay e no nó local (PM-94, SW v7.65)
- **Cofre com dono** ([ADR-027](./docs/adr/027-autorizacao-no-relay-dono-e-origem.md)): ao salvar, o aparelho manda uma prova derivada da Senha Soberana (`vault-crypto.deriveVaultOwnerToken`, outro sal, mesmo custo). O relay e o nó Windows guardam só o hash e passam a exigir a mesma prova para regravar ou revogar.
- **Caixa de DMs:** cada envelope leva uma chave de apagar cifrada para o destinatário (`del`). O relay só remove o envelope com ela (`X-Vox-Delete-Token`). Envelope de cliente antigo segue apagável até expirar.
- **Política de pedido** (`relay/request_guard.py`, `NodeRequestGuard` no nó Windows): `Host` de loopback (ou túnel liberado), escrita só das origens do app, `POST` só em `application/json` e limite de escritas por IP no relay Python. Novas variáveis: `VOX_RELAY_ALLOWED_HOSTS`, `VOX_RELAY_ALLOWED_ORIGINS`, `VOX_RELAY_WRITE_LIMIT_PER_MIN` ([kit do steward](./docs/operations/steward-relay-kit.md)).
- **Peso:** `server.py` não cresceu (731 → 722 linhas): o registro de seed saiu para `p2p_seeder.register_seed_request`; os cofres do nó Windows saíram para `VaultOwnerGuard.cs`.
- **Falta:** dono para memória central e relay cego (o conteúdo já é conferido por assinatura no aparelho).

### Segurança: trava das chaves depois do backup (PM-93 etapa 2, SW v7.64)
- **Depois do backup com a Senha Soberana** (cofre ou `.voxid` cifrado, senha de 12+ caracteres), assinatura e DM usam chaves **não exportáveis** no IndexedDB (`key-lock.js`, [ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md)). A cópia cifrada pelo aparelho sai do `localStorage`; a única cópia exportável é a cifrada pela senha.
- **Backup novo** pede a mesma senha. Restaurar pelo cofre ou pelo `.voxid` cifrado já volta travado.
- **Ordem segura:** a chave só troca depois de gravada e testada no IndexedDB e da cópia por senha salva. Se a chave travada some do aparelho, o app avisa e a conta volta pelo cofre com a senha.
- **Arquivo `.voxid`:** exportar e restaurar saíram de `local-account.js` (714 → 575 linhas) para `account-backup.js`.
- **Precache:** os 2 módulos novos foram pagos com a remoção do texto, das fotos e das respostas de demonstração por UF que ninguém lia (−20,6 KB); o teto do PM-02 desceu para 2.068.300 bytes.
- **Falta:** trocar a senha de uma conta travada; a carteira continua só cifrada pelo aparelho; sessão do Bluesky no PM-96.

### Segurança: chaves privadas cifradas no aparelho (PM-93 etapa 1, SW v7.63)
- **Chave do aparelho** ([ADR-026](./docs/adr/026-chaves-em-repouso-trava-depois-do-backup.md), `keystore.js`): uma chave AES-GCM-256 não exportável, guardada no IndexedDB, cifra as chaves privadas da conta, das contas extras, da DM e da carteira no `localStorage`. Elas só abrem na hora de assinar, abrir DM, publicar ou exportar backup.
- **Migração na abertura** (`key-at-rest.js`): o que estava em claro é cifrado; se o armazenamento mudar no meio, o item fica para a próxima abertura.
- **Sem troca de identidade:** se a chave do aparelho não abre, o app mostra erro em vez de gerar chave nova por cima. Navegador sem IndexedDB segue como antes.
- **Armazenamento persistente:** o app pede ao navegador para não apagar os dados sob pressão.
- **Falta (etapa 2):** assinatura com chave não exportável e trava depois do backup com a Senha Soberana.

### Segurança: cofre de recuperação v2 — só a Senha Soberana abre (PM-90, SW v7.62)
- **Cofre novo** ([ADR-025](./docs/adr/025-cofre-v2-so-a-senha-abre.md), `vault-crypto.js`): a chave sai só da Senha Soberana, por PBKDF2-SHA256 com 600 mil iterações e um sal aleatório por cofre, guardado no envelope. O endereço no servidor também sai da senha, pelo mesmo custo.
- **Login com Google ou Meta não abre mais o cofre.** Ele só enriquece o perfil e reencontra contas que já estão no aparelho. Em outro aparelho, a conta volta com a Senha Soberana, com o link ou QR de sincronização, ou com o arquivo de backup.
- **Cofres antigos** (`vault-legacy.js`):
  - **Na abertura:** o app revoga os cofres antigos que conhece e avisa uma vez para criar a Senha Soberana de novo.
  - **Cofre antigo de senha:** é cifrado de novo no formato v2 assim que abre.
  - **Servidores atualizados** (`relay/vault_store.py` e o nó Windows) só aceitam e servem o formato v2 ou a marca de revogado.
- **Link de sincronização:** leva o sal e as iterações do cofre v2; iterações fora da faixa são recusadas.
- **Relay:** o cofre saiu de `central_memory.py` para `relay/vault_store.py` (551 → 523 linhas).

### Segurança: servidor de memória por escolha e sincronização sem senha no link (PM-91, PM-92, SW v7.61)
- **O servidor de memória central só muda quando a pessoa aceita** (`memory-server-choice.js`).
  - **O que mudou:** link com `?memory=`, aviso de um aparelho conectado e endereço de túnel informado pelo servidor viram **sugestão**. Ao abrir, o app pergunta mostrando o domínio e explicando o que vai para lá.
  - **Recusa:** a sugestão recusada não volta.
  - **Endereço antigo:** o que uma versão anterior gravou sem perguntar vira sugestão, e o relay das DMs gravado junto com ele sai.
  - **Antes:** cada uma dessas fontes trocava o servidor sozinha, e tudo o que o aparelho gravava, inclusive o cofre, passava a ir para lá.
- **O link e o QR de sincronização não levam mais a Senha Soberana.**
  - **Na tela nova `#/sync`:** a senha é digitada no outro aparelho, e o cofre sai da barra de endereço e do histórico.
  - **Link antigo:** quem abre um link da versão anterior recebe o aviso para criar uma senha nova.
  - **Senha:** a Senha Soberana passa a exigir 12 caracteres.
- **Peso:** `images/cantina-gate.jpg` foi recomprimida (JPEG q85 progressivo, PSNR 39,6 dB, 143 → 119 KB) e pagou os dois módulos novos sem subir o teto do PM-02.

### Revisão de estado, arquitetura e DevSecOps (10/11, sem mudança no app)
- **[Revisão DevSecOps](./docs/audits/revisao-devsecops-2026-11-10.md):** a integridade do conteúdo na malha ficou sólida depois de #49 e PM-84…89, mas a custódia e a recuperação da identidade e a confiança no servidor de memória central têm **3 achados críticos e 3 altos**. Estão sob divulgação responsável e entram no ROADMAP como PM-90…PM-94; o PM-95 endurece o pipeline (CodeQL, Dependabot, actions por SHA, aprovação em arquivos de cripto).
- **Promessas corrigidas:** `SECURITY.md`, `IDENTITY.md` e ADR-014 diziam que o cofre era de "conhecimento zero" e que as chaves nunca ficavam em claro. Agora dizem o que o código faz hoje.
- THREAT-MODEL ganhou T20–T23.

### Correção: cartão de perfil não circula mais sem fim (PM-84, SW v7.60)
- **O aparelho só repassa o cartão de perfil que é novo para ele.** Antes, todo `PROFILE_CARD` que chegava pelo gossip era reaplicado e repassado, porque o "já visto" só olhava o banco de posts. Com duas abas da mesma origem ligadas aos mesmos pares, o cartão circulava sem fim: medimos 358 cartões/s e cerca de 1.100 requisições/s à memória central.
- **Como sabe que já viu:** guarda a versão de cada cartão (`editedAt` e assinatura), na memória da sessão e junto do cartão no diretório (`gossipCardAt`, `gossipCardSig`). Cartão de mesma versão ou mais velho não é reaplicado nem repassado. Mesma data com outra assinatura conta como outro cartão. O próprio cartão publicado já nasce marcado (`peers-gossip-profile.js`, `mesh-profile.js`).

### Correção: foto do composer volta a ir ao Arweave (PM-89, SW v7.59)
- **A mídia do post agora sobe:** com carteira conectada, o post com foto feito pelo composer ia ao Arweave sem a imagem e sem a tag `Media-Tx`. O código procurava a imagem num campo (`dataUrl`) que o blob separado do post não tem (ele usa `data`). O envio saiu do `inline-composer.js` para `topic-permaweb.js`, que lê o campo certo e tem teste.
- **Tipo da mídia certo:** `buildTags` punha sempre `Content-Type: application/json` e, para a mídia, acrescentava `image/webp` como segunda tag. Agora um `Content-Type` passado substitui o padrão; a foto vai com uma só tag, a do arquivo.
- **Peso do precache:** o módulo novo foi pago com a remoção de `buildUfDemoTopics` e das funções e textos que só ele usava (nada o chamava).

### Correção: foto chega também pela sincronização ao conectar (PM-88, SW v7.58)
- **A sincronização ao conectar (PM-80) leva a foto ao lado do post**, como a fofoca ao vivo (PM-87). Antes, quem recebia um post com foto por ela via o marcador "Mídia P2P". O blob sai do que está em memória ou, depois de recarregar, da mídia guardada no registro (`_media`); quem recebe só aceita o blob cujo conteúdo bate com `mediaHash`.
- **Teto de bytes:** até 128 KiB por foto e 2 MiB de fotos por conexão, gastos nos posts mais novos. Passou do teto, o post vai sem a foto (como antes). Aparelhos já sincronizados continuam trocando só o inventário.
- **Peso do precache:** pago com a remoção de código que nada chamava (`fetchIdentityLinkOnChain` e suas 2 consultas em `graphql.js`, `isInlineComposerActive`, `stripSignatureFields`, `buildSandboxedFrameSrc`, `JANONES_DEFAULT_TAGS`); saldo de +120 bytes, dentro do teto.

### Correção: foto enviada ao vivo chega a quem recebe (PM-87, SW v7.57)
- **Post com foto volta a bater com a assinatura:** o composer assinava o post com a imagem e mandava ao vivo a versão sem ela (`image: null` + `mediaRef`); quem recebia descartava. Agora a imagem sai **antes** da assinatura: o post assinado leva `mediaRef` e `mediaHash`, e a imagem fica no aparelho em `_media`, fora da forma assinada.
- **A imagem viaja ao lado do post:** a mensagem `GOSSIP` leva o blob junto (`blob`). Quem recebe só guarda, mostra e repassa o blob cujo conteúdo bate com `mediaHash`; sem blob, usa o que já tem guardado. `mediaHash` fica no primeiro nível porque a assinatura ainda não cobre chaves aninhadas (PM-85): trocar `mediaRef.hash` no caminho não troca a imagem.
- **Ainda sem imagem:** a sincronização ao conectar (PM-80) manda o post sem o blob; quem recebe por ela vê o marcador "Mídia P2P" até a imagem chegar pela memória central ou ao vivo. Resolvido no PM-88.
- **Peso do precache:** pago com a remoção de código que nada chamava (`readComposerImageFromFile` e `measureDataUrlImage` em `composer-media.js`; `formatGatewayHealthPill` e `exportGatewayDiagnostic` em `gateway-telemetry.js`); o precache ficou 370 bytes menor.

### Correção: memória central confere o que recebe (PM-86, SW v7.56)
- **O que volta da memória central passa pelas regras da malha** (`central-memory-hydrate.js`). Antes, posts e remoções do servidor eram gravados sem conferir nada; quem controlasse o servidor punha post em nome de outra pessoa, edição de comunidade, vínculo ou arquivamento falsos. Agora entra só o que tem assinatura válida de quem diz ser o autor e cujo autor não está bloqueado. Edição de comunidade segue a regra do PM-09. Post existente só é trocado pelo mesmo autor, e remoção só vale se for do autor do post.
- **Mídia fora da assinatura:** a imagem, o vídeo ou o áudio de um `mediaRef` que chega com o post fica no registro, fora da forma assinada (`_media`). Antes, era colada no post, que deixava de bater com a assinatura ao ser repassado. Blob cujo conteúdo não bate com o hash é descartado.
- **Peso do precache:** o módulo novo foi pago com a remoção de duas funções que nada chamava (`buildUfDemoListings` e `myInviteToken`) e com o corte de `attachMedia`, que ficou sem uso.
- **Defeito novo registrado (PM-87):** o post com foto publicado pelo app é assinado com a imagem e enviado ao vivo sem ela (`detachMedia` troca `image` por `mediaRef`), então quem recebe ao vivo descarta. A sincronização ao conectar e a memória central levam a forma assinada, com a imagem.

### Revisão de 10/11 (SW v7.55)
- **Aviso de privacidade corrigido:** o cartão do convite e a documentação diziam que o vínculo (PM-82) e o arquivamento por denúncia (PM-69) circulam "só na malha". Na verdade, todo item gravado no aparelho também vai à **memória central** (servidor de steward), embora nunca ao Arweave. O texto agora diz isso.
- **Defeitos registrados, ainda abertos:** memória central sem conferência de assinatura (PM-86), campos aninhados fora da assinatura (PM-85) e eco de cartão de perfil (PM-84). Estão no ROADMAP e no [modelo de ameaças](./docs/THREAT-MODEL.md) (T16–T19).

### Vínculo assinado (PM-82, SW v7.54)
- **Convite que vira vínculo:** o seu link "Convide amigos" (e o QR do seu perfil) leva um token. Quem abre vê "Fulano te convidou" e aceita. O app de quem convidou confirma sozinho ao receber o aceite, e o vínculo passa a ter a assinatura das duas pessoas. Para uma conta nova, quem convidou vira **padrinho**; é a base do moderador natural (PM-83, [spec](./docs/specs/moderador-natural-v0.md)).
- Cada convite aceita até 10 pessoas em 30 dias; depois, o link troca sozinho. O vínculo circula entre os aparelhos e pela memória central (servidor de steward), não vai ao Arweave, e o aceite avisa isso antes do botão.
- **Precache mais enxuto:** o `favicon.png` de 64 px saiu do que o app guarda no aparelho (a página só usa os de 16 e 32 px).

### Canal: comunidade em que só a moderação publica (PM-81, SW v7.53)
- **Mural de avisos sem objeto novo:** dono ou moderação transforma a comunidade em **canal** com um botão na página dela. A partir daí, só a moderação publica posts e todo mundo continua comentando. "Abrir para todos publicarem" desfaz.
- **A regra vale em cada aparelho:** post de quem não modera some da lista e o link direto mostra "Publicação fora do canal". O autor e a moderação ainda veem o post, com o selo "📣 Fora do canal". Quem não modera recebe um aviso ao tentar publicar, e o botão "Novo post" some. Não há exceção para posts antigos, porque a data é escrita por quem publica; voltar a "aberta" mostra tudo de novo ([spec](./docs/specs/canal-comunidade-v0.md)).
- **Logo mais leve:** a marca do topo (exibida em 28 px) era um PNG de 256 px; agora tem 128 px, 17 KB a menos no precache.

### Correção: post guardado volta a bater com a assinatura (SW v7.51)
- **Sincronização entre aparelhos destravada:** ao gravar um post, o app misturava cerca de 35 campos padrão no registro. O post guardado deixava de bater com a assinatura e quem recebia descartava. Na prática, só o que circulava ao vivo chegava a outro aparelho; o que vinha da sincronização ao conectar (PM-80), do envio completo e da memória central era jogado fora. O defeito existia desde o primeiro commit P2P.
- Agora o aparelho guarda o post exatamente como foi assinado, e os padrões só entram na hora de mostrar. Posts gravados antes da correção são recuperados no melhor esforço. Remoções guardam todos os campos assinados.

### Sincronização por inventário ao conectar (PM-80, SW v7.48)
- **Menos dados a cada conexão:** em vez de mandar às cegas até 128 posts, 64 remoções e 256 cartões de perfil, cada aparelho manda primeiro um inventário curto (hash do id e versão) e só pede o que falta. Com dois aparelhos já sincronizados, cai de ≈ 157 KB para ≈ 7 KB por sentido, o que poupa o teto de 5 MB do 4G. Aparelho com versão antiga do app recebe o envio completo depois de 8 s.
- A sincronização saiu do `peers.js` para `peer-sync.js` ([spec](./docs/specs/sync-inventario-v0.md)); é ali que a mochila de DMs (PM-79) vai entrar.
- **Ícone mais leve:** o `icon.svg` embutia a mesma imagem duas vezes (`href` e `xlink:href`); ficou só a primeira, 18 KB a menos no que o app guarda no aparelho. O teto de peso do precache desceu junto.

### Caixa de saída das DMs (PM-78, SW v7.47)
- **Mensagem que não saiu não se perde mais:** sem conexão direta e sem relay, a DM (e a denúncia do PM-69) fica na caixa de saída do aparelho. Com o Vox aberto, o app tenta de novo sozinho: a cada 20 s, ao voltar a internet e ao abrir, e no relay com espera crescente (1 a 30 min). Antes, nada reenviava, embora o aviso dissesse que a mensagem seria entregue.
- **No fio:** "⏳ Aguardando" enquanto espera; depois de 7 dias, ou se a caixa encher (100 mensagens ou 2 MB), "⚠ Não entregue". O aviso e a tela da denúncia dizem que o reenvio só acontece com o app aberto.
- **Spec da mochila de DMs** ([mochila-dm-v0.md](./docs/specs/mochila-dm-v0.md)): o próximo passo (PM-79) é outros aparelhos conectados levarem envelopes cegos até quem não estava online.

### Uma denúncia arquiva até a revisão (PM-69, SW v7.46)
- **Denúncia chega à moderação sozinha:** ao denunciar um post de comunidade, o app manda à moderação, por mensagem cifrada, a denúncia **assinada pela conta** de quem denunciou (a identidade não vai para a malha). Se não der para entregar, o app diz isso e oferece mandar pela conversa.
- **O aparelho de quem modera arquiva para todos** ao receber, se quem denunciou é membro, tem menos de 3 denúncias pendentes e não teve as 3 últimas rejeitadas, e se o post não é de alguém da moderação. Senão, a denúncia fica para decisão manual, com o motivo. O arquivamento circula pela malha e pela memória central (servidor de steward); não vai ao Arweave.
- **Autor e moderação veem "⏳ Em revisão"** com o prazo de 48 h; os outros não veem o post, e o link direto mostra "Publicação arquivada". Quem modera decide no tópico: **Volta para todos** ou **Mantém arquivado**.

### Mídia v2 retrô e medição (PM-70, sem mudança no app)
- **Carrossel na spec:** até 4 fotos, 4 áudios (4 min, cada um com imagem opcional) ou 4 clipes de vídeo (40 s), do mesmo tipo, com playback sem emenda (PM-77).
- **Spec revista para estética retrô** ([mídia v2](./docs/specs/midia-v2.md)): imagem AVIF **q70 em 960×540/540×960**, áudio **Opus 32 kbps**, vídeo **até 480p a 24 fps** (H.264 Q28), sempre em pedaços de até 99.999 bytes.
- Bancada `tools/media-bench/` (só desenvolvimento) e [medição no desktop](./docs/research/medicao-midia-v2-pm70-2026-11.md) com 29 imagens e 2 vídeos reais: AVIF 540p q70 coube em todas sem degrau (mediana de 43 KiB) e teve qualidade maior que o WebP 0,78 em todas; vídeo 480p de 10 s entre 0,5 e 1,0 MiB; Opus 32 kbps = 237 KiB/min. Achados para o PM-71: codificador AVIF de 3,4 MB, CSP com `'wasm-unsafe-eval'` e `wasm-feature-detect` quebrado no Chrome 152. `@jsquash/avif` 2.1.1 entra só como dependência de desenvolvimento.

### Piloto G1: decisões e primeiras peças (SW v7.45)
- **Piloto só 18+ (PM-67, [ADR-020](./docs/adr/020-postura-de-operacao-do-piloto-g1.md)):** o pacto de entrada tem a caixa "tenho 18 anos ou mais"; sem ela, os botões ficam desativados. A confirmação é autodeclarada e fica só no aparelho. Quem aceitou o pacto antes vê o pacto uma vez mais.
- **"Algo errado aqui?" (PM-68):** link no rodapé de todas as telas para apontar, sobre o app, "não funcionou", "não entendi" ou "não faz o que diz". Guarda só o nome da tela, o tipo, a versão e uma nota opcional, no aparelho; "Compartilhar apontamentos" manda o resumo para o grupo do piloto.
- **Escrever exige o pacto completo:** curtir, responder, postar e votar ficam bloqueados até concluir o pacto com a confirmação de 18+ (as guardas do "ler antes de entrar" passam a valer desde a abertura do app); o próprio fluxo de entrada e o apontamento não são bloqueados.
- **"Apagar conta local"** também apaga o pacto, a confirmação de 18+ e os apontamentos guardados.
- **Compartilhar** (tópico, comunidade, convite, oferta e apontamentos) passa por um helper só (`shareOrCopy` em `share.js`).
- **Rodapé visível no celular:** a barra de abas fixa cobria o rodapé inteiro (inclusive "Teste aberto"); agora ele tem espaço embaixo.
- **Decisões registradas:** [ADR-019](./docs/adr/019-esquecer-por-padrao-e-memoria-civica.md) (esquecer por padrão; memória cívica por regra, moderador ou votação), [ADR-020](./docs/adr/020-postura-de-operacao-do-piloto-g1.md) (mantenedor como operador, voluntários só em baixo risco, 18+, uma denúncia arquiva), [mídia v2](./docs/specs/midia-v2.md), [replicação por grau](./docs/specs/replicacao-por-grau-v0.md) e [três trabalhos voluntários](./docs/product/voluntariado-tres-trabalhos.md). Itens PM-67…PM-76 no ROADMAP.

### Segurança e financiamento (SW v7.43)
- **PM-11 `arweave` vendorizado:** a biblioteca deixa de vir do `esm.sh` em tempo de execução. O bundle autocontido 1.15.7 (o mesmo arquivo, com o mesmo sha384 já anotado no inventário) fica em `client/vendor/` e é carregado por `client/js/arweave-lib.js`, usado por `upload.js` e `wallet.js`. `https://esm.sh` saiu do `script-src` da CSP; `tests/arweave-vendor.test.js` confere o hash, que o bundle não importa nada de fora e que ele assina e verifica uma transação sem rede. Fecha o LAN-20.
- **PM-42 rascunho da proposta ao NLnet Restack** (prazo 03/01/2027): [proposta-nlnet-restack-2027.md](./docs/strategy/proposta-nlnet-restack-2027.md), com os riscos que decidem a proposta (dimensão europeia eliminatória, política de IA generativa), checklist de submissão, respostas em inglês dentro dos limites do formulário e orçamento por marcos.

### Qualidade (Perfil Canônico v3.2)
- **`max-params` zerado e promovido a erro:** as 17 funções com mais de 5 parâmetros passaram a receber um objeto de opções com nomes (`f({ a, b })`), sem mudar comportamento; o 5º parâmetro de `renderProfile` (`_dmPubStr`) não era usado e saiu das 17 chamadas. **PM-62 completo:** `.nvmrc` (22), `engines.node >=22` e `.python-version` (3.12).
- **Limites que quebram o CI:** no `client/`, função com mais de 30 linhas, aninhamento > 4, complexidade > 15, `==` e variável sem uso são erro de ESLint (antes, só aviso e passo com `continue-on-error`). No Python, Ruff `F` (pyflakes) e `C901` (complexidade > 15) em `relay/`, `scripts/` e `packaging/`, com versão fixa (0.17.4); antes o ruff era opcional.
- **Dívida medida e informada:** 18 funções JS com mais de 5 parâmetros, 27 arquivos com mais de 350 linhas, 25 testes com mais de 45 linhas (`npm run lint:all`), 7 funções Python com mais de 30 comandos. `docs/HARDENING.md` mostra, regra a regra, o que bloqueia de fato, a dívida e o alvo; complexidade cognitiva e CBO/LCOM aparecem como **não medidos**.
- **Bug achado pelo pyflakes:** `save_vault()` da memória central chamava `_atomic_write`, que não existe; salvar cofre no relay estourava `NameError`. Corrigido, com teste que falha no código antigo. O `ruff --fix` também apagava o import que verifica o WebKit no cliente Linux; restaurado com `noqa`.
- **Evidência e auditoria:** [docs/process/qualidade-e-evidencia.md](./docs/process/qualidade-e-evidencia.md) (PASS / FAIL / NOT RUN / BLOCKED, falso verde, determinismo, papéis sem modelo fixo), auditor só-leitura em `.agents/agents/vox-auditor.md`, template de PR com tabela de evidência, `CLAUDE.md` e `npm run validate`.

### Distribuição (PR #33)
- **PM-45 binários pelo CI:** `Vox.exe`, `VoxPopuli.exe`, `vox.apk` e `vox-populi.apk` saem do workflow `release-binarios.yml` (runner do GitHub, a cada tag `v*`), com `SHA256SUMS` e atestação de origem (`gh attestation verify <arquivo> --repo yurikayel/vox`). A página de download e o README apontam para `releases/latest/download/…`, e os binários saíram do git (eram compilados numa máquina pessoal). PR que mexe em `android/` ou `packaging/` compila os quatro para provar que o build funciona. `android/build.ps1` aceita `VOX_JAVA_HOME` e `ANDROID_HOME`.

### Planejamento (09/11, tarde)
- [Backlog de próximas melhorias](./docs/brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md) §4: adendo com PM-47…PM-64. As 7 recomendações da pesquisa de ancoragem e churn viram itens; achados novos: `ar-io.dev` não indexa o Vox mas está no catálogo de gateways, e links diretos abrem atrás do portão de boas-vindas.

### Comunidades (SW v7.40, PR #32)
- **PM-09 foto e título só do dono:** um `community_update` só vale quando quem assina é o dono da comunidade ou um moderador listado, e só muda foto, título, descrição e categoria. Antes, qualquer chave trocava a foto e o título de qualquer comunidade, e o update inteiro (com `id` e `author`) era espalhado sobre o registro. O gossip não grava nem repassa update de quem não pode. Corrigidos junto: a atualização **mais antiga** vencia (a lista vem do mais novo para o mais velho), e um segundo post `community` com o mesmo `communityId` e `ts` antigo tomava a comunidade. Agora só o post `c_<communityId>` define o dono (`community-updates.js`).
- O botão "Alterar foto" segue a mesma regra, com a chave local (`vx_…`) que assina o update. Em comunidade publicada só no Arweave, cujo dono é um endereço de carteira, o botão some: não há como provar que a chave local é dessa carteira.

### Rede, peso e operação (SW v7.42)
- **PM-54 ler antes de entrar:** link direto para post, comunidade, perfil, tag ou proposta abre o conteúdo na hora, com uma faixa "Entrar no Vox". O portão de boas-vindas e o pacto só aparecem na primeira ação que escreve (curtir, responder, votar, entrar na comunidade). Antes, quem recebia um link no WhatsApp via o portão em tela cheia antes do conteúdo.
- **PM-52 4G só por opção:** no 4G, o aparelho só repassa dados se a pessoa desligar "apenas no Wi-Fi", e até um teto próprio (padrão 5 MB/dia, 1–50). O Wi-Fi continua com 50 MB/dia. O painel mostra quanto foi no 4G.
- **PM-04 órfãos fora do cache:** os 22 módulos que nenhuma tela carrega saíram do precache (~116 KB a menos na instalação) e ficam listados em `UNPLUGGED_MODULES`. Um teste segue os imports a partir dos pontos de entrada e quebra se um módulo morto voltar ao precache.
- **PM-02 orçamento de peso:** teste que soma o precache (2.038.578 bytes em 182 arquivos) com teto de 2.080.000 bytes.
- **PM-61 alerta vira issue:** falha do keepalive do Render, do teste de fumaça Nostr, da rotina mensal de dependências ou do deploy do shell B abre uma issue `alerta-automatico` (uma por tipo enquanto estiver aberta). O keepalive passou a contar falhas: antes terminava verde mesmo com o Render fora.

### Rede (SW v7.41)
- **PM-50 gateways:** o `ar-io.dev` saiu das testemunhas GraphQL (devolve 0 itens `vox-brasil`, medido em 08 e 09/11) e ficou só para leitura `raw`. `graphqlGateways()` filtra o catálogo, então um gateway que não indexa o Vox não conta mais como "omissão" na corroboração. Testemunhas GraphQL: turbo-gateway, arweave.net e ardrive.net.
- **Testes de binário olham só o que o git rastreia:** o LAN-20 e o PM-45 varriam o disco e falhavam em qualquer máquina com build local ignorado (ex.: APK em `android/build/`); agora usam `git ls-files`, com varredura do disco só sem git.
- **PM-17 reconexão Nostr:** relay que cai volta sozinho com espera crescente (1 s, 2 s, 4 s… até 60 s); depois de 3 tentativas sem abrir, a vaga troca para outro relay do pool. Antes, cada relay abria uma vez e, se caísse, o caminho paralelo morria em silêncio. Sockets fechados saem da lista.

### Documentação (PR #31)
- **Revisão de estado de 09/11 e backlog de próximas melhorias:** [brainstorm PM-01…PM-46](./docs/brainstorms/brainstorm-backlog-proximas-melhorias-2026-11.md) com o estado medido (peso da instalação, módulos órfãos, telas sem teste, chave em `localStorage`, `community_update` sem conferência de autor) e a ordem sugerida das próximas 10.
- **LAN-20, binários:** [DEPENDENCIAS.md §6](./docs/DEPENDENCIAS.md#6-binários-no-repositório) lista os `.exe`, `.apk` e DLLs do repositório com SHA-256, e o teste de inventário quebra se um binário mudar sem atualizar a tabela. O `android/README.md` publicava um hash e um tamanho de outro build (corrigidos).
- **NET-01 fechado com evidência:** o shell B (`vox-9df.pages.dev`) serve a v7.39, igual ao A; a tabela de espelhos estava em v7.16 e o runbook dizia que push não aciona o B (aciona).

### Rede e anti-spam (SW v7.39, PR #30)
- **LAN-21 sinalização caída:** quando o servidor WebSocket desistiu de todos os nós e nenhum relay Nostr está aberto por mais de 5 s, o app avisa que a troca com outros aparelhos parou e que ler e escrever continuam; avisa também quando volta. Em `#/settings/network`, "Conectando a aparelhos próximos…" deixa de aparecer para sempre (`honest-errors.js` → `createSignalingHealth`, `nostr-transport.js` conta relays abertos).
- **LAN-14 quarentena de chave nova e PoW leve:** ao criar uma comunidade, dá para pedir quarentena; posts de chave vista há menos de 24 h ficam recolhidos ("Ver mesmo assim"), a menos que tragam prova de trabalho de 14 bits, que o app calcula sozinho ao publicar (~1 s). Moderação vê tudo, com selo "Chave nova" (`new-key-guard.js`).

### Segurança
- **LAN-20 inventário de dependências:** [docs/DEPENDENCIAS.md](./docs/DEPENDENCIAS.md) lista o código de terceiros (CDN, SDKs, npm, contêineres, Actions); `tests/dependencias-inventory.test.js` quebra o CI se algo novo entrar sem linha; `deps-mensal.yml` roda `npm audit` e confere o hash do bundle do `arweave` todo mês. Achado: a entrada `esm.sh/arweave@1.15.7` puxa dependências com `^` e varia por User-Agent; vendorizar o bundle fica pendente.

### Documentação
- Revisão de estado de 08/11/2026: README, ROADMAP, FEATURES, INFRA-CUSTOS, THREAT-MODEL, TESTES, índice de `docs/` e DEV §27 alinhados ao `main` depois dos PRs #17–#28. ROADMAP com linhas de tabela consertadas, itens fechados movidos para *Concluído* e parciais marcados com 🚧. README sem a afirmação "PWA < 50 KB" (o `client/js` tem ~1,9 MB). Release line regenerada.

### Qualidade
- `npm test` travava localmente: o teste "dois pares" do `nostr-transport` esperava tempos fixos, falhava com a suíte inteira no mesmo processo e deixava o `setInterval` do hello vivo. Agora espera a condição e para os transportes no `finally`; a suíte roda em segundos.
### Correção: limpeza periódica de expirados e teto padrão em `/tx` (lacunas 5 e 7)
- `relay/purge_schedule.py`: thread daemon varre inbox (72 h) e canal cego (7 d) a cada `VOX_RELAY_PURGE_INTERVAL_SECONDS` (900; `0` desliga), pasta a pasta, parando no desligamento. `VOX_RELAY_MAX_CACHE_MB` passa a ter padrão 512 (`0` = sem teto) e `/tx` recusa com `413` resposta acima de `VOX_RELAY_MAX_TX_MB` (32) sem lê-la inteira. Testes: `relay/test_purge_schedule.py` (6). Sem bump de SW.

## SW v7.33 → v7.38 — 2026-11-08 (PRs #13–#28)

### Rede, privacidade e resiliência
- **Nó leve por padrão, modo Apoiador por opção** (PR #21): todo aparelho ajuda a malha com 50 MB/dia e 25 MB em disco; o botão "Seja um apoiador da rede" sobe para 500 MB/dia e 250 MB, só no Wi-Fi (`supporter-mode.js`).
- **REV-24 modo eleitoral** (PR #24): de 16/08 a 31/10 de ano par, ou com `electoralMode` em `flags.json`, some a linha "Sugestões cívicas" (`electoral-period.js`).
- **LAN-19 privacidade de IP** (PR #25): aviso de que outros aparelhos veem o IP e opção "Esconder meu IP" (`iceTransportPolicy: relay`). Só funciona quando houver TURN (REV-10).
- **LAN-27 leitura resiliente e LAN-21 erros honestos** (PR #26): 4 gateways com tempo limite de 8 s; `honest-errors.js` explica cota, 402, 429, offline, timeout, gateways fora e DM sem relay.
- **LAN-14 limite de taxa** (PR #27): 20 posts por chave a cada 10 min no gossip; o excesso é descartado e não é repassado (`rate-limit.js`).

### Marca e diretório
- **Logo do megafone** como marca do topo, favicon, ícones do app e avatar oficial (PR #20); avatares em squircle sem contorno.
- Diretório: pares só com a chave `vx_…` (sem nome escolhido) saem da lista; a busca pela chave ainda os acha (PR #20).

### Qualidade
- **REV-03** `tests/release-metadata-drift.test.js`; **REV-06** os 35 hotlinks do Unsplash viraram imagens locais; **LAN-20 (parcial)** `npm audit --audit-level=high` no CI (PR #22).
- Teste T11 do `gossip-retract` sem corrida de milissegundo no `editedAt` (PR #28).

### Operação
- [Runbook de incidentes](./docs/operations/runbook-incidentes.md) (LAN-24) e [plano de lançamento em ondas](./docs/strategy/plano-lancamento-ondas.md) (LAN-34), ambos rascunho (PR #28).
- ROADMAP: itens já entregues no PR #17 marcados como feitos (PR #23).

### Organização do repositório
- Pacote de mockups `stitch_vox_civic_network_interface/` removido (já aplicado; ADR-016). A especificação foi para [docs/design/sovereign-agora.md](./docs/design/sovereign-agora.md).
- Raiz enxuta: `COMPLIANCE-BR.md` → `docs/legal/`, `IDENTITY.md` → `docs/`, `POSITIONING.md` → `docs/product/`, `LESSONS.md` → `docs/process/`; `Dockerfile` duplicado e `glitch.json` removidos; `railway.json`/`zbpack.json` → `relay/deploy/`; `.editorconfig` novo.
- `tools/` dividido: manutenção do repo em `scripts/`, instaladores em `packaging/`, ferramentas de uso em `tools/` (cada pasta com README).
- `docs/` organizado em pastas por tipo (`specs/`, `operations/`, `strategy/`, `pilot/`, `research/`, `brainstorms/`, `audits/`, `product/`, `process/`, `legal/`, `archive/`). Links internos e caminhos em código, testes e workflows reescritos; links do download apontavam para a branch inexistente `develop` e agora vão para `main`.

### Rumo à rede pública — G1 (PR #17)
- **LAN-10 demonstração isolada:** os 27 perfis fictícios (e suas chaves Pix) só aparecem com o modo demonstração ligado, com faixa fixa; o aviso de falha de rede deixou de dizer "conteúdo de exemplo".
- **REV-13 Pix:** quem cadastra a chave é avisado de que o nome civil (DICT) aparece com qualquer chave; quem paga é lembrado de conferir o nome no banco.
- **REV-19 teste de fumaça Nostr:** `scripts/nostr-smoke.mjs` + workflow semanal; `eden.nostr.land` (pago) saiu do pool, `offchain.pub` entrou.
- **REV-09 sinalização por Nostr:** `nostr-transport.js` roda em paralelo ao Render; só um peerId aleatório vai em claro, o resto é cifrado (ECDH secp256k1 + AES-GCM). Assinatura BIP-340 em JS puro (`nostr-event.js`, vetores oficiais nos testes).
- **LAN-08 kill-switch:** `config/flags.json` + `feature-flags.js` (sem cache do SW).
- **LAN-11 aviso de permanência:** antes de gravar no Arweave, a pessoa escolhe "permanente" ou "só na malha".
- **LAN-12 denunciar:** o botão deixou de ser de mentira; motivos, canais oficiais (SaferNet, Disque 100, Ligue 180, 190) e DM cifrada ao moderador.
- **LAN-16 CSP:** meta CSP sem script inline + `client/_headers` (frame-ancestors, nosniff, Referrer/Permissions-Policy); handlers inline viraram delegação (`dom-delegates.js`).
- **Docs:** [THREAT-MODEL.md](./docs/THREAT-MODEL.md) (LAN-15, rascunho) e critério de go do beta no go/no-go (LAN-28).

### Planejamento
- [docs/strategy/backlog-lancamento-publico-2026-11.md](./docs/strategy/backlog-lancamento-publico-2026-11.md): brainstorm + backlog completo até a rede pública (critérios, portões G1 piloto → G2 beta → G3 público, LAN-01 a LAN-36). ROADMAP ganhou a seção "Rumo à rede pública".

### Pesquisa
- [docs/research/pesquisa-complementar-2026-11.md](./docs/research/pesquisa-complementar-2026-11.md): Prompt 4 respondido por busca direta e pelo Gemini (avaliado na §5) + brainstorm B1–B12. Corrige a síntese: a tese do STF trata de marketplaces (item 7), a chave Pix aleatória não esconde o nome do DICT e o IPv6 já passa de 80% nas grandes operadoras móveis. Novos REV-18 a REV-24; REV-12 e REV-13 revistos; REV-17 concluído.
- [docs/research/pesquisa-deep-research-2026-11.md](./docs/research/pesquisa-deep-research-2026-11.md): síntese verificada dos 3 relatórios do Gemini Deep Research. Confirmados: cota do Turbo vitalícia por carteira/sub-rede, Credit Sharing, Durable Objects no Workers Free, TURN da Cloudflare com 1.000 GB grátis, Docker Spaces do HF pagos, Briar em manutenção. Novos itens REV-09 a REV-16 no ROADMAP (F1 vira P0, F6 redesenhada, jurídico pós-STF, aviso nos Pix Zaps, proteção de chave no iOS).

### Decisões
- [ADR-018](./docs/adr/018-selo-govbr-via-parceiro-publico.md) (proposed): o gov.br não será login (credencial de produção exige domínio oficial de governo; o CPF é o `sub`). A proposta é um selo opcional de nível prata/ouro emitido por parceiro público, com pseudônimo HMAC e sem o CPF chegar ao Vox. Rastreado como REV-08 no ROADMAP.

### Documentação
- Revisão de estado de nov/2026: novos [CONTRIBUTING.md](./CONTRIBUTING.md), [docs/FEATURES.md](./docs/FEATURES.md), [docs/INFRA-CUSTOS.md](./docs/INFRA-CUSTOS.md), [docs/specs/relay-api.md](./docs/specs/relay-api.md), [docs/TESTES.md](./docs/TESTES.md), [docs/ROADMAP.md](./docs/ROADMAP.md), [índice de ADRs](./docs/adr/README.md) e [ADR-017](./docs/adr/017-consolidacao-roadmap-unico.md) (ROADMAP único substitui o dossiê N=25 como checklist vivo).
- Números de testes e `CACHE_NAME` passam a viver só no README e no `release-metadata.json`.
- Corrigida a premissa de "upload grátis para sempre": o Turbo expõe uma cota grátis (~10 MiB por carteira/IP) em `upload.ardrive.io/info`. INFRA-CUSTOS, FEATURES, ROADMAP (REV-07) e a feature F5 foram revisados.
- Brainstorm de 10 features de autossustento a custo ~zero + 3 prompts de pesquisa: [docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md](./docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md).

## SW v7.32 — 2026-11-07

### Marca
- Favicon e avatar oficial com o logo **VOX tricolor**; avatares em squircle em toda a UI.

## SW v7.24 → v7.31 — 2026-11-07 (PRs #1–#11)

### Adicionado
- **Design system Sovereign Agora** (PR #1, [ADR-016](./docs/adr/016-design-system-sovereign-agora-e-democracia-direta.md)): paleta `--sa-*`, Domine + Work Sans, variante clara, wordmark "VOX · Ágora Soberana", círculos territoriais sem contagem fictícia.
- **Feed Social e Cívico** (PR #2): `#/` e `#/?feed=civic`; classificador `civic-post.js`; posicionamento/enquete com voto assinado `civic-vote` (1 por pessoa).
- **Mensagens:** contador de não lidas no menu e no topo (PR #3).
- **Compositor em 5 etapas** (PR #6) e **onboarding em etapas** com pacto como etapa final (PR #7).
- **Proposta, comunidade e oferta da Feira em etapas**; **enquete** com construtor de 2–6 opções; **voto com confirmação**; assistentes de **rede**, **Senha Soberana** e **carteira** (PR #8).
- **Contas vinculadas por login** (PRs #9, #10): Bluesky OAuth no navegador, Facebook (identidade), X/Threads/GitHub/TikTok/Instagram via `/oauth/exchange`; tela simplificada com uma linha por rede; importar nome e foto no onboarding.
- **Postar estilo Instagram** (PR #11): escolha Social ou Cívico, mídias completas em Social, painel do anexo organizado.

### Alterado
- Feed sem cartões, sem fundo e sem letterbox; hover só com filete dourado (PR #5).

### Corrigido
- Contas vinculadas: sem handle inventado e sem verificação falsa (PR #9).
- Pattern do slug de comunidade inválido no modo `v` do Chrome.

### Infra
- **Deno Deploy pausado** (organização suspensa): removido de `client/config/signaling.json` e do keepalive; sinalização pública = Render + local (PR #4).

## SW v7.16 → v7.20 — 2026-11-05/06

### Adicionado
- **Cofre zero-knowledge** e recuperação cross-device via Google `sub`, Meta e Senha Soberana; sync por QR `#/sync` ([ADR-014](./docs/adr/014-zero-knowledge-vault-recuperacao-soberana.md)).
- **Memória central Modo 3** (`central_memory.py`, `VoxPopuli-ZeroMemory.exe`) com túnel Cloudflare e beacon de descoberta.
- Diretório unificado de pessoas (`#/people`) e entrada direta de nome no onboarding.
- Moderação de fórum: fixar, trancar, busca e ordenação de tópicos.
- **AGPL-3.0-or-later** ([ADR-015](./docs/adr/015-licenciamento-agplv3-e-governanca-de-bem-comum.md)); seeder P2P e descoberta `VOX-PEER-v1`.
- Cockpit POSSE ("Postar e Ecoar"), canal `#/revolucao`, Voxels no perfil ([ADR-013](./docs/adr/013-sistema-voxels-e-conquistas-civicas.md)).
- Runtime Webxdc em sandbox, relay cego e cintura fina `vox-identity` ([ADR-012](./docs/adr/012-soberania-digital-cintura-fina-cartuchos-webxdc.md)).
- Página de downloads e executáveis nativos (Windows 967 KiB, Android micro-APK, Linux, macOS).

## Out/2026 — fundação (SW v5.x → v7.15)

- Fases 1–5: leitura GraphQL multi-gateway, autoria ANS-104 via Turbo, malha WebRTC com gossip, DMs E2E com inbox TTL, handles `@`.
- Comunidades estilo Orkut, governança com diff e voto assinado, Feira, Pix Zaps (BR Code offline), Open Frames, POSSE.
- Hardening: zero violações de complexidade ([ADR-007](./docs/adr/007-zero-complexity-monolith-decomposition.md)), paridade de precache do SW.
- Vox Populi (nó dedicado: Linux/Pi, Android, Windows) — [ADR-008](./docs/adr/008-vox-populi-community-node-architecture.md), [ADR-011](./docs/adr/011-taxonomia-tripartite-produtos-vox.md).

Histórico detalhado sprint a sprint: [client/DEV.md](./client/DEV.md).
