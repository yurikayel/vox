# Brainstorm — 10 tarefas estratégia Vox (out/2026)

> **Status:** consolidado sprint estratégia · doc-only  
> **Público:** mantenedor/revisor, Antigravity, stewards, facilitadores de piloto  
> **Não é parecer jurídico** — risco regulatório → [COMPLIANCE-BR.md](../COMPLIANCE-BR.md)

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md), [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) e [backlog-participacao-rede.md](./backlog-participacao-rede.md).

---

## Índice das 10 tarefas

| # | Título | Linha |
|---|--------|--------|
| **T1** | **Antigravity — dossiê estratégico 12 meses** | Q4-2026→Q3-2027: papel mantenedor → revisor/aprovador; cenários, tensões, freeze vs hardening → [`antigravity-estrategia-mantenedor-revisor-2026.md`](./antigravity-estrategia-mantenedor-revisor-2026.md) |
| **T2** | **Posicionamento cívico no Brasil** | Vox vs Fediverse/Mastodon/Nostr/grupos WhatsApp — nicho, honestidade de escala, tabela forças/fraquezas |
| **T3** | **Playbook piloto V-P09** | 10–30 pessoas, semanas 0–4, roles, rituais, abort/continuar → template [piloto](./piloto-comunidade-retrospectiva-template.md) |
| **T4** | **Matriz risco regulatório operacional** | Espelho, steward, autor, mod — Marco Civil/LGPD/Pix; mitigação por arquitetura ([COMPLIANCE-BR](../COMPLIANCE-BR.md)) |
| **T5** | **Métricas honestas v2** | Evolução painel «Sustentada por vizinhos»: medir local, nunca publicar, UX degradada |
| **T6** | **V-P06 mirror validate** | Validação estrutural `POST /vox/mirror` — UX steward + critérios de aceite |
| **T7** | **Moderação voluntária E1–E5** | Plano operacional 90 dias (piloto + comunidades reais) |
| **T8** | **POSSE / Bridge / embed** | Funil de criadores e ordem de build (P0→P2) |
| **T9** | **2º espelho shell** | Drill DR + checklist ops ([ops-shell-mirrors.md](./ops-shell-mirrors.md)) |
| **T10** | **Community fork** | Cenários de conflito e gatilhos republicanos (válvula de escape) |

---

## T1 — Antigravity: dossiê estratégico 12 meses

**Entregável canônico:** [`antigravity-estrategia-mantenedor-revisor-2026.md`](./antigravity-estrategia-mantenedor-revisor-2026.md) (horizonte Q4-2026 → Q3-2027).

**Objetivo:** fixar que o humano no repo **publica cliente + merge FOSS**, não opera malha, moderação central nem NOC global.

**Quatro eixos de saída (T1–T4 internos ao dossiê):**

| Eixo | Pergunta | Critério de saída |
|------|----------|-------------------|
| Adoção | O flywheel fecha sem VPS central? | Piloto V-P09 + ≥1 coletivo com relay próprio documentado |
| Humanos | Quem substitui o mantenedor em ops? | Stewards + 2º espelho shell vivo |
| Código | O que congela vs o que endurece? | RFC para protocolo; hardening só em superfícies tocadas |
| Legal | Onde cai Art. 19? | Stewards de espelho, não o repo |

**Status sprint:** em curso Antigravity (doc + alinhamento fila impl).

---

## T2 — Posicionamento: Vox vs alternativas (Brasil)

**Tese:** o Vox não compete com “mais um servidor Mastodon” nem substitui WhatsApp em alcance; ocupa **praça cívica assinada + POSSE + infra participante** para coletivos que já sofrem centralização Meta.

| Dimensão | Vox | Fediverse / Mastodon | Nostr | Grupos WhatsApp |
|----------|-----|----------------------|-------|-----------------|
| **Entrada** | PWA 1 clique, Cantina | Escolher instância + conta | Chaves + relays | Já instalado |
| **Custo ops central** | R$ 0 (Pages) | VPS do admin (burnout) | Relays voluntários | Meta paga |
| **Moderação** | `mod-action` local, fork | Admin instance | Cliente + relay | Admin oculto |
| **Brasil móvel** | Honesto: CGNAT, Passivo OK | Mesmo limite | Mesmo | “Funciona” |
| **POSSE / link canônico** | Core (Arweave + `#/t/`) | Variável | Sim | Não |
| **Feira / deliberação** | Nativo (frames, cutoff) | Plugins | Fragmentado | Enquete frágil |
| **Escala honesta** | Comunidades + stewards | Instância grande = $$$ | Nicho técnico | Bilhões, custo privacidade |

