# Inventário — estado Vox + tarefas de documentação (nov/2026)

> **Baseline produto:** `main` **`99180f9`** (merge V-I08 **`898509c`**) · SW **`vox-pwa-v6.83-steward-kit-v-i08`** · **355** testes (**333** JS + **22** Python) · Pages **https://yurikayel.github.io/vox/**  
> **Escopo:** mapa do que existe hoje + **N=20** tarefas para revisão/documentação/completude — não substitui execução de T2 (2º espelho) nem piloto humano.  
> **Política de agentes:** Composer 2.5 only (lobby politica).

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [backlog-participacao-rede.md](./backlog-participacao-rede.md), [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) e [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md).

---

## 1. Inventário produto (por área)

| Área | Entregue em código (referência) | Docs / specs | Testes (amostra) |
|------|----------------------------------|--------------|------------------|
| **Rede / malha P2P** | `peers.js`, `cache-node.js`, `peers-cache-manifest.js`, `peers-blob-affinity.js` (V-I09, flag default off), `webrtc-peer.js`, gossip retratação (`gossip-retract-ui.js`) | [antigravity-operating.md](./antigravity-operating.md), [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md), [cache-manifest-v0.md](./cache-manifest-v0.md), [antigravity-blob-soft-priority-v0.md](./antigravity-blob-soft-priority-v0.md) | `peers*.test.js`, `gossip-retract*.test.js`, `cache-manifest.test.js` |
| **Gateway / leitura reserva** | `gateway-telemetry.js`, `graphql.js`, pill honesta | V-P02 · [honest-copy-audit-2026-10-23.md](./honest-copy-audit-2026-10-23.md) | `gateway-telemetry.test.js` |
| **Comunidade / espelho local** | `community-mirror.js`, `community-seed-checklist.js`, painel «Sustentada por vizinhos» | V-I03, V-P04, V-P05 · [espacos-digitais-infra.md](./espacos-digitais-infra.md) | `community-mirror.test.js`, `community-seed-checklist.test.js` |
| **Steward / relay** | `steward-wizard.js`, relay Python (`/vox/mirror`, `/health`), kits `tools/steward-kit-*` | V-I08 ✓ · [steward-relay-kit.md](./steward-relay-kit.md), [steward-seed-15min.md](./steward-seed-15min.md), [mirror-validate-v1.md](./mirror-validate-v1.md) | `steward-wizard.test.js`, relay `test_*.py` (22) |
| **Participação (camadas UI)** | `#/settings/network`, `inferParticipationLayer`, nudge `commOnly` | V-I06, V-P01, V-P04 | `render.test.js`, i18n |
| **Moderação / governança** | `moderation.js`, `governance.js`, `polis.js` | [GOVERNANCE.md](../GOVERNANCE.md), feira pin template | `moderation*.test.js`, `governance.test.js`, `polis.test.js` |
| **Feira / listing** | `listing.js`, `listing-ui.js` (ofertas assinadas, status) | [listing-signed-gossip-v1.md](./listing-signed-gossip-v1.md) | `listing*.test.js` |
| **POSSE / embed / Bridge** | `posse-dispatch.js`, embed tests, `vox-bridge/` stub | [rfc/0001-posse-export.md](./rfc/0001-posse-export.md), [embed-integration.md](./embed-integration.md), [vox-bridge-spike.md](./vox-bridge-spike.md) | `posse-dispatch.test.js`, `embed-vox.test.js` |
| **Descoberta social (V-DIS)** | OAuth client-only, `#/people`, `#/connect`, welcome profile | ADR-002 · [vox-brasil-welcome-profile.md](./vox-brasil-welcome-profile.md) | `oauth-profile.test.js`, `contacts.test.js`, `vox-welcome-profile.test.js` |
| **Malha descoberta (V-MESH)** | `profile-card.js`, `people-index.js`, gossip PROFILE_CARD | ADR-003 · [profile-card-gossip-v0.md](./profile-card-gossip-v0.md) | `profile-card.test.js`, `peers-profile-card.test.js` |
| **DM / inbox** | `crypto-dm.js`, `inbox.js`, relay TTL | DEV §8 · [ARCHITECTURE.md](../ARCHITECTURE.md) | `crypto-dm.test.js`, `inbox.test.js`, `dm-simple.test.js` |
| **Open Frames / feed** | `open-frames-host.js`, `frames.js`, composer inline | [open-frames-v2.md](./open-frames-v2.md) | `open-frames-host.test.js`, `frames.test.js` |
| **Pix / economia local** | `brcode.js`, `pix-key.js` | DEV §18 · [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) | `brcode.test.js`, `pix-key.test.js` |
| **Identidade / wallet** | `wallet.js`, `local-account.js`, `handles.js` | [IDENTITY.md](../IDENTITY.md) | `wallet.test.js`, `handles.test.js`, `local-account.test.js` |
| **Shell / PWA** | `sw.js` (`CACHE_NAME` canônico), sidebar, temas | README (parcial stale) · DEV §0–36 | 67 arquivos `tests/*.test.js` → **333** casos |

