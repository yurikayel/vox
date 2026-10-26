# Vox — Estratégia mantenedor → revisor/aprovador (Q4-2026 → Q3-2027)

> **Status:** Dossiê canônico (out/2026)  
> **Task Antigravity:** `bc87c940` (retry doc-only)  
> **Horizonte:** 2026-Q4 → 2027-Q3  
> **Tese:** O repositório publica cliente estático e **governa código**; a malha social escala **sem loop do mantenedor** (relay, mod, T&S, suporte 24/7).

Complementa [rede-sustentada-participantes.md](./rede-sustentada-participantes.md), [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md), [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md), [backlog-participacao-rede.md](./backlog-participacao-rede.md), [antigravity-operating.md](./antigravity-operating.md) e [GOVERNANCE.md](../GOVERNANCE.md).

Índice das dez tarefas estratégicas: [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) (**T1** = este documento).

---

## 1. Papel-alvo do mantenedor humano

| Faz (revisor/aprovador) | Não faz (por design) |
|-------------------------|----------------------|
| Merge em `main`, CI verde, bump SW quando shell muda | Relay/TURN/inbox **global** do projeto |
| RFCs, specs Antigravity, tags release quando necessário | Moderação central de timeline ou “central de denúncias” |
| Pages + workflow deploy; documentar 2º espelho | VPS obrigatória, hotline WhatsApp oficial, impulsionamento |
| Revisar PRs de protocolo (malha, relay, gossip) | Comprar infra para “salvar” comunidade lenta |
| Usar o app como **cidadão** nas próprias comunidades | Ser NOC único, DPO operacional ou CNPJ de plataforma |

**Antigravity × Cursor:** protocolo em `feat/*`; integração e `origin/main` no Cursor ([antigravity-operating.md](./antigravity-operating.md)). Mantenedor **humano** ≈ dono de merge + qualidade de release, não coordenador de ops da malha.

---

## 2. Cenários de adoção (2026-Q4 → 2027-Q3)

Premissa: crescimento **relacional** (WhatsApp, feira, deliberação), não campanha nacional paga ([brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) §A).

| Cenário | Sinais | Papel do mantenedor | Risco se ignorado |
|---------|--------|---------------------|-------------------|
| **A — Piloto fechado** | 1–3 comunidades, V-P09 em curso, ≥1 steward/ coletivo | Só CI/docs; participa como membro | Tentação de “hostear relay de emergência” |
| **B — Orgânico lento** | Cantina + feira, poucos stewards, pill reserva frequente | Reforçar copy honesta; merge V-P06/V-I08 | Usuários acham “rede quebrada”; maintainer vira suporte |
| **C — Onda local** | Migração de grupo (install party), pico 100–300 MAU numa região | **Congelar features**; hardening + runbooks V-P08 | Burnout steward único (modelo Mastodon) |
| **D — Estagnação** | Comunidades fantasma, cold start | Não resgatar com VPS; empurrar V-P05 seed | Mantenedor vira “growth team” central |
| **E — Pressão regulatória** | Art. 19 a **espelho/steward**, não ao repo | Atualizar [COMPLIANCE-BR.md](../COMPLIANCE-BR.md); zero inbox jurídico central | Narrativa “blindagem total” gera falsa segurança |

**Regra de ouro:** em **A–C**, sucesso = **menos tickets ops** para o maintainer, não mais uptime de servidor dele.

---

## 3. Dependências: humano vs automático

### 3.1 Automatizado ou default-on (malha/cliente)

| Mecanismo | Onde | Limitação honesta |
|-----------|------|-------------------|
| Pacto Vox (cache público sessão) | `peers.js`, settings rede | CGNAT 4G; Passivo legítimo |
| Gateway fallback + telemetria local | `gateway-telemetry.js`, V-P02 | Não substitui índice steward |
| Gossip retratação + blob soft priority | malha, V-I09 | Requer pares online |
| CI + testes relay Python | GitHub Actions | Bloqueia release, não opera relay |
| Deploy Pages em push `main` | workflow | Um espelho ≠ malha |
| Painel “Sustentada por vizinhos” + seed V-P04/05 | UI comunidade | Estimativas locais, não scoreboard |

### 3.2 Depende de humano (não escalar para o maintainer)

| Função | Quem | Artefato / ID |
|--------|------|----------------|
| Steward / relay de gaveta | Coletivo voluntário | V-I08, [steward-relay-kit.md](./steward-relay-kit.md) |
| Moderação `mod-action` | Mods eleitos por comunidade | [GOVERNANCE.md](../GOVERNANCE.md) |
| Piloto + retrospectiva | Animador local | V-P09 template |
| 2º espelho shell | Voluntário espelho | [ops-shell-mirrors.md](./ops-shell-mirrors.md) |
| Sucessão relay | Buddy comunitário | V-P08 |
| Wire protocolo pesado | Antigravity branch → Cursor merge | specs `docs/antigravity-*` |
| Oficina / install party | ONG, grêmio, biblioteca | `proposta-vox.html` |