**Forças Vox:** soberania Ed25519, honestidade gateway, ritual seed (V-P05), painel vizinhos sem scoreboard, Pix Zap offline, nicho **comunicação de campo + MEI + coletivo**.

**Fraquezas (declarar):** Bridge Instagram manual; cold start; dependência de gateway Arweave sob pico; curva steward; network effects menores que WhatsApp.

**Nicho cívico:** ONG, grêmio, bairro, campanha — “sair do Meta **com utilidade no dia 1**”, não pitch de federação.

---

## T3 — Playbook operacional piloto V-P09 (10–30 pessoas)

**Template:** [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) · seed [steward-seed-15min.md](./steward-seed-15min.md) · ritual [V-P05](../client/js/community-seed-checklist.js).

### Semana 0 (pré-voo)

- Escolher **facilitador** (não precisa ser dev) + **fundador** da comunidade slug.
- Grupo WhatsApp/Telegram **do coletivo** (não suporte Vox).
- Meta: 10–30 adultos com smartphone; 1 PC/notebook para steward opcional.

### Semana 1 — Fase A (48h): só leitura malha + gateway

| Dia | Ritual | Roles |
|-----|--------|-------|
| 1 | Cantina + criar comunidade + **V-P05** (3 min) | Fundador |
| 2–3 | 1º tópico + pin feira; compartilhar link canônico no Zap | Fundador + 2 convidados |
| 4–7 | Observar pill **Leitura reserva**; anotar copy confusa | Facilitador |

**Roles mínimos:** fundador (conteúdo), facilitador (log retrospectiva), mod reserva nomeado (E1).

### Semana 2 — Fase B: steward Caminho B

- 1 pessoa sobe relay ([steward-seed-15min](./steward-seed-15min.md)); `GET /health` + 1º `POST /vox/mirror`.
- Wizard `#/settings/network/steward` ou `.env` relay.

### Semana 3 — Fase C: Apoiadores + mod leve

- Meta ≥5 membros **Apoiador** (`commOnly`) — nudge V-P04.
- Sessão **E3** mod-action ao vivo (30 min simulado).
- Carta mod 1 página nas regras (**E2**).

### Semana 4 — Retrospectiva + decisão

Preencher template V-P09; critérios:

| Continuar | Abortar / pausar |
|-----------|------------------|
| ≥3 membros postam 2×/semana | Zero posts após semana 2 |
| Steward ou ≥5 Ativo/Apoiador | Fundador único queimado, sem trio E1 |
| Pill reserva explicável (infra, não “app quebrado”) | Copy/lista de confusão >5 itens bloqueantes |
| Mod reserva aceito | Conflito interpessoal sem carta mod |

**Métricas qualitativas (nunca ranking público):** latência percebida vs Zap-only; abandono fundador; frequência pill; lista “copy confusa”.

---

## T4 — Matriz risco regulatório operacional

**Disclaimer:** visão de produto/arquitetura para reduzir superfície — **não substitui** assessoria jurídica. Detalhes: [COMPLIANCE-BR.md](../COMPLIANCE-BR.md).

### Atores × eixos

| Ator | Marco Civil (Art. 19) | LGPD | Pix / pagamentos | Mitigação arquitetural |
|------|------------------------|------|------------------|-------------------------|
| **Mantenedor repo** | Não hospeda UGC; software FOSS | Não controlador de dados de terceiros em produção | Não processa Pix central | Pages estático; sem backend editorial |
| **Steward espelho/relay** | Pode ser “aplicação” se índice público | Logs mínimos; TTL inbox 72h | N/A | Quota disco; canal contato no README relay; supressão camada espelhada |
| **Autor / criador** | Responsável pelo conteúdo assinado | Dados no dispositivo; export opt-in | Pix peer-to-peer local | POSSE + assinatura; sem phone-home |
| **Mod eleito** | Ato de membro, não funcionário Vox | Sem acesso DM backdoor | N/A | `mod-action` auditável; mandato 90d; fork |

