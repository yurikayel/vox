# Spec do MVP Técnico — Vox (nov/2026)

> **Status:** auditoria / rascunho técnico (**não substitui o [ROADMAP](../ROADMAP.md)** — [ADR-017](../adr/017-consolidacao-roadmap-unico.md)) · **Owner:** mantenedor · **Revisado:** 2026-11-19
> **Referências:** [analise-repositorio-vox-2026-11.md](./analise-repositorio-vox-2026-11.md) (três portões: pessoas / infra >50 / release) · [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md) (tese de tração; escolha de nicho adiada para G1) · [auditoria-features-arquitetura-2026-11.md](../audits/auditoria-features-arquitetura-2026-11.md) · [FEATURES.md](../FEATURES.md).

---

## 1. Definição do MVP técnico

O **MVP técnico do Vox** é uma **plataforma cívica local-first e offline-first** que opera integralmente no aparelho do usuário (PWA estático sem bundler) somada a **um único nó de sinalização** (Render + Nostr efêmero em paralelo) — **sem expandir infraestrutura** (INF-01…04 congelados até >50 usuários ativos) e **sem escolher nicho de praça ou abrir campanha pública** (piloto V-P09 adiado; escolha de nicho pertence ao portão G1 em [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md)).

Critério orientador: provar, por testes automatizados, CI e uso local controlado, que **uma pessoa cria conta soberana, recupera a conta sem servidor central, troca posts e DMs assinados/cifrados na malha e sobrevive a quedas de rede sem perder dados nem mentir sobre o estado da conexão**.

---

## 2. Núcleo obrigatório (recorte justificado em `FEATURES.md`)

Apenas o que precisa viver no **precache offline** do Service Worker (`SHELL_ASSETS`, alvo pós-`PM-01` ≤ 2,18 MiB) e funcionar sem rede externa:

| Domínio | Funcionalidades no núcleo (`FEATURES.md` = `no ar`) | Módulos-chave |
|---|---|---|
| **Identidade e sessão** | Conta local P-256 `vx_*`, pacto + confirmação 18+, faixa de conta provisória, sincronização entre abas | `identity/*` (`index.js`, `keys.js`, `tab-sync.js`), `age-gate.js`, `app/onboarding*.js` |
| **Recuperação soberana** | Frase 12/24 palavras (`#/frase`), cofre v2 por Senha Soberana (`#/backup`, `#/sync`, `.voxid`, kit e-mail), guardiões (`#/guardioes`, `#/voltar`), cofre na malha ([ADR-037](../adr/037-cofre-na-malha.md)) | `vault/*` (`index.js`, `envelope.js`, `mesh-vault.js`), `email-kit.js`, `shamir-gf256.js` |
| **Feed e comunidade mínima** | Feed Social/Cívico (`#/`), compositor em etapas, comunidades (`#/communities`, `#/c/:id`, `#/t/:id`), moderação básica, denúncia assinada, canal de comunidade, modo eleitoral | `app/screens-home.js`, `app/screens-community.js`, `app/screens-compose.js`, `civic-post.js`, `moderation.js`, `community-channel.js` |
| **DM E2E** | Mensagens diretas cifradas (`#/dm`, `#/dm/:addr`) + caixa de saída com reenvio por até 7 dias (`PM-78`) | `crypto-dm.js`, `dm-messenger.js`, `dm-outbox.js`, `inbox.js`, `app/dm-wire.js` |
| **Malha e persistência local** | Cache IndexedDB (`cache-node.js`), persistência anti-evicção (`storage-persistence.js`), exportação dos próprios posts (`own-posts.js`), gossip WebRTC + sync por inventário (`PM-80`), sinalização Render + Nostr (`REV-09`), mensagens de erro honestas (`LAN-21`) | `cache-node.js`, `peers.js`, `peer-sync.js`, `post-wire.js`, `nostr-transport.js`, `honest-errors.js`, `feature-flags.js` |

---

## 3. Recuperação de acesso

Nenhuma conta do Vox depende de banco central de usuários; voltar significa reabrir a chave criptográfica original (`INV-1` em [plano-testes-login.md](../process/plano-testes-login.md)).

- **No ar hoje (verificado por testes com WebCrypto real):**
  - **Frase de recuperação** (12 palavras BIP-39 pt para contas novas; 24 para legadas) — funciona 100% offline.
  - **Cofre v2 por Senha Soberana** (PBKDF2 600 mil iterações, [ADR-025](../adr/025-cofre-v2-so-a-senha-abre.md)) — link `#/sync?b=…` sem senha na URL, código `VOX1:…`, arquivo `.voxid` e rascunho `mailto:`.
  - **Guardiões Shamir** (3 de 5 por padrão, `#/guardioes`, `#/guardiao`, `#/voltar`) — envio, QR de pedido, troca e revogação.
  - **Cofre na malha ([ADR-037](../adr/037-cofre-na-malha.md), SW v7.141)** — cópias cifradas em laços mútuos, pedido cego com espera de 24 h ou aprovação "Fui eu" e veto "Não fui eu".
  - **Invariantes fechados:** `LT-01`, `LT-03`, `LT-04`, `LT-05`, `LT-08` (E2E loopback) e `LT-10` (matriz 20 pares criar × voltar).