**Anti-loop:** se um item da coluna humana vira “só o Yuri resolve”, o cenário **regrediu** — tratar como incidente de produto, não heroísmo ops.

---

## 4. Objetivos T1–T4 e critérios de saída

Horizonte trimestral alinhado ao [backlog-participacao-rede.md](./backlog-participacao-rede.md) e §7 do dossiê auto-escala.

### T1 — Contrato de papel (2026-Q4)

**Objetivo:** Mantenedor **só** revisor/aprovador documentado; participação majoritária rastreada.

| Critério de saída | Evidência |
|-------------------|-----------|
| Dossiê T1 publicado + índice T1–T10 | Este doc + [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) |
| Tripé docs participação linkado no lobby | `rede-sustentada`, auto-escala, infra-participativa |
| V-P02, V-P01, V-P04, V-P05 em `main` | Painel vizinhos + seed; SW documentado |
| Checklist mantenedor “Pages + CI only” acordado | [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) §A |
| Antigravity sem push `main` | [antigravity-operating.md](./antigravity-operating.md) |

### T2 — Loop sustentação sem maintainer (2027-Q1)

**Objetivo:** Coletivo fecha cold start e índice confiável **sem** VPS do repo.

| Critério de saída | Evidência |
|-------------------|-----------|
| V-I08 kit steward **fechado** (Win/Linux runbook 1-clique) | Branch `feat/steward-relay-kit` integrado |
| V-P06 mirror validate UI + validação espelho | [mirror-validate-v1.md](./mirror-validate-v1.md) |
| V-P04/05 adotados em ≥1 piloto | Retrospectiva V-P09 iniciada |
| 2º espelho shell **vivo** + URL no registro | [ops-shell-mirrors.md](./ops-shell-mirrors.md) |
| Heurística design: gateway &lt;30% leituras recentes **quando** steward + ≥5 pares | Telemetry local opt-in, **sem** KPI público |

### T3 — Distribuição legal e humana (2027-Q2)

**Objetivo:** Stewards e mods sabem **onde** a lei bate; burnout mitigado por processo, não por central.

| Critério de saída | Evidência |
|-------------------|-----------|
| V-P08 runbook sucessão + relay buddy publicado | Community-doc |
| Copy steward ≠ mod reforçada na UI | Wizard + painel vizinhos |
| [COMPLIANCE-BR.md](../COMPLIANCE-BR.md) revisado pós-piloto | Sem prometer “zero provedor” absoluto |
| Experimentos mod E1–E4 (trio, carta, workshop) **opcionais** documentados | auto-escala §5.5 |
| V-P07 export atestação ADR-001 **opt-in** | Sem ranking público |

### T4 — Validação de escala honesta (2027-Q3)

**Objetivo:** Decidir se o flywheel fecha empiricamente ou se gaps são **P2** conscientes.

| Critério de saída | Evidência |
|-------------------|-----------|
| V-P09 retrospectiva **escrita** (humano) | [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) |
| SLOs §4.2 auto-escala revisados com dados qualitativos | Degradado vs saudável documentado |
| RFC cadence estável (janela comentário) | [GOVERNANCE.md](../GOVERNANCE.md) |
| Backlog P2 priorizado (Bridge, fork, lentes) **sem** reabrir relay global | Roadmap trimestre seguinte |
| Mantenedor: **zero** incidentes “comprei VPS por emergência” no trimestre | Log lobby / honest post-mortem |

---

## 5. Tensões estratégicas (como decidir)

### 5.1 Transparência vs scoreboard

| Transparência (sim) | Scoreboard (não) |
|---------------------|------------------|
| Painel **por comunidade**: “~N aparelhos online”, “% cache local (estimativa)” | Leaderboard global de stewards ou nós |
| Pill “Leitura reserva” quando gateway responde | Shame individual (“você não contribuiu”) |
| Export diagnóstico `#/status` opt-in | Phone-home central de métricas |
| Atestação ADR-001 **privada** exportável | Moeda, boost pago, alcance leiloado |

**Decisão:** transparência **contextual e coletiva**; nunca competição entre pares ([rede-sustentada-participantes.md](./rede-sustentada-participantes.md) anti-padrões).

### 5.2 Legal: repo vs steward vs autor

- **Repo:** cliente estático FOSS; merge ≠ hospedagem de conteúdousuário ([infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) — leitura de risco, não parecer).
- **Steward de espelho/relay público:** camada onde Art. 19 e contato de notificação **podem** aplicar — runbook no kit relay.
- **Autor/mod:** TX assinadas; moderação client-side.