### Pix

- Zap nativo = fluxo **local/offline-first**; projeto não custodia carteira nem intermedia pagamento ([COMPLIANCE-BR](../COMPLIANCE-BR.md) § Pix).

### Decisões de produto que reduzem risco

- Sem ranking público de nós/mods ([ADR-001](./adr/001-contribution-attestation-export.md)).
- 2º espelho shell + registro SHA (disponibilidade, não editorial central).
- Community fork como válvula republicana (T10).

---

## T5 — Métricas honestas v2 («Sustentada por vizinhos»)

Evolução do painel no header `#/c/:slug` ([community.js](../client/js/render/community.js)) + telemetria local [gateway-telemetry.js](../client/js/gateway-telemetry.js).

### Medir **localmente** (opt-in, dispositivo)

| Sinal | Uso UX | Armazenamento |
|-------|--------|---------------|
| Estado gateway `all_ok` / `degraded` / `critical` | Pill + nudge apoio | `localStorage` |
| Último espelho bem-sucedido (`mirroredAt`) | “Índice atualizado há X” | memória sessão + espelho JSON |
| Contagem peers vistos (malha) | “Vizinhos online agora” **intervalo**, não ranking | agregado local |
| % leituras recentes via gateway (heurística) | Convite `commOnly` se alto | export JSON em `#/status` |

### **Nunca publicar**

- Leaderboard stewards, mods, MB servidos, IPs, gráficos comparativos entre comunidades.
- Telemetria agregada central phone-home (P2 só voluntária steward-side).

### UX degradada

| Estado | Copy | Ação sugerida |
|--------|------|---------------|
| Gateway lento | “Leitura reserva” | Link `#/settings/network` |
| Sem steward | “Índice via rede pública” | CTA wizard steward |
| Relay quota 507 | “Espelho cheio — fale com guardião” | Doc quota relay |

### Privacidade

- Painel mostra **stats da sessão/comunidade**, não perfilamento cruzado.
- Export atestação V-P07 = opt-in privado ([ADR-001](./adr/001-contribution-attestation-export.md)).

---

## T6 — V-P06 mirror validate: UX steward + aceite

**Spec:** [mirror-validate-v1.md](./mirror-validate-v1.md) · cliente [`community-mirror.js`](../client/js/community-mirror.js) · relay `mirror_validate.py` (proposta).

### Problema hoje

- Cliente monta JSON e `tryMirrorCommunityToRelay` **silencia falhas** (relay offline OK).
- Relay aceita corpo **sem** validação estrutural → índice quebrado ou oversized → steward debuga no escuro.

### Jornada UX steward (alvo)

```
Comunidade carrega tópicos
        │
        ▼
Cliente pré-valida (communityId, topics ≤500, ≤256 KiB)
        │
        ├─ falha local → toast “Índice não enviado: {motivo PT}” + link DEV
        │
        ▼
POST /vox/mirror → relay mirror_validate
        │
        ├─ 400 + code mirror.* → UI steward/wizard: “Corrija {campo}”
        ├─ 413 → “Índice grande demais; reduza tópicos ou use manifest v0”
        ├─ 507 → quota (já existe)
        └─ 200 → pill “Espelho atualizado {hora}” no painel vizinhos
```

**Superfícies UI**

| Onde | Comportamento |
|------|----------------|
| `#/c/:slug` header | Último espelho OK/falha (sem alarmismo) |
| `#/settings/network/steward` | Botão “Testar espelho agora” + último `code` |
| `#/status` | Linha `mirror_last_error` exportável |

**Pré-validação client-side** espelha regras do ADR (regex `communityId`, limites array) para fail-fast offline.

### Critérios de aceite (DoD V-P06)

| # | Critério | Verificação |
|---|----------|-------------|
| A1 | `mirror_validate.py` rejeita `communityId` inválido com `mirror.community_id_invalid` | unittest relay |
| A2 | Corpo >256 KiB → HTTP 413 | unittest |
| A3 | `topics` >500 → 400 estrutural | unittest |
| A4 | Sucesso inalterado `{ status: "mirrored", communityId }` | regressão `community-mirror.test.js` |
| A5 | Cliente mostra toast em falha **quando** steward/disparo manual; auto-mirror mantém best-effort silencioso **ou** flag `VOX_MIRROR_VERBOSE` | teste JS + copy PT |
| A6 | `cacheManifest` opcional validado v0 quando presente | unittest + doc |
| A7 | DEV.md § espelho atualizado; **324+** testes verdes | CI |