**Gaps produto (documentados, não bugs ocultos):** 2º espelho shell **B** vivo (T2); piloto V-P09 **execução** humana; V-P08 runbook dedicado; V-P07 UI atestação; métricas honestas **v2** (T5); Bridge MV3 decisão pós-piloto.

---

## 2. Inventário docs — mapa canônico

Legenda: **fresh** = alinhado a `99180f9` / 355 testes / participação pós-v82 · **stale** = números, SHA ou SW desatualizados · **spec** = normativo de protocolo · **brainstorm** = planejamento (pode divergir do código até merge).

### 2.1 Raiz repositório `vox/`

| Documento | Papel | Status |
|-----------|--------|--------|
| [README.md](../README.md) | Onboarding + release line | **stale** (201 testes, SHA/SW antigos) |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Visão técnica | **fresh** (revisar POSSE/DM footnotes trimestralmente) |
| [GOVERNANCE.md](../GOVERNANCE.md) | Moderação / papéis | **fresh** (V-I10) |
| [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) | LGPD / Marco Civil copy | **fresh** |
| [IDENTITY.md](../IDENTITY.md) | Chaves / handles | **fresh** |
| [POSITIONING.md](../POSITIONING.md) | Narrativa | **stale** (revisar pós T2 posicionamento out/2026) |
| [LESSONS.md](../LESSONS.md) | Lições comparativas | **fresh** |
| [client/DEV.md](../client/DEV.md) | Guia dev §0–36 | **stale** (topo §1.1/CI: 201/350 misto vs 355; SW via `sw.js` OK) |

### 2.2 `vox/docs/` — estratégia & participação

| Documento | Papel | Status |
|-----------|--------|--------|
| [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) | Meta trimestre + lista P0/P1/P2 | **fresh** |
| [backlog-participacao-rede.md](./backlog-participacao-rede.md) | IDs V-P | **fresh** (V-P09 exec pendente) |
| [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) | 4 camadas + regulatório | **fresh** (25/out) |
| [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) | Flywheel + mod E1–E5 | **fresh** |
| [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md) | T1 estratégico 12m | **fresh** |
| [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) | T1–T10 out/2026 (doc) | **fresh** |
| [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) | T1–T10 pós-v82 v1.1 | **fresh** (baseline SHA `898509c`; produto já `99180f9`) |
| [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md) | Incubação FOSS | **brainstorm** |
| [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) | V-P09 template | **fresh** |
| [espacos-digitais-infra.md](./espacos-digitais-infra.md) | V-I01 mapa camadas | **fresh** (sync V-P03) |

### 2.3 `vox/docs/` — steward, ops, protocolo

| Documento | Status |
|-----------|--------|
| [steward-relay-kit.md](./steward-relay-kit.md), [steward-seed-15min.md](./steward-seed-15min.md) | **fresh** |
| [ops-shell-mirrors.md](./ops-shell-mirrors.md) | **fresh** (T2/T9 — espelho B ainda não registrado como vivo) |
| [mirror-validate-v1.md](./mirror-validate-v1.md) | **fresh** (V-P06 ✓ código) |
| [antigravity-operating.md](./antigravity-operating.md) | **fresh** |
| [antigravity-gossip-retract-v1.md](./antigravity-gossip-retract-v1.md) | **spec** ✓ impl |
| [antigravity-blob-soft-priority-v0.md](./antigravity-blob-soft-priority-v0.md) | **spec** ✓ impl |
| [cache-manifest-v0.md](./cache-manifest-v0.md) | **spec** |
| [listing-signed-gossip-v1.md](./listing-signed-gossip-v1.md) | **spec** ✓ UI |
| [community-module-manifest-v0.md](./community-module-manifest-v0.md) | **spec** backlog |
| [gateway-honest-fallback-brainstorm.md](./gateway-honest-fallback-brainstorm.md) | **brainstorm** |
| [steward-wizard-brainstorm.md](./steward-wizard-brainstorm.md) | **stale** (wizard shipped — arquivar ou marcar histórico) |

### 2.4 ADR / RFC / métricas / outros