**Tensão:** marketing “zero provedor” vs realidade de espelhos voluntários. **Mitigação:** copy [COMPLIANCE-BR.md](../COMPLIANCE-BR.md); maintainer **não** vira caixa postal jurídica.

### 5.3 Burnout: steward, mod, mantenedor

| Papel | Sintoma | Válvula |
|-------|---------|---------|
| Steward único | Relay cai, fundador paga VPS | V-P08 buddy; quotas disco; 1 steward / 3–5 comunidades |
| Mod fundador | Emotional labor infinito | Trio E1; rotação; fork comunitário |
| Mantenedor | PRs + “suporte Telegram” | Recusar scope creep; freeze features; Antigravity só protocolo |

---

## 6. Decisões irreversíveis vs experimentos

### 6.1 Irreversíveis (não renegociar sem RFC major)

| Decisão | Motivo |
|---------|--------|
| Sem relay/TURN **global** do projeto | Evita SPOF Mastodon + custo + Art. 19 central |
| Sem moderação/T&S central no repo | Editorial e legal na comunidade |
| Sem ranking público de contribuição de nós | ADR-001 opt-in; Apoiador tímido |
| Cliente PWA open-source; identidade criptográfica local | Soberania e minimização LGPD |
| Antigravity não mergeia `main` | Separação protocolo vs integração |
| Default **Ativo** Pacto Vox com opt-out claro | Flywheel; tetos 50 MB/dia |

### 6.2 Experimentos (reversíveis; time-box 4–8 sem)

| Experimento | Hipótese | Kill switch |
|-------------|----------|-------------|
| Painel vizinhos no header | Mais `commOnly`/steward | Remover UI; manter telemetry |
| Blob soft priority V-I09 | Menos gateway em comunidades ativas | Flag env / revert merge |
| Mod piloto E1–E4 | Menos burnout fundador | Só doc; comunidade opt-in |
| Bridge MV3 / embed POSSE | Funil externo | Stub permanece se spam/ToS |
| Telemetria agregada **voluntária** stewards (P2) | Ops sem central | Nunca phone-home default |

---

## 7. Freeze vs hardening (orientação release)

Alinhado ao perfil global de hardening (`~/.gemini/config/AGENTS.md`) **no código**; aqui aplica-se à **estratégia de release**.

| Modo | Quando | O que entra | O que não entra |
|------|--------|-------------|-----------------|
| **Hardening** | Pré-piloto, pós-onda local (cenário C), antes tag | V-P06, V-I08, testes malha, mirror validate, copy audit | Novas superfícies sociais (OAuth enrich, feed experiments) |
| **Feature freeze** | 2–4 semanas durante piloto V-P09 | Bugfix, SW bump, docs | XL UI, novos tipos TX sem spec |
| **Protocol window** | Antigravity `feat/*` pronta | Cursor merge + regressão | Paralelizar &gt;1 XL malha |

**Regra:** freeze **não** significa parar merge de segurança ou retratação/gossip regressão; significa **não** expandir escopo de produto até T2 exit criteria parcialmente verdes.

---

## 8. Mapa de leitura (fontes deste dossiê)

| Documento | Uso neste dossiê |
|-----------|------------------|
| [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) | Meta trimestre, P0/P1/P2, anti-padrões |
| [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) | Flywheel, SLOs, mod ladder, checklist maintainer |
| [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) | 4 camadas, painel honesto, regulatório |
| [backlog-participacao-rede.md](./backlog-participacao-rede.md) | V-P* / V-I* rastreio |
| [antigravity-operating.md](./antigravity-operating.md) | Handoff branch → `main` |
| [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) | T4 validação |

---

## 9. Síntese executiva (1 página)

1. **Até 2027-Q3**, o mantenedor do repo Vox deve ser indistinguível de um **maintainer FOSS clássico**: CI, Pages, review, RFC — **não** NOC da malha.
2. **Adoção** vem de utilidade local (feira, Pix, deliberação) + stewards/mods humanos; o cliente já automatiza cache, fallback honesto e prioridade suave de BLOB.
3. **T1–T4** amarram documentação (Q4-2026) → kit + mirror trust (Q1) → legal/humano distribuído (Q2) → retrospectiva piloto (Q3).
4. **Tensões** resolvem-se favorecendo transparência **comunitária** sobre gamificação; **legal** nos espelhos; **burnout** com buddy/sucessão, não contratação central.
5. **Irreversível:** sem infra global, sem scoreboard, sem T&S central. **Experimentos:** painel, Bridge, telemetria steward voluntária — todos reversíveis.
6. **Cenário de pico:** hardening + freeze feature; **nunca** “VPS de emergência do maintainer”.

---

**Versão:** 1.0 · **Data:** 25 out 2026 · **Dono:** Community-doc (Antigravity task `bc87c940`)
