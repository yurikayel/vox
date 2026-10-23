# Contrato operacional — Antigravity × Cursor (Vox)

**Repositório:** [github.com/yurikayel/vox](https://github.com/yurikayel/vox)  
**Baseline registrado:** `main` @ **`62221c9`** (`V-I04` relay HTTP configurável)  
**Suíte:** **186** testes (**172** Node.js + **14** Python relay/signaling)  
**Última atualização deste doc:** 2026-10-23

---

## English summary (coordinator signal)

Antigravity implements **network/protocol** work on **`feat/*` branches only**; it **never merges or pushes to `main`**. Cursor owns integration: rebase, conflict resolution, SW cache bump, `client/DEV.md`, green `npm test`, merge, and `origin/main` deploy. Scope is **P2P mesh** (`peers.js`, `cache-node.js`), **WebRTC signaling**, **HTTP relay**, **signed payloads**, **gossip retractions** (`GOSSIP_UPDATE` / `GOSSIP_DELETE` + tombstones). **Gossip retract v1 is merged on `main`.** Next Antigravity missions start from **`62221c9`**: wire **cache-manifest v0** on the mesh (`feat/cache-manifest-v0`), gossip **v1.1 hardening**, and **signed listings** protocol. Specs: [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md), [cache-manifest-v0.md](./cache-manifest-v0.md).

---

## 1. Divisão de responsabilidade

| Papel | Antigravity | Cursor |
|-------|-------------|--------|
| **Git** | Branch `feat/<missão>` a partir de `origin/main` atualizado | `main` blindada; merge, cherry-pick, push `origin/main` |
| **Escopo** | Protocolo malha, relay, signaling, payloads assinados, specs | UI, integração, docs drift, CI, conflitos multi-branch |
| **Entrega** | Push da branch + SHA + contagem de testes na branch | PR/merge + verificação pós-merge em `main` |
| **Deploy** | Não dispara Pages | Push em `main` → GitHub Pages |

**Regra dura:** Antigravity **não** faz `git merge main`, **não** faz push em `main`, **não** resolve conflitos de integração entre features paralelas.

---

## 2. Git e qualidade de diff

1. **`main` blindada** — estável, deployável; ver [DEV §0](../client/DEV.md) e [README — Como Contribuir](../README.md).
2. **Somente `feat/*` ou `fix/*`** — uma missão por branch; nome alinhado ao doc kickoff (ex.: `feat/cache-manifest-v0`).
3. **Edits limpos** — finais de linha **LF**; sem scripts de patch em massa; sem reformatação oportunista fora dos touchpoints da missão.
4. **Baseline** — antes de codar: `git fetch origin && git checkout -b feat/... origin/main`; registrar SHA base no PR/descrição da branch.

---

## 3. Escopo técnico (malha Vox)

Trabalho Antigravity concentra-se em:

| Área | Módulos / wire típicos |
|------|-------------------------|
| **Gossip P2P** | `GOSSIP`, `GOSSIP_UPDATE`, `GOSSIP_DELETE`; dedupe `id` + `editedAt`; fan-out mesh |
| **Tombstones** | Objetos assinados minimal; LWW; rejeição de autor fraudulento |
| **Relay HTTP** | `inbox.js`, `fetchFromDesktopRelay`, espelho `POST /vox/mirror`, índices `/vox/index/` |
| **Signaling WebRTC** | `webrtc.js`, STUN/TURN, BroadcastChannel `vox-peer-v0` |
| **Payloads assinados** | ECDSA P-256 via `local-account.js` / `verifyPayload` |
| **Manifesto cache (v0)** | `Type: cache-manifest`, helpers `cache-manifest.js`, futura propagação em `peers.js` |

**Fora do escopo Antigravity (salvo spec explícita):** chrome UI (`render.js`), i18n de produto, seed demo, política de moderação visual, refactors amplos de `app.js`.

---

## 4. Higiene de entrega (obrigatório na branch)

Antes de sinalizar “pronto para merge”:

| Check | Ação |
|-------|------|
| **`npm test`** | **100% verde** na branch (mesma matriz que `main`: JS + Python relay) |
| **`client/sw.js`** | Bump `CACHE_NAME` quando **qualquer** asset em `SHELL_ASSETS` ou módulo cacheado mudar |
| **`client/DEV.md`** | Entrada curta da missão (wire, flags, testes novos) |
| **Spec linkada** | Kickoff em `docs/` referenciado no topo do PR mental da branch |
| **Sem segredos** | Nada de chaves, `.env`, URLs privadas hardcoded |

Cursor repete `npm test` em `main` após merge antes do push final.

---

## 5. Handoff Antigravity → Cursor

| Etapa | Antigravity | Cursor |
|-------|-------------|--------|
| 1 | Branch `feat/...` pushed | — |
| 2 | Informa **SHA da branch** + **N testes** + doc/spec tocada | Confere diff vs `origin/main` |
| 3 | — | Rebase/merge em worktree limpo se necessário |
| 4 | — | Resolve conflitos (SW, `render.js`, etc.) |
| 5 | — | `npm test` verde → merge → push **`origin/main`** |
| 6 | — | Log uma linha em `politica/lobby.md` + SHA final |

**Antigravity entrega branch; Cursor integra e publica `main`.**

---

## 6. Status atual (`main` @ `62221c9`)

| Item | Estado |
|------|--------|
| **Gossip retratação v1** | **Integrado em `main`** — `GOSSIP_UPDATE` / `GOSSIP_DELETE`, testes T1–T10, UI prep (`GOSSIP_RETRACT_UI=true`). Spec: [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md). |
| **Cache manifest v0 (helpers + spec)** | **Integrado** — `cache-manifest.js`, testes M1–M4, doc [cache-manifest-v0.md](./cache-manifest-v0.md). **Malha (`peers.js`) ainda sem fan-out de manifesto** — próxima missão. |
| **Relay HTTP configurável (V-I04)** | **Integrado** — SW `vox-pwa-v6.13-configurable-relay-http`. |
| **V-I05 implementação malha** | **Go a partir de `62221c9`** — branch alvo sugerida: `feat/cache-manifest-v0` (wire gossip/relay conforme spec §3–4). |

---

## 7. Próximas missões Antigravity (ordem sugerida)

1. **`feat/cache-manifest-v0`** — Propagar/atualizar manifesto assinado na malha e encaixe com espelho relay; touchpoints `peers.js`, possivelmente hook pós-`mirrorCommunityToRelay`; testes de wire dedicados; spec [cache-manifest-v0.md](./cache-manifest-v0.md).
2. **Gossip v1.1 hardening** — Dedupe, fan-out e edge cases pós-integração UI; regressão T1–T10 + novos casos; ADR curto se mudar semântica LWW.
3. **Listing signed** — Protocolo de oferta/classificado assinado na malha (shape TX + gossip); spec kickoff em `docs/` antes da impl.

Cada missão: branch própria, baseline = **`git rev-parse origin/main`** no dia do kickoff (coordinator publica SHA após cada merge Cursor).

---

## 8. Referências

| Documento | Uso |
|-----------|-----|
| [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md) | Spec gossip UPDATE/DELETE (v1 merged) |
| [cache-manifest-v0.md](./cache-manifest-v0.md) | Spec manifesto Arweave + helpers (wire pendente) |
| [espacos-digitais-infra.md](./espacos-digitais-infra.md) | Mapa infra / steward / mirror |
| [client/DEV.md](../client/DEV.md) | Fluxo git, contagem de testes, flags de rede |

---

*Contrato operacional doc-only — Cursor mantém; Antigravity segue branches e handoff acima.*
