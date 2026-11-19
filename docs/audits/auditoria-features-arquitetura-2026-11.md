# Auditoria — Features, arquitetura e narrativa pública (nov/2026)

> **Status:** auditoria (não substitui o [ROADMAP](../ROADMAP.md)) · **Owner:** mantenedor · **Revisado:** 2026-11-19
> **Escopo:** Fases 1–3 do [prompt de auditoria e MVP técnico](../process/prompt-claude-auditoria-mvp-tecnico-2026-11.md). Base medida: `origin/develop` `e994a1b` (cópia limpa) e `origin/main` `bda1dd4` (release #262), com PR #284 (`667fcda`) e PR #285 (`197ef98`, fase 1) já integrados em `develop`. Sem código de produto, sem ops INF-01…04, sem piloto humano.

---

## Sumário executivo

| Fase | Escopo | Evidência principal | Resultado | Destino |
|---|---|---|---|---|
| **Fase 1** | `README.md` × `release-metadata.json` × política `REV-07` | 31 alegações verificadas; `1981 JS + 320 Py = 2301` (`2276 passing · 9 skipped · 16 todo`); `CACHE_NAME` `v7.143` | 3 enganosas (Arweave badge, Android 5.0+, l.268), 8 defasadas | **Resolvido no PR #285** (`197ef98`) |
| **Fase 2** | Camadas, ciclos, portas `identity/` e `vault/`, precache | `audit:layers` **PASS** (0 violações, 1 ciclo/3 módulos); `audit:complexity` **PASS** (`304` arq., 0 violações); precache **2,73 MB / 302 arq.** | 0 violações de camada; alto fan-out em `app/` (`screens-community` 41) e 93 arq. com `localStorage`/`sessionStorage`; `route.js` 100% estático bloqueia `PM-01` | Proposta em 5 passos + insumos para Spec MVP (PR #3) |
| **Fase 3** | `FEATURES.md` (89 linhas) × rotas × código × testes | 100% `no ar`, 100% `lab`, 100% `não plugado`; 0 specs órfãs; 100% dos `9 skip + 16 todo` justificados | 2 contradições de status (`idb-store`, `node-health-*`), 2 features `no ar` ausentes (ADR-037 malha, `tab-sync`), 1 teste inexistente citado (`signed-verify`), 18 paths pré-ADR-035 | **Correções doc neste PR (#2)**; gaps de código em `lobby.md` |

---

## Fase 1 — README e narrativa pública vs fatos (consolidado)

Medido em cópia limpa de `origin/develop` `e994a1b` (19/11/2026) antes do PR #285:
- `node --test tests/*.test.js` → exit `0`, `1981 tests` (`1957 pass`, `8 skipped`, `16 todo`, `27,9 s`).
- `python -m unittest discover -s relay -p "test_*.py"` → exit `0`, `320 tests` (`319 pass`, `1 skipped`, `36,6 s`).
- Total pelo método `scripts/release_line.py`: **2301** (`2276 passing · 9 skipped · 16 todo`).
- `CACHE_NAME` em [client/sw.js](../../client/sw.js): `vox-pwa-v7.143-real-network-audio-video-upload` (idêntico em `main` e `develop`).

### Vereditos principais (31 alegações auditadas → 18 correções entregues no PR #285)

| Alegação original no README | Evidência verificada | Veredito | Ação (PR #285) |
|---|---|---|---|
| Selo `Storage: Arweave Permaweb` | `arweaveUpload: false` (`flags.json` / `feature-flags.js`, REV-07) | **Enganoso** | Trocado para `Preservação: rede de seguidores` (ADR-019) |
| Android `(5.0+)` | `android/AndroidManifest*.xml`: `minSdkVersion="24"` = **Android 7.0** | **Enganoso** | Corrigido para `(7.0+)` |
| l.268 "Toda postagem pública no permaweb é permanente" | Contraria l.14/122 (REV-07 pausa escrita no Arweave) | **Enganoso** | Qualificado para histórico gravado + replicação por seguidores |
| Selo `tests-2206 passing`, SHA `315e334` | `315e334` estava 47 commits atrás; `develop` tem `2301` (`2276` verdes) | **Defasado** | `release-metadata.json` regerado (`667fcda`); selo explícito `2276 passing · 9 skipped · 16 todo` + nota `develop` vs `main` |
| Binários com tamanhos fixos sem versão da Release | Última Release = `v7.40` (09/11/2026); SW atual = `v7.143`; `VoxPopuli-ZeroMemory.exe` só build local | **Defasado / ambíguo** | Removidos tamanhos fixos, explicitada `v7.40` e build local de `ZeroMemory` |
| Lista manual de ADRs 001–025 (sem status `proposed`) | `docs/adr/` tem **39 ADRs** (001–039) com índice próprio | **Defasado** | Substituído por destaques + ponteiro para `docs/adr/README.md` |
| PM-83 "a fazer" e `branch → PR para main` | PM-83 existe em lab (`vox.lab.moderador`, SW v7.74); `CONTRIBUTING.md` exige PR para `develop` | **Defasado** | Corrigidos; pendência `THREAT-MODEL.md` T19 vai no PR #4 |
| `CACHE_NAME`, workflow `release-binarios.yml`, gateways (4/3 GraphQL, 8 s), Nostr/Render, Webxdc lab, plano único = `ROADMAP.md` | Conferidos contra `sw.js`, `gateways.json`, `graphql.js`, `ci` | **OK** | Mantidos + link para [analise-repositorio-vox-2026-11.md](../strategy/analise-repositorio-vox-2026-11.md) |

---

## Fase 2 — Arquitetura e modularidade

### 2.1 Evidência empírica (AST via `espree` + [scripts/layers-lib.mjs](../../scripts/layers-lib.mjs))

| Verificação | Comando | Exit | Resultado literal | Status |
|---|---|---:|---|---|
| Camadas e ciclos | `npm run audit:layers` | `0` | `0 import(s) proibido(s)` (`layers-debt.json` vazio) · `1 componente(s), 3 módulo(s) em ciclo` | **PASS** |
| Complexidade | `npm run audit:complexity` | `0` | `filesScanned: 304`, `violationCount: 0` ([HARDENING](../HARDENING.md)) | **PASS** |
| Precache / alcançabilidade | `node --test tests/shell-reachability.test.js` | `0` | `2/2 pass` (`PM-04`, `PM-02`) · **2.727.107 bytes (~2,60 MiB) em 302 arquivos** | **PASS** |
| Inventário AST `client/js/` | varredura `espree` | `0` | **304 módulos** (`app`: 70, `render`: 46, `base`: 156, `labs`: 32); **127** na raiz `client/js/*.js`; **93** referenciam `localStorage`/`sessionStorage` | **PASS** |

### 2.2 Ciclo residual e portas de contexto ([ADR-035](../adr/035-camadas-e-contextos.md))
- **Único ciclo estático** ([scripts/cycles-debt.json](../../scripts/cycles-debt.json)): `app/onboarding-email.js` ↔ `app/onboarding.js` ↔ `app/screens-network.js`.
- **Portas de contexto (`CONTEXT_DOORS`, 0 bypasses):**
  - `vault/index.js`: 10 callers externos (2 namespace, 5 named, 4 `import()`), exports nomeados explícitos. **Saudável.**
  - `vault/envelope.js` e `identity/keys.js`: 2 callers cada, somente imports nomeados. **Saudáveis.**
  - `identity/index.js`: **65 callers externos** (**51** via `import * as`, 10 named, 26 `import()`). Usa `export *` de 11 submódulos — encapsula bem, mas amplia o grafo estático de quem só lê a conta ativa.

### 2.3 Top 10 acoplamentos em `client/js/app/` (fan-out estático + dinâmico)

| # | Módulo (`client/js/`) | Total | Fora de `app/` | `app` | `render` | `base` | Diagnóstico |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | `app/screens-community.js` | **41** | **33** | 8 | 2 | 31 | Concentra comunidade, governança, Feira/BRCode e moderação |
| 2 | `app/screens-compose.js` | **31** | **25** | 6 | 2 | 23 | Concentra composição, mídia, upload, flags e permanência |
| 3 | `app.js` | **30** | **9** | 21 | 0 | 9 | Ponto de entrada acoplado à maioria dos fluxos de `app/` |
| 4 | `app/screens-profile.js` | **28** | **23** | 5 | 1 | 22 | Perfil, carteira, upload, QR e compartilhamento |
| 5 | `app/screens-network.js` | **26** | **22** | 4 | 2 | 20 | Rede, login social, moderação, peers, DM e ciclo com onboarding |
| 6 | `app/init.js` | **24** | **12** | 12 | 1 | 11 | Boot de listeners e inicialização de serviços |
| 7 | `app/route.js` | **22** | **0** | 22 | 0 | 0 | **Roteador 100% estático** — impede *lazy-loading* (bloqueia `PM-01`) |
| 8 | `app/onboarding.js` | **21** | **10** | 11 | 1 | 9 | Entrada/kit e-mail/OAuth + ciclo com `screens-network` |
| 9 | `app/screens-home.js` | **20** | **14** | 6 | 1 | 13 | Feed principal + Bluesky + moderação + cache |
| 10 | `app/inline-composer.js` | **17** | **15** | 2 | 1 | 14 | Compositor inline com mídia, permaweb e malha |

- **Top fan-in da base:** `identity/index.js` (61), `share.js` (48), `render/util.js` (46), `cache-node.js` (38), `shared/html.js` (31), `peers.js` (27), `app/context.js` (26), `moderation.js` (25).
- **`UNPLUGGED_MODULES` (21 módulos em `client/js/labs/parado/`):** 100% isolados fora do precache (`PM-04` verde): 6 `node-health-*`, 3 `webxdc-*`, 2 guardiões (`seeder-guardian`, `settings-guardian`), 4 cívicos (`bridging-rank`, `civic-credential`, `kit-genesis`, `polis`), 3 rede/storage (`airgap-webrtc`, `chunked-transfer`, `idb-store`) e 3 identidade/social (`identity-link`, `testimonials`, `vox-identity`).

### 2.4 Proposta incremental de modularidade (5 passos — sem código nesta auditoria)
1. **PM-01 passo 1 (lazy routing):** converter rotas periféricas em `app/route.js` (`dungeon`, `labs`, `voxpedia`/`ajuda`, `download`, `revolucao`, `feira`) para `import()` dinâmico e tirá-las de `SHELL_ASSETS` (meta: −20% bytes no precache, núcleo 100% offline).
2. **Decomposição SLAP de telas pesadas:** fatiar `screens-community.js` (41) e `screens-compose.js` (31) por caso de uso (sem `_part1`/`_part2`, mantendo `LLOC ≤ 30`, `CC ≤ 15`, `Nesting ≤ 4`).
3. **Zerar `cycles-debt.json` e enxugar `identity/index.js`:** quebrar o ciclo `onboarding` ↔ `onboarding-email` ↔ `screens-network` e migrar gradualmente os 51 `import * as` para imports nomeados ou sub-porta de sessão.
4. **Próximos contextos ADR-035 (`social/` → `net/` → `qr/`) + catraca de storage:** reduzir os 127 arquivos soltos na raiz e introduzir dono por chave para os 93 arquivos que acessam `localStorage`/`sessionStorage`.
5. **Triagem seletiva `REV-02` em `labs/parado/`:** somente após `PM-01`, plugar sob demanda o que tiver uso real (`kit-genesis` se G1 liberar), manter experimentos em `labs/parado/` e arquivar `idb-store.js` enquanto `REV-07` vigorar.

---

## Fase 3 — Validação robusta de `FEATURES.md` × código × testes

Cobertura: **100% das 89 linhas** de [FEATURES.md](../FEATURES.md) (100% `no ar`, 100% `lab`, 100% `escrito, não plugado`).
- **Specs órfãs em `docs/specs/` vs `docs/README.md`:** **0** (`unindexedSpecs = []`).
- **Skips e todos:** **8 `skip` + 16 `todo`** em JS (`tests/*.test.js`) e **1 `skip`** permanente em Python (`relay/test_blind_relay_adversarial.py`) — **100% documentados com justificativa explícita** (zero skip mudo).

### 3.1 Matriz consolidada por seção (`docs/FEATURES.md`)

| Seção | Linhas | `no ar` / parcial / cfg | `lab` | `não plugado` / stub / planejado | Gaps encontrados na auditoria |
|---|---:|---:|---:|---:|---|
| 1. Social e feed | 13 | 11 | 0 *(frames host em lab)* | 2 | 2 linhas citam módulos na raiz sem `labs/parado/` |
| 2. Comunidades, governança e economia | 20 | 11 | 6 | 3 | l.42 cita teste inexistente `signed-verify`; l.46 cita `render/post-more-menu.js` (movido para `app/`); l.56–57 sem `labs/parado/` |
| 3. Pessoas, identidade e mensagens | 19 | 15 | 0 *(PM-83 citado em l.81)* | 4 | **Ausentes:** Cofre na malha ([ADR-037](../adr/037-cofre-na-malha.md)) e `tab-sync`. 9 linhas sem prefixo `identity/`, `vault/` ou `labs/parado/` |
| 4. Distribuição (POSSE) | 8 | 6 | 0 | 2 | 0 gaps estruturais |
| 5. Rede, malha e infraestrutura | 23 | 19 | 0 | 4 | **2 contradições:** l.103 (`idb-store.js` marcado `no ar`) e l.123 (`node-health-*.js` marcado `parcial`), ambos em `labs/parado/` + `UNPLUGGED_MODULES`. l.113/116/118 com paths antigos |
| 6. Ajuda e conteúdo | 6 | 6 | 0 | 0 | 0 gaps estruturais (tabela curta intencional) |

### 3.2 Cruzamento com `plano-testes-login.md` e `DOC-04`
- **[plano-testes-login.md](../process/plano-testes-login.md) §5 / §5.1:** `LT-06a` ainda afirma não haver `BroadcastChannel`/`storage` no login, mas `client/js/identity/tab-sync.js` (`vox-tab-sync-v0` + `tests/tab-sync.test.js`) já está em `develop`; `LT-07` já tem retomada pós-recarga (`tests/onboarding-reload-keyboard.test.js`); `LT-02` ganhou `tests/login-rede-ruim.test.js`. Atualização direcionada ao PR #4 (mutex).
- **`DOC-04`:** README alinhado no PR #285 e `FEATURES.md` neste PR; permanece pendente para depois a revisão de copy da Voxpedia e das telas `client/js/render/*`.

### 3.3 Top 10 Gaps (Doc vs Código)

| # | Gap | Evidência | Tipo | Destino |
|---:|---|---|---|---|
| 1 | `FEATURES.md` l.103 marcava `idb-store.js` como `no ar` (está em `labs/parado/` e `UNPLUGGED_MODULES`, intencionalmente fora por REV-07/PM-72) | `client/sw.js`; `ROADMAP.md` PM-72 | **Só doc** | **Corrigido neste PR** |
| 2 | `FEATURES.md` l.123 marcava `node-health-*.js` como `parcial` (todos os 6 estão em `labs/parado/` e `UNPLUGGED_MODULES`) | `client/sw.js` | **Só doc** | **Corrigido neste PR** |
| 3 | Cofre na malha (ADR-037) e sincronização entre abas (`identity/tab-sync.js`) ausentes de `FEATURES.md` | `client/js/vault/mesh-vault.js`, `client/js/identity/tab-sync.js` | **Só doc** | **Corrigido neste PR** |
| 4 | `render/dm.js` não sanitiza `contextCard.href` (`javascript:`) nem `mediaDataUrl` | `tests/render-dm-proposal-tag.test.js` (`2 todo`) | **Exige código** | Fila de código (D3) |
| 5 | `probeVaultUrl` sem timeout (relay lento trava "Entrar") e `lockAfterPasswordBackup` trava conta mesmo com `remote=0` | `tests/login-rede-ruim.test.js` (`2 todo`) | **Exige código** | Fila de código (D3) |
| 6 | Cofre na malha: 4 achados adversariais em `skip` (fila de 50 avisos, replay de `soltar`, guarda antiga reaplicável, aviso de não-laço) | `tests/mesh-vault-adversarial-flow.test.js` (`4 skip`) | **Exige código** | Backlog (exige decisão de formato) |
| 7 | Envelope de DM comum sem assinatura (aguarda RFC 0002 / `LAN-18`), replay de reação e DM sem teto de texto | `tests/dm-adversarial.test.js` (`4 skip`) | **Exige código** | Backlog (`LAN-18` / produto) |
| 8 | `FEATURES.md` l.42 citava teste inexistente `signed-verify` | `tests/` | **Só doc** | **Corrigido neste PR** |
| 9 | 18 linhas de `FEATURES.md` com caminhos pré-ADR-035 / pré-#177 | `client/js/identity/`, `vault/`, `app/`, `labs/parado/` | **Só doc** | **Corrigido neste PR** |
| 10 | `plano-testes-login.md` §5.1 defasado (`tab-sync`, `onboarding-reload-keyboard`, `login-rede-ruim`) e `repost-index.js` quebra com storage não-objeto (`2 todo`) | `CHANGELOG.md`; `tests/repost-index.test.js` | **Doc + Código** | PR #4 (doc) + D4 (código) |