| Documento | Status |
|-----------|--------|
| [adr/001-contribution-attestation-export.md](./adr/001-contribution-attestation-export.md) | **fresh** (UI V-P07 pendente) |
| [adr/002-oauth-profile-enrich-client.md](./adr/002-oauth-profile-enrich-client.md), [adr/003-profile-card-gossip.md](./adr/003-profile-card-gossip.md) | **fresh** |
| [rfc/0001-posse-export.md](./rfc/0001-posse-export.md), [rfc/README.md](./rfc/README.md) | **spec** |
| [embed-integration.md](./embed-integration.md), [vox-bridge-spike.md](./vox-bridge-spike.md) | **brainstorm** → P2 |
| [metrics/baseline-2026-10-24.md](./metrics/baseline-2026-10-24.md) | **stale** (rebaseline pós 355) |
| [HARDENING.md](./HARDENING.md), [DNS-HANDLES.md](./DNS-HANDLES.md) | **fresh** |
| [incubacao-p2-backlog.md](./incubacao-p2-backlog.md) | **brainstorm** |
| [proposta-vox.html](./proposta-vox.html) | **fresh** (copy leigo) |
| [honest-copy-audit-2026-10-23.md](./honest-copy-audit-2026-10-23.md) | **stale** (re-audit pós painel vizinhos) |

### 2.5 Índice mestre sugerido (entrada única para revisores)

1. Participação: **rede-sustentada** → **backlog V-P** → **infra-participativa** → **auto-escala**  
2. Roadmap: **brainstorm pós-v82** → **brainstorm out/2026** → **antigravity-estrategia**  
3. Ops steward: **steward-relay-kit** → **seed 15min** → **ops-shell-mirrors**  
4. Dev: **DEV.md** + **README release line** + **`sw.js` CACHE_NAME**

---

## 3. Inventário backlog IDs

### 3.1 V-I (infra participativa) — lobby politica

| ID | Título | Status |
|----|--------|--------|
| V-I01 | Spec espaços digitais | ✓ doc |
| V-I02 | `commOnly` WANT/BLOB | ✓ |
| V-I03 | Mirror client → relay | ✓ |
| V-I04 | Relay URL configurável | ✓ |
| V-I05 | CACHE_MANIFEST | ✓ |
| V-I06 | UI camadas participação | ✓ |
| V-I07 | Governança feira ↔ pin | ✓ doc |
| V-I08 | Kit steward | ✓ **`898509c`** |
| V-I09 | Blob soft priority gossip | ✓ **`cc6239a`** |
| V-I10 | COMPLIANCE infra voluntária | ✓ |

### 3.2 V-P (participação majoritária)

| ID | Título | Status |
|----|--------|--------|
| V-P01 | Wizard steward | ✓ MVP |
| V-P02 | Gateway telemetry | ✓ |
| V-P03 | Sync espacos-digitais | ✓ |
| V-P04 | Nudge `commOnly` | ✓ |
| V-P05 | Seed checklist pós-comunidade | ✓ |
| V-P06 | Mirror validate UI | ✓ **`f43f8b8`** |
| V-P07 | ADR-001 export UI | pendente P2 |
| V-P08 | Sucessão steward + buddy | doc T4 pendente |
| V-P09 | Piloto + retrospectiva | template ✓ · **execução humana** [ ] |

### 3.3 T1–T10 — [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) (out/2026)

| # | Título | Status doc | Código / ops |
|---|--------|------------|--------------|
| T1 | Dossiê mantenedor→revisor 12m | ✓ | papel humano |
| T2 | Posicionamento vs Fediverse/Zap | ✓ | copy externa |
| T3 | Playbook piloto V-P09 | ✓ | exec humana |
| T4 | Matriz risco regulatório | ✓ | — |
| T5 | Métricas honestas v2 | ✓ | impl T5 pós-v82 |
| T6 | V-P06 mirror validate | ✓ | ✓ código |
| T7 | Moderação E1–E5 90d | ✓ | piloto |
| T8 | POSSE / Bridge funil | ✓ | parcial |
| T9 | 2º espelho DR | ✓ | **T2 ops P0** |
| T10 | Community fork | ✓ | demo/P2 |

### 3.4 T1–T10 — [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) (nov/2026)