**Fora de escopo v1:** assinatura criptográfica do índice espelhado (P1 gossip manifest).

---

## T7 — Moderação voluntária E1–E5: plano 90 dias

Base: [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) §5 e fatia C (E1–E5).

### Objetivo

Validar que comunidades reais sustentam mods **sem** central Vox e sem scoreboard.

### Calendário

| Semanas | Foco | Entregas |
|---------|------|----------|
| **1–2** | Preparação | Carta mod template (**E2**); copy UI mod (5 snippets fatia C); integrar coluna “Fase C mod” no template V-P09 |
| **3–4** | Piloto 1 (10–15) | **E1** trio; **E3** workshop mod-action; registrar 1ª TX hide simulada |
| **5–6** | Piloto 2 ou mesma comunidade Fase C | **E4** plantão rotativo; ≥3 mods ou rotación clara |
| **7–8** | Appeal | **E5** ciclo proposta → voto cutoff → `unhide` ou manutenção |
| **9–10** | Retro + doc | Atualizar GOVERNANCE se gaps; issues UI mod (confirm, appeal link) |
| **11–12** | Escala suave | Segunda comunidade repete E1–E3; retrospectiva comparativa qualitativa |

### Experimentos (definição operacional)

| ID | O que fazer | Owner | Sucesso 90d |
|----|-------------|-------|-------------|
| **E1** | Fundador nomeia 2 facilitadores + 1 mod reserva antes dia 7 | Fundador | ≥2 aceites documentados |
| **E2** | Carta 1 página pinned nas regras | Mod plantão | Zero “regra implícita” na retro |
| **E3** | Live 30 min: ocultar tópico teste + ver TX | Facilitador | 1ª mod-action &lt;48h pós-incidente sim |
| **E4** | Plantão semanal rotativo (honorífico) | Mods | Autorrelato pausa sem culpa |
| **E5** | Appeal simulado: governance + desfecho | Comunidade | 1 ciclo completo documentado |

### Guardrails (non-negotiable)

- Mandato sugerido **90 dias**; steward ≠ mod ([GOVERNANCE.md](../GOVERNANCE.md)).
- Hide ≠ delete; sem backdoor DM.
- Sem leaderboard de ações mod.

---

## T8 — POSSE / Bridge / embed: funil criadores e ordem de build

**Refs:** [RFC 0001 POSSE](./rfc/0001-posse-export.md) · [vox-bridge-spike.md](./vox-bridge-spike.md) · [embed-integration.md](./embed-integration.md) · `posse-dispatch.js` · [vox-bridge/](../vox-bridge/).

### Funil criador

```
Descoberta (Cantina / convite Zap)
        │
        ▼
Publicação canônica Vox (#/t/:id assinado)
        │
        ├─ Tier A: share sheet intents (WhatsApp, X, copiar link)
        ├─ Tier B: export JSON vox-posse-export + CLI webhook
        ├─ Tier C: embed blog (vox-embed.js) → tráfego de retorno
        └─ Tier D: Bridge MV3 (Instagram/Threads) experimental
        │
        ▼
Leitor externo abre PWA → entrada comunidade → Apoiador/steward
```

### Ordem de build (não pular)

| Ordem | Entrega | Prioridade | Dependência |
|-------|---------|------------|-------------|
| **1** | Link canônico + OG meta honestos no `#/t/` | P0 | Nenhuma |
| **2** | Sheet POSSE Tier A (intents + copy) | P0 | 1 |
| **3** | `vox-posse-export` v1 estável + CLI | P1 | RFC 0001 |
| **4** | Embed `vox-embed.js` doc + 3 sites parceiros piloto | P1 | 1 |
| **5** | Flag “Bridge experimental” em settings | P2 | Governança ToS |
| **6** | Repo `vox-bridge` MV3 handoff clipboard | P2 | 5 |
| **7** | `externally_connectable` PWA↔extensão | P3 | Auditoria segurança |

