# Contrato operacional — Antigravity × Cursor (Vox)

> **Status:** canônico (contrato operacional; baseline e fluxo de PR abaixo atualizados em 2026-11-17) · **Owner:** mantenedor · **Revisado:** 2026-11-17

**Repositório:** [github.com/yurikayel/vox](https://github.com/yurikayel/vox)  
**Baseline registrado:** `main` @ **`d23f54b`** · `develop` @ **`c661aa0`**  
**Suíte:** **186** testes (**172** Node.js + **14** Python relay/signaling)  
**Última atualização deste doc:** 2026-11-17

---

## English summary (coordinator signal)

Antigravity implements **network/protocol** work on **`feat/*` branches only**; it **never merges or pushes to `develop` or `main`**. Cursor owns integration: rebase, conflict resolution, SW cache bump, `client/DEV.md`, green **`npm run validate`**, PRs, and **`origin/main` deploy only with explicit maintainer OK**. Scope is **P2P mesh** (`peers.js`, `cache-node.js`), **WebRTC signaling**, **HTTP relay**, **signed payloads**, **gossip retractions** (`GOSSIP_UPDATE` / `GOSSIP_DELETE` + tombstones). **Gossip retract v1** and **cache-manifest v0 mesh wire (V-I05)** are on `develop`/`main` (`client/js/peers-cache-manifest.js` imported by `client/js/peers.js`). **Flow:** feature PRs → **`develop`**; **`develop` → `main`** by PR at end of batch. **`develop` and `main` are protected** (branch up to date + five required checks: Cliente PWA Node 22/24, Relay & Signaling Python 3.11/3.12, Auditoria de Segurança). Next Antigravity missions kick off from **`git rev-parse --short origin/develop`** on the day (not a fixed SHA): gossip **v1.1 hardening**, **signed listings** protocol. Specs: [antigravity-gossip-retract-v1.md](../specs/antigravity-gossip-retract-v1.md), [cache-manifest-v0.md](../specs/cache-manifest-v0.md).

---

## 1. Divisão de responsabilidade

| Papel | Antigravity | Cursor |
|-------|-------------|--------|
| **Git** | Branch `feat/<missão>` a partir de `origin/develop` atualizado | `develop` e `main` blindadas; PR feature → `develop`; PR lote `develop` → `main` **somente com OK explícito do mantenedor** |
| **Escopo** | Protocolo malha, relay, signaling, payloads assinados, specs | UI, integração, docs drift, CI, conflitos multi-branch |
| **Entrega** | Push da branch + SHA + contagem de testes na branch | PR/merge em `develop`; verificação pós-merge; publicação `main` no fechamento do lote |
| **Deploy** | Não dispara Pages | Push em `main` → GitHub Pages |

**Regra dura:** Antigravity **não** faz merge em `develop`/`main`, **não** faz push em `main`, **não** resolve conflitos de integração entre features paralelas.

---

## 2. Git e qualidade de diff

1. **`develop` e `main` blindadas** — estável/deployável em `main`; integração contínua em `develop`; ruleset exige branch atualizada e **cinco checks** obrigatórios (Cliente PWA Node 22 e 24, Relay & Signaling Python 3.11 e 3.12, Auditoria de Segurança); ver [DEV §0](../../client/DEV.md) e [README — Como Contribuir](../../README.md).
2. **Somente `feat/*` ou `fix/*`** — uma missão por branch; nome alinhado ao doc kickoff (ex.: `feat/gossip-v1_1-hardening`).
3. **Edits limpos** — finais de linha **LF**; sem scripts de patch em massa; sem reformatação oportunista fora dos touchpoints da missão.
4. **Baseline** — antes de codar: `git fetch origin && git checkout -b feat/... origin/develop`; registrar SHA base (`git rev-parse --short origin/develop`) no PR/descrição da branch.

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
| **Manifesto cache (v0)** | `Type: cache-manifest`, helpers `cache-manifest.js`, wire malha `peers-cache-manifest.js` em `peers.js` |

**Fora do escopo Antigravity (salvo spec explícita):** chrome UI (`render.js`), i18n de produto, seed demo, política de moderação visual, refactors amplos de `app.js`.

---

## 4. Higiene de entrega (obrigatório na branch)

Antes de sinalizar “pronto para merge”:

| Check | Ação |
|-------|------|
| **`npm run validate`** | **Verde** na branch (lint, testes JS + Python relay, auditorias doc/complexidade) |
| **`client/sw.js`** | Bump `CACHE_NAME` quando **qualquer** asset em `SHELL_ASSETS` ou módulo cacheado mudar |
| **`client/DEV.md`** | Entrada curta da missão (wire, flags, testes novos) |
| **Spec linkada** | Kickoff em `docs/` referenciado no topo do PR mental da branch |
| **Sem segredos** | Nada de chaves, `.env`, URLs privadas hardcoded |

Cursor repete `npm run validate` após merge em `develop`/`main` antes de pedir merge do PR.

---

## 5. Handoff Antigravity → Cursor

| Etapa | Antigravity | Cursor |
|-------|-------------|--------|
| 1 | Branch `feat/...` pushed | — |
| 2 | Informa **SHA da branch** + **N testes** + doc/spec tocada | Confere diff vs `origin/develop` |
| 3 | — | Rebase/merge em worktree limpo se necessário |
| 4 | — | Resolve conflitos (SW, `render.js`, etc.) |
| 5 | — | `npm run validate` verde → PR/merge em **`develop`**; no fechamento do lote, PR **`develop` → `main`** com OK do mantenedor |
| 6 | — | Log uma linha em `politica/lobby.md` + SHA final |

**Antigravity entrega branch; Cursor integra via `develop` e publica `main` no lote.**

---

## 6. Status atual (`main` @ `d23f54b` · `develop` @ `c661aa0`)

| Item | Estado |
|------|--------|
| **Gossip retratação v1** | **Integrado** — `GOSSIP_UPDATE` / `GOSSIP_DELETE`, testes T1–T10, UI prep (`GOSSIP_RETRACT_UI=true`). Spec: [antigravity-gossip-retract-v1.md](../specs/antigravity-gossip-retract-v1.md). |
| **Cache manifest v0 (helpers + spec)** | **Integrado** — `cache-manifest.js`, testes M1–M4, doc [cache-manifest-v0.md](../specs/cache-manifest-v0.md). |
| **V-I05 wire malha cache-manifest** | **Integrado em `develop`/`main`** — `client/js/peers-cache-manifest.js` importado por `client/js/peers.js` (fan-out / handling `cache-manifest` na malha). |
| **Relay HTTP configurável (V-I04)** | **Integrado** — SW `vox-pwa-v6.13-configurable-relay-http`. |

---

## 7. Próximas missões Antigravity (ordem sugerida)

1. **Gossip v1.1 hardening** — Dedupe, fan-out e edge cases pós-integração UI; regressão T1–T10 + novos casos; ADR curto se mudar semântica LWW.
2. **Listing signed** — Protocolo de oferta/classificado assinado na malha (shape TX + gossip); spec kickoff em `docs/` antes da impl.

Cada missão: branch própria, baseline = **`git rev-parse --short origin/develop`** no dia do kickoff (coordinator publica SHA após cada merge em `develop`).

---

## 8. Referências

| Documento | Uso |
|-----------|-----|
| [antigravity-gossip-retract-v1.md](../specs/antigravity-gossip-retract-v1.md) | Spec gossip UPDATE/DELETE (v1 merged) |
| [cache-manifest-v0.md](../specs/cache-manifest-v0.md) | Spec manifesto Arweave + helpers + wire malha (V-I05) |
| [espacos-digitais-infra.md](../strategy/espacos-digitais-infra.md) | Mapa infra / steward / mirror |
| [client/DEV.md](../../client/DEV.md) | Fluxo git, contagem de testes, flags de rede |

---

*Contrato operacional doc-only — Cursor mantém; Antigravity segue branches e handoff acima.*