| # | Título | Prioridade | Nota |
|---|--------|------------|------|
| T1 | Roadmap integrado Q4→Q2 | — | ✓ DoD doc |
| T2 | 2º espelho + drill DR | **P0** | próximo ops |
| T3 | V-P09 piloto operacional | P0 humano | |
| T4 | V-P08 sucessão buddy | P1 | |
| T5 | Métricas honestas v2 impl | P1 | |
| T6 | Mod E1–E5 no piloto | P1 | |
| T7 | V-I08 gaps residuais | P1 | |
| T8 | POSSE / Bridge / embed | P2 | |
| T9 | Community fork | P2 | |
| T10 | V-P07 export ADR-001 | P2 | |

*(T10 pós-v82 ≠ Pluggable Feeds — ver backlog participação.)*

### 3.5 Outros rastreadores (lobby)

- **V-DIS-01…18** — descoberta social ✓  
- **V-MESH-01…30** — profile card malha ✓  
- **V-D / V-D07 / V-D11 / V-D12** — UX feed/composer/sidebar ✓  

---

## 4. N=20 tarefas (agrupadas)

Cada tarefa: **objetivo**, **DoD revisado**, **owner**, **prioridade**, **links**.

### A — Documentação revisão

| ID | Objetivo | DoD revisado | Owner | P | Links |
|----|----------|--------------|-------|---|-------|
| **DOC-01** | Alinhar README release line a `99180f9` / 355 / SW v6.83 | Tabela SHA, testes, SW; link inventário | Cursor | **P0** | [README.md](../README.md) |
| **DOC-02** | Eliminar drift DEV.md §1.1 + CI (contagens testes) | Uma cifra canônica 355; CI descreve matriz Node/Python | Cursor | **P0** | [DEV.md](../client/DEV.md) |
| **DOC-03** | Índice mestre docs (§2.5) no README ou `docs/README.md` | Entrada única com 4 trilhas; link deste inventário | Community-doc | **P0** | §2.5 acima |
| **DOC-04** | Re-audit copy honesta pós painel vizinhos + steward | Checklist P0 hashtag/gateway/steward; delta vs out/23 | Cursor | **P0** | [honest-copy-audit](./honest-copy-audit-2026-10-23.md) |
| **DOC-05** | Arquivar/markdown histórico steward-wizard brainstorm | Banner «superseded by V-I08» + link kit | Community-doc | P1 | [steward-wizard-brainstorm](./steward-wizard-brainstorm.md) |
| **DOC-06** | Rebaseline métricas doc `metrics/baseline` | Novo snapshot 355 testes + áreas teste | Cursor | P1 | [metrics/baseline](./metrics/baseline-2026-10-24.md) |
| **DOC-07** | Cross-link inventário ↔ ambos brainstorms T1–T10 | Tabelas §3 espelham índices; zero ID orphan | Community-doc | P1 | §3 deste doc |
| **DOC-08** | POSITIONING.md vs T2 (out/2026) — gaps copy | Tabela audiência/mensagem/evitar sincronizada | Community-doc | P2 | [POSITIONING](../POSITIONING.md), [brainstorm-dez T2](./brainstorm-dez-tarefas-estrategia-2026-10.md) |

### B — Crescimento rede (ops + doc)

| ID | Objetivo | DoD revisado | Owner | P | Links |
|----|----------|--------------|-------|---|-------|
| **NET-01** | Ativar espelho shell **B** + registro público | URL, `git_sha`, `CACHE_NAME`, operador; paridade A↔B | Voluntário espelho | **P0** | [ops-shell-mirrors](./ops-shell-mirrors.md), T2 pós-v82 |
| **NET-02** | Executar drill DR espelho (playbook T9/T2) | Data + passos 1–6 documentados no ops doc | Voluntário + Community-doc | **P0** | [brainstorm-dez T9](./brainstorm-dez-tarefas-estrategia-2026-10.md) |
| **NET-03** | Publicar runbook V-P08 sucessão + relay buddy | Doc dedicado `docs/` + checklist handoff | Community-doc | P1 | T4 pós-v82, [backlog V-P08](./backlog-participacao-rede.md) |
| **NET-04** | Smoke steward por voluntário **não-maintainer** | Evidência (log/screenshot) anexada ao T7 | Steward externo | P1 | [steward-relay-kit](./steward-relay-kit.md) |
| **NET-05** | Registro espelhos comunidade (URL, SHA, read-only) | Tabela em ops ou COMPLIANCE anexo | Community-doc | P2 | [COMPLIANCE-BR](../COMPLIANCE-BR.md) |

### C — Código P0