**Anti-padrão:** prometer crosspost Instagram automático antes de Tier A/B — queima confiança do criador MEI.

---

## T9 — 2º espelho shell: drill DR e checklist ops

**Playbook:** [ops-shell-mirrors.md](./ops-shell-mirrors.md)

### Papéis

| Mirror | Host | Operador |
|--------|------|----------|
| **A** | GitHub Pages `yurikayel.github.io/vox` | Mantenedor CI |
| **B** | Cloudflare Pages / Gitea / nginx coletivo | Voluntário FOSS |

### Drill DR (semestral ou pós-release major)

| Passo | Ação | Tempo alvo |
|-------|------|------------|
| 1 | Anunciar janela em README (não simular ataque real) | T-7d |
| 2 | Desabilitar **A** (workflow pause ou aviso) | T0 |
| 3 | Validar **B** serve PWA, SW `CACHE_NAME` = release tag | T0+15min |
| 4 | Smoke: login local, `#/settings/network`, `#/c/demo-aprenda-vox-mirror` | T0+30min |
| 5 | Comunicar URL **B** no grupo piloto | T0+1h |
| 6 | Reativar **A**; confirmar SHA igual em ambos | T+4h |

### Checklist ops (release)

- [ ] `git rev-parse HEAD` publicado README ambos espelhos
- [ ] `CACHE_NAME` em `sw.js` idêntico na mesma release
- [ ] Diff `gateways.json` / `signaling.json` documentado se fork coletivo
- [ ] Registro: `mirror_id`, `base_url`, `git_sha`, `cache_name`, `operator`, `read_only: true`
- [ ] Steward ≠ shell (relay continua separado)

### Sinais de falha

- Usuários reportam “app branco” → SW mismatch entre espelhos.
- Só um espelho atualizado → DR incompleto; prioridade P0 antes de feature.

---

## T10 — Community fork: conflitos e gatilhos republicanos

**Refs:** [brainstorm-tracao-escalabilidade-incubacao.md](./brainstorm-tracao-escalabilidade-incubacao.md) · [incubacao-p2-backlog.md](./incubacao-p2-backlog.md) · demo `demo-aprenda-vox-mirror`.

### Princípio

Fork **civilizado** = pressão sana sobre mods; não litígio no repo central.

### Cenários de conflito

| Cenário | Sintomas | Resposta republicana |
|---------|----------|----------------------|
| **Mod tirânico** | Ocultações em massa, sem carta mod, recusa appeal | Proposta fork + migração filiação |
| **Steward parcial** | Espelho aplica hide além do mod eleito | Steward documenta política; comunidade escolhe espelho alternativo |
| **Schism doutrinário** | Dois blocos querem regras incompatíveis | Fork com histórico preservado; cutoff evita brigading na votação |
| **Spam comercial** | Feira invadida | Mod feira + ocultar; fork só se mods capturados |
| **Captura fundador** | Fundador = mod permanente | E1 + mandato 90d + governance remove |

### Gatilhos objetivos (quando **propor** fork)

1. ≥3 `mod-action` contestadas + appeal **E5** negado sem voto cutoff documentado.
2. Mod recusa publicar carta mod (**E2**) após 14 dias pedido comunitário.
3. Steward anuncia política de índice incompatível com voto de governança válido.
4. Comunidade ≥20 membros ativos e **≥40%** assinam proposta fork (heurística piloto, não hardcode produto).

### Fluxo produto (alvo P2)

1. TX `Type: community-fork` referencia `parentCommunityId`.
2. UI: “Migrar minha filiação” 1 clique (IndexedDB + gossip).
3. Banner espelho alternativo (já parcial no demo).
4. **Não** deletar histórico parent — transparência.

### O que o mantenedor **não** faz

- Escolher lado no fork.
- Reverter mods centralmente.
- Prometer merge automático de ramos.

---

## Rastreio lobby

Lista 1–10 espelhada em `lobby.md` § **Brainstorm 10 tarefas out/2026**. Implementação técnica: V-P06, V-P09, V-I08, P2 fork/Bridge conforme [backlog-participacao-rede.md](./backlog-participacao-rede.md).

**Versão:** 1.0 · **Data:** 25 out 2026