- **Lacunas conhecidas (fora de promessa até fechar código):**
  - `LT-02` parcial: timeout em `probeVaultUrl` fechado (#291); resta não travar `lockAfterPasswordBackup` quando `remote=0` (`test.todo` em `tests/login-rede-ruim.test.js`).
  - `LT-06` parcial: `identity/tab-sync.js` cobre troca de conta/rota, mas faltam trava de criação simultânea entre duas abas e aviso de storage cheio.
  - `LT-07` parcial: retomada de recarga existe, mas faltam focus trap/Escape no modal de entrada e persistência do kit de e-mail antes da confirmação.
  - `LT-09` (veto da dona no caminho dos guardiões) e 4 achados adversariais do `mesh-vault` (`tests/mesh-vault-adversarial-flow.test.js`, `4 skip`).

---

## 4. Segurança

- **Em vigor no MVP técnico:**
  - **Assinaturas (`sig-format.js`, `PM-85`):** verificação v1 e v2; virada automática para emissão `sigv: 2` em **`2026-11-24T00:00Z` (`SIGV2_FROM`)** cobrindo campos aninhados (`photoTags`, `mediaRef`).
  - **Chaves em repouso (`PM-93`, [ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md)):** chaves de identidade e DM cifradas por chave do aparelho não exportável e travadas após backup.
  - **DMs E2E (`crypto-dm.js`):** cifra ponta a ponta no aparelho; denúncia assinada com revisão local (`PM-69`).
  - **Anti-spam e integridade na malha (`LAN-14`, `PM-84/86/87`):** limite de 20 posts/10 min por chave, quarentena de chave nova (PoW 14 bits), verificação obrigatória na hidratação da memória central e hash de mídia `mediaHash` coberto pela assinatura.
  - **Relay cego com snapshot autenticado em modo `compat` ([RFC 0002](../rfc/0002-snapshot-autenticado-do-relay-cego.md), #281):** `POST /relay/snapshot/<canal>` valida `X-Vox-Snapshot-Proof`; só snapshot autenticado poda; sem prova continua aceito como legado sem podar.
  - **Endurecimento do servidor:** CORS restrito por lista de origens (#265), `safe_path.py`, `vault_store.py`, `request_guard.py` e CSP sem `inline` (`LAN-16`).
- **Explicitamente fora do MVP técnico:**
  - **Relay `enforce` + envio de prova pelo cliente (`INF-04`):** aguarda >50 ativos e definição D2 do RFC 0002.
  - **Cripto nova (DM v2 assinada, subchaves `PM-13`, mochila v2 `PM-79`):** bloqueada até revisão externa de criptografia (`LAN-18`).
  - **Higienização de DM (`render/dm.js`, #290):** `normalizeContextCard` e `normalizeMediaDataUrl` filtram `contextCard.href` e `mediaDataUrl`; `tests/render-dm-proposal-tag.test.js` promovido.

---

## 5. Descentralização honesta

Alinhado aos **três portões** de [analise-repositorio-vox-2026-11.md](./analise-repositorio-vox-2026-11.md) (pessoas · infra >50 · release):

- **Preservação sem Arweave (`REV-07`):** `arweaveUpload: false` em `client/config/flags.json` e `client/js/feature-flags.js`. Nenhum dado novo é gravado no Arweave no MVP; circulação e sobrevivência ocorrem pela **rede de seguidores** (malha WebRTC + sync por inventário + backup local exportável `own-posts.js`). Arweave permanece apenas como leitura multi-gateway (4 gateways, 3 GraphQL, 8 s) para registros históricos.
- **Sinalização atual (honesta sobre SPOF):** 1 nó Render (`vox-sentinel.onrender.com`, mantido por cron resiliente #282) + sinalização Nostr efêmera em paralelo (`REV-09`, `kind 25050`), ainda não medida em campo aberto.
- **CGNAT / redes móveis sem TURN:** o código do Worker (`workers/turn`) e do cliente (`turn-credentials.js`) está pronto, mas **não há TURN em produção** abaixo de >50 ativos (`INF-01`). Pares atrás de CGNAT simétrico podem não fechar WebRTC direto, e a opção "Esconder meu IP" não tem efeito prático até o gatilho `INF-01`.
- **DM offline:** sem relay completo público operado por terceiro (`REV-04`), a entrega offline depende do relay local ou de a outra ponta estar online durante a janela de reenvio da caixa de saída (7 dias).

---

## 6. Escalabilidade no tempo (modularidade + gatilhos)

A arquitetura escala em estágios sem reescrita nem passo de build, unindo os achados da Fase 2 ([auditoria-features-arquitetura-2026-11.md](../audits/auditoria-features-arquitetura-2026-11.md)) ao Hardening v3.2 (`LLOC ≤ 30`, `CC ≤ 15`, `Nesting ≤ 4`):

1. **Estágio 1 — Dieta do shell (`PM-01`, agora):** converter rotas periféricas em `app/route.js` (22 imports estáticos hoje) para `import()` sob demanda e removê-las de `SHELL_ASSETS` (meta: reduzir precache de `2,73 MB` / 302 arquivos em ≥ 20% mantendo 100% do núcleo offline).
2. **Estágio 2 — Redução de acoplamento e ciclos (`ADR-035`, agora):** quebrar o último ciclo estático (`onboarding` ↔ `onboarding-email` ↔ `screens-network`), fatiar `screens-community.js` (41 imports) e `screens-compose.js` (31 imports) por caso de uso (SLAP) e criar catraca de acesso direto a `localStorage`/`sessionStorage` (hoje em 93 arquivos).
3. **Estágio 3 — Novos contextos com portas (`ADR-035 §3.2`):** extrair `social/` → `net/` → `qr/` (um PR por contexto, com porta `index.js` em `CONTEXT_DOORS`) para reduzir os 127 arquivos soltos na raiz `client/js/`.
4. **Estágio 4 — Plug seletivo (`REV-02`, pós-`PM-01`):** decidir módulo a módulo sobre os 21 arquivos isolados em `client/js/labs/parado/` (`UNPLUGGED_MODULES`), plugando apenas sob demanda (`import()`) o que tiver utilidade comprovada e arquivando o obsoleto (`idb-store.js`).
5. **Estágio 5 — Infraestrutura elástica (`INF-01…04`, só após >50 ativos):** deploy de TURN com orçamento (`INF-01`), 2º nó de sinalização Cloudflare Durable Object (`INF-02`), `VOX_RELAY_TRUST_PROXY_HOPS` + pinger externo 5 min (`INF-03`) e snapshot autenticado `enforce` (`INF-04`).

---

## 7. Acesso e divulgação

- **Acesso no MVP técnico:** PWA estático aberto localmente ou via espelhos já existentes (GitHub Pages oficial e espelho B opcional), sem dependência de lojas nem conta em Big Tech.
- **POSSE (distribuição sob controle da pessoa):** intents de compartilhamento (`share.js`, `posse-dispatch.js`), Story card 9:16 (`story-card.js`), `EXPLODE!` assistido e Bluesky vinculados — sempre com envio final pela pessoa.
- **Ajuda embutida (carregada sob demanda pós-`PM-01`):** Voxpedia (`#/voxpedia`), Guia para testadores (`#/ajuda/teste`) e "Algo errado aqui?" (`app-feedback.js`, guardado só no aparelho).
- **Restrição vigente:** **zero campanha pública, convite aberto ou recrutamento** enquanto o portão de pessoas (parecer jurídico `REV-12`, bus factor ≥ 2 `LAN-30`, decisão de abrir piloto `V-P09`) estiver fechado.

---

## 8. Interesses, módulos opcionais e nicho (pós-núcleo)

Conforme [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md), a escolha de **um nicho relacional / uma praça** pertence ao portão **G1**, não à arquitetura do MVP técnico. Módulos de interesse/vertical já existentes ficam **fora do precache do núcleo** (carregados sob demanda via `PM-01` ou atrás de flags):

- **Carregamento sob demanda (`lazy` pós-`PM-01`):** hashtags (`#/tag/:slug`), Feira (`#/c/:id?tab=feira`, `#/compose/listing`), Pix Zaps (`#/pix/:key`, com aviso DICT `REV-13`), governança estendida (`#/c/:id/proposal/:id`, `#/vote`), leitura Bluesky (`bsky-feed.js`), contas vinculadas (`#/settings/linked-accounts`), `#/download`, `#/revolucao`.
- **Em laboratório (atrás de flags explícitas):** Aviso assinado / chamada de ação / termo (`vox.lab.aviso`), moderador natural (`vox.lab.moderador`, `PM-83`), Open Frames host (`#/labs/frames`), perfil coletivo M-de-N (`#/labs/mofn`).

---

## 9. Fora do MVP técnico (corte explícito)

| Item | Motivo do corte | Referência |
|---|---|---|
| **Gravação no Arweave** | Pausada (`arweaveUpload: false`); cota vitalícia por carteira/IP | `REV-07`, [ADR-019](../adr/019-esquecer-por-padrao-e-memoria-civica.md) |
| **Webxdc + CRDT plugado, `polis.js`, `bridging-rank.js`, `vox-identity.js`, `airgap-webrtc.js`, `node-health-*`, `seeder-guardian.js`, `idb-store.js`** | Isolados em `client/js/labs/parado/` (`UNPLUGGED_MODULES`); sem peso no shell | `REV-02`, `PM-04` |
| **AI Social Dungeon** (`#/dungeon`) | Demonstração de laboratório sem IA nem rede | [ADR-033](../adr/033-ia-so-no-rpg-local-primeiro.md) |
| **Piloto humano (`V-P09`), escolha de nicho G1, campanha pública** | Adiados por decisão do mantenedor; dependem de portão jurídico/bus factor | `PIL-01…05`, `REV-12`, `LAN-30` |
| **Stewards públicos, relay completo público, TURN em produção, 2º nó, `enforce`** | Congelados até >50 usuários ativos | `INF-01…04`, `REV-04` |
| **Cripto nova (DM v2 assinada, mochila v2, subchaves `PM-13`, lápide de conta `PM-101`)** | Exigem revisão externa de criptografia prévia | `LAN-18`, `PM-79` |
| **Mídia v2 (AVIF/H.264/Opus, `PM-71`) e Modo assembleia (`PM-23`)** | Só entram depois de `PM-01` abrir espaço no shell | `ROADMAP.md` |

---

## 10. Definition of Done (DoD) do MVP técnico

O MVP técnico considera-se **pronto e verificável em `develop`/`main`** quando todos os itens abaixo estiverem simultaneamente verdes (com evidência literal de comando, exit code e contagem, conforme [qualidade-e-evidencia.md](../process/qualidade-e-evidencia.md)):

1. **Validação integral verde:** `npm run validate` → exit `0` (`eslint`, `lint:relay`, `audit:complexity` 0 violações, `audit:docs` 0 achados novos, `audit:layers` 0 violações e 0 ciclos após zerar `cycles-debt.json`, suíte JS `node:test` + Python `unittest`).
2. **Prova real de malha no CI (`PM-99`):** job `e2e-mesh` verde em dois Chromium headless (uma rodada via Nostr e outra via WebSocket trocando post assinado, inclusive pós-virada `SIGV2_FROM` em 24/11/2026).
3. **Conjunto mínimo nomeado de testes verdes (sem falhas nem regressões):**
   - *Identidade e recuperação:* `tests/local-account.test.js`, `tests/recovery-phrase.test.js`, `tests/vault-v2.test.js`, `tests/guardians*.test.js`, `tests/mesh-vault*.test.js`, `tests/login-roundtrip-*.test.js`, `tests/login-network-faults.test.js`, `tests/login-rede-ruim.test.js`, `tests/tab-sync.test.js`.
   - *Integridade, DM e malha:* `tests/sig-format.test.js`, `tests/assinaturas-e-sinais-malicioso.test.js`, `tests/crypto-dm.test.js`, `tests/dm-outbox.test.js`, `tests/peer-sync.test.js`, `tests/gossip-photo.test.js`, `tests/nostr-transport.test.js`, `tests/rate-limit.test.js`, `tests/new-key-guard.test.js`.
   - *Shell, flags e relay:* `tests/shell-reachability.test.js` (pós-`PM-01` com núcleo offline ≤ 2,18 MiB), `tests/feature-flags.test.js`, `tests/release-metadata-drift.test.js`, `relay/test_server.py`, `relay/test_signaling_robustez.py`, `relay/test_blind_relay_snapshot_auth.py`.
4. **Pendências de robustez `test.todo`:** fechados — `probeVaultUrl` timeout (#291), `repost-index.js` (D4), `render-dm` (#290). Aberto — `lockAfterPasswordBackup` com `remote=0` (`tests/login-rede-ruim.test.js`, ADR produto).
5. **Documentação sincronizada:** `README.md` + `docs/release-metadata.json` (#285), `docs/audits/auditoria-features-arquitetura-2026-11.md` + `docs/FEATURES.md` (#286), `docs/ROADMAP.md` + `docs/process/plano-testes-login.md` + `docs/THREAT-MODEL.md` (#287) e esta spec (`docs/strategy/mvp-tecnico-vox-2026-11.md`) indexados em `docs/README.md` com `npm run audit:docs` = `0`.
6. **CI completo (15/15 checks + CodeQL)** verde no SHA exato de cada PR antes de qualquer merge (e decisão explícita do mantenedor para o corte `develop` → `main`).