| ID | Objetivo | DoD revisado | Owner | P | Links |
|----|----------|--------------|-------|---|-------|
| **CODE-01** | Feature freeze gate: só doc/fix durante piloto | Lobby + DEV § nota freeze; checklist PR | Mantenedor | **P0** | [brainstorm pós-v82 § freeze](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) |
| **CODE-02** | Métricas honestas v2 (T5) — `read_origin` local | DoD T5 § checklist; testes render; sem API relay | Cursor | P1 | T5 pós-v82 |
| **CODE-03** | V-P07 UI export atestação ADR-001 opt-in | Fluxo `#/settings` + testes; copy LGPD | Cursor | P2 | [adr/001](./adr/001-contribution-attestation-export.md) |
| **CODE-04** | Documentar flag V-I09 soft priority (default off) | DEV §24 + toggle futuro ou env doc | Cursor | P1 | [antigravity-blob-soft-priority-v0](./antigravity-blob-soft-priority-v0.md) |
| **CODE-05** | Gateway fallback UX (brainstorm → spike ou wontfix) | ADR curto ou issues fechadas com rationale | Cursor | P2 | [gateway-honest-fallback-brainstorm](./gateway-honest-fallback-brainstorm.md) |

### D — Piloto humano

| ID | Objetivo | DoD revisado | Owner | P | Links |
|----|----------|--------------|-------|---|-------|
| **PIL-01** | Selecionar comunidade + facilitador (10–30) | Roles RACI preenchido; Caminho A/B | Fundador local | **P0** | [brainstorm-dez T3](./brainstorm-dez-tarefas-estrategia-2026-10.md) |
| **PIL-02** | Semanas 0–4 piloto V-P09 | Calendário T3 executado; Zap paralelo | Facilitador | **P0** | [template retrospectiva](./piloto-comunidade-retrospectiva-template.md) |
| **PIL-03** | Retrospectiva 7–14d pós go-live | Template completo; decisão continuar/pausar/abortar | Community-doc | **P0** | V-P09 |
| **PIL-04** | Barra mínima: ≥3 Apoiadores ou 1 steward + mirror OK | Campos template preenchidos semana 4 | Fundador | P1 | V-P04/05/06 |
| **PIL-05** | Ciclo mod E1–E5 (90d) no piloto | E1–E5 evidências T6; appeal documentado | Mods + facilitador | P1 | [auto-escala § C.5](./brainstorm-auto-escala-organica-2026-10.md) |

---

## 5. Checklist master

### Documentação revisão

- [ ] **DOC-01** README release line  
- [ ] **DOC-02** DEV.md contagens testes  
- [ ] **DOC-03** Índice mestre docs  
- [ ] **DOC-04** Re-audit copy honesta  
- [ ] **DOC-05** Arquivar steward-wizard brainstorm  
- [ ] **DOC-06** Rebaseline metrics  
- [ ] **DOC-07** Cross-link brainstorms  
- [ ] **DOC-08** POSITIONING vs T2  

### Crescimento rede

- [ ] **NET-01** Espelho B vivo  
- [ ] **NET-02** Drill DR  
- [ ] **NET-03** Runbook V-P08  
- [ ] **NET-04** Smoke steward externo  
- [ ] **NET-05** Registro espelhos  

### Código P0 / P1

- [ ] **CODE-01** Feature freeze piloto  
- [ ] **CODE-02** Métricas honestas v2  
- [ ] **CODE-03** V-P07 export UI  
- [ ] **CODE-04** Doc flag V-I09  
- [ ] **CODE-05** Gateway fallback decisão  

### Piloto humano

- [ ] **PIL-01** Seleção comunidade  
- [ ] **PIL-02** Execução semanas 0–4  
- [ ] **PIL-03** Retrospectiva  
- [ ] **PIL-04** Barra Apoiadores/steward  
- [ ] **PIL-05** Mod E1–E5  

---

## 6. Top 5 tarefas P0 — documentação (ação imediata)

1. **DOC-01** — README release line (`99180f9`, 355, SW v6.83).  
2. **DOC-02** — DEV.md + CI: uma contagem canônica de testes.  
3. **DOC-03** — Índice mestre apontando trilhas participação/roadmap/ops/dev.  
4. **DOC-04** — Re-audit honest copy (gateway, steward, painel vizinhos).  
5. **DOC-07** — Amarrar IDs V-P / V-I / T1–T10 neste inventário e nos brainstorms (evitar drift de prioridade).

*(Ops **NET-01/02** são P0 de **rede**, não doc-only — listados aqui porque bloqueiam piloto.)*

---

**Versão:** 1.0 · **Data:** 2026-11 (nov/2026) · **Owner doc:** Community-doc + Cursor  
**Path:** `vox/docs/inventario-estado-e-tarefas-documentacao-2026-11.md`
