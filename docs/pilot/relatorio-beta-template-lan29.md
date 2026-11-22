# Relatório do Beta por Convite e Decisão de Go Público — G3 (LAN-29)

> **Status:** rascunho (modelo reutilizável LAN-29 para consolidação do beta e votação formal do portão G3) · **Owner:** mantenedor / stewards · **Revisado:** 2026-11-22
> **Não substitui o [ROADMAP.md](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). Consolida os resultados das Ondas 1–2 de [plano-lancamento-ondas.md](../strategy/plano-lancamento-ondas.md) frente aos critérios quantitativos de [criterios-go-beta-lan28.md](../strategy/criterios-go-beta-lan28.md), dando continuidade ao [go/no-go e retrospectiva do piloto](./piloto-comunidade-go-no-go.md).

> **Regra estrita de preenchimento (zero invenção / CODE-02):** preencher **somente** com evidências reais coletadas ao fim da janela do beta fechado (5–10 comunidades parceiras, até ~300 pessoas na Onda 1 / fila até 3.000 na Onda 2), sem telemetria central invasiva — usando exportações locais de `#/status` (`signaling-telemetry.js`), formulários de testadores (`bug-tester.yml`), registros de plantão (`LAN-04`) e retrospectivas das comunidades. **Não** duplicar strings de versão do Service Worker no texto; referenciar o commit/linha em [release-metadata.json](../release-metadata.json).

---

## 1. Identificação da janela do beta e resumo executivo

- **Ondas cobertas:** `[Onda 1 (até 300) / Onda 2 (fila)]` · **Duração total:** `[AAAA-MM-DD a AAAA-MM-DD — mínimo 8–12 semanas no ROADMAP]`
- **Commit / tag de referência avaliada:** `[SHA de main / release-metadata.json]`
- **Comunidades participantes (meta 5–10):** `[N comunidades]` · **Participantes ativos estimados:** `[N pessoas]`
- **Responsáveis pela consolidação:** `[Mantenedor técnico]` + `[Steward externo 1]` + `[Steward externo 2]` (bus factor ≥ 2, `LAN-30`)
- **Resumo em 3 linhas (o que funcionou, o que travou, recomendação preliminar):** `[Preencher]`

---

## 2. Coorte de comunidades e métricas de retenção (`LAN-28`)

### 2.1 Mapa da coorte (5–10 comunidades, até ~300 pessoas na Onda 1)

| # | Comunidade (`Community-Id` / apelido) | Perfil do coletivo | Facilitador / Steward local | Entrada | Pessoas na semana 1 | Pessoas ativas na semana 4+ | Retenção (%) | Retrospectiva linkada |
|---|---|---|---|---|---:|---:|---:|---|
| 1 | `[ex.: Associação X]` | `[bairro / sindicato / cultura]` | `[papel/link]` | `[AAAA-MM-DD]` | `[ ]` | `[ ]` | `[ ]` | `[link/ata]` |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| — | **Total consolidado** | **5–10 comunidades** | **≥ 2 stewards externos** | — | **`[soma]`** | **`[soma]`** | **`[%]`** | — |

### 2.2 Verificação quantitativa frente aos critérios do `LAN-28`

Critérios extraídos de [`criterios-go-beta-lan28.md`](../strategy/criterios-go-beta-lan28.md) e [`piloto-comunidade-go-no-go.md`](./piloto-comunidade-go-no-go.md#critério-de-go-para-o-beta-por-convite-lan-28):

| Eixo | Critério (`LAN-28`) | Meta para Go (G3) | Valor medido no beta | Fonte / evidência verificável | Status (`ATENDIDO` / `NÃO ATENDIDO`) |
|---|---|---|---|---|---|
| **Confiabilidade** | Sessões sem crash crítico | **≥ 99,0%** | `[%]` | Contagem local + issues `bug-tester.yml` | `[ ]` |
| **Rede P2P** | Taxa de conexão P2P (direto ou TURN `REV-10`) | **≥ 85%** (piloto ≥ 70%) | `[%]` | Exportação de `#/status` (`signaling-telemetry.js`) | `[ ]` |
| **Sincronização** | Convergência de posts/ações entre pares conectados | **≥ 95%** em **≤ 60 s** | `[%] / [s]` | Amostra das comunidades + `e2e-mesh` (`PM-99`) | `[ ]` |
| **Sinalização** | Disponibilidade combinada (Render + Nostr `REV-09` + 2º nó `REV-01`) | **≥ 99,0%** e **0** janela **> 2 h** fora | `[%] / [janelas]` | Histórico `LAN-07` + `nostr-smoke.yml` | `[ ]` |
| **Identidade** | Perda irrecuperável de conta (com backup/guardiões) | **0** ocorrência | `[N]` | Retrospectivas locais (`REV-14`, `PM-72`) | `[ ]` |
| **Armazenamento** | Gravação acidental no Arweave com `arweaveUpload: false` (`REV-07`) | **0** gravação acidental (ou dentro da cota se `REV-11`) | `[N]` | `client/config/flags.json` + conferência | `[ ]` |
| **Segurança** | Auditoria externa de cripto (`LAN-18`) + revisão [THREAT-MODEL.md](../THREAT-MODEL.md) (`LAN-15`) | Concluídas; **0** crítico/alto aberto | `[data / achados]` | Relatório `LAN-18` + `npm audit` + CodeQL | `[ ]` |
| **Cadeia & CSP** | Inventário [DEPENDENCIAS.md](../DEPENDENCIAS.md) + SRI (`LAN-20`) + CSP (`LAN-16`) | **100%** coberto, **0** violação | `[status]` | `tests/deps-inventory-sri.test.js` + `deps-mensal.yml` | `[ ]` |
| **Jurídico** | Parecer `REV-12` + decisão PJ `REV-18` + Termos `LAN-02` + `COMPLIANCE-BR` `LAN-03` + `REV-20` + `LAN-13` | Publicados e validados | `[docs/links]` | `client/terms.html`, [GOVERNANCE.md](../../GOVERNANCE.md), `LAN-13` | `[ ]` |
| **Acesso** | WCAG 2.2 AA (`LAN-22`), orçamento Slow 3G (`LAN-23`) e onboarding com **≥ 5 leigos** (`LAN-25`) | **0** bloqueador + 5 atritos corrigidos | `[status]` | `tests/a11y-wcag-aa.test.js`, `shell-budget-check.mjs`, notas `LAN-25` | `[ ]` |
| **Operações** | Bus factor **≥ 2** (`LAN-30`), **≥ 2 stewards externos** (`NET-04`), drill DR (`NET-02`) e carga (`LAN-09`) | Todos executados e datados | `[datas]` | Inventário de titulares + atas de drill/simulado | `[ ]` |

---

## 3. Auditoria de gatilhos de pausa (`LAN-34` e `LAN-28 §6.2`)

Registrar explicitamente se **algum** gatilho de [`plano-lancamento-ondas.md`](../strategy/plano-lancamento-ondas.md#gatilhos-de-pausa) ou [`criterios-go-beta-lan28.md`](../strategy/criterios-go-beta-lan28.md#62-gatilhos-automáticos-de-no-go-hold-e-rollback) disparou durante o beta. **Para passar ao G3, nenhum gatilho pode estar em aberto.**

| Gatilho auditado | Disparou no beta? (`Não` / `Sim — data`) | Ação imediata tomada (`flags.json` / pausa de convites) | Causa raiz e resolução verificada | Permanece em aberto? (`Não` / `Sim`) |
|---|---|---|---|---|
| **1. Conteúdo grave sem resposta no prazo `LAN-04` (≤ 2 h)** | `[Não / Sim]` | `[ex.: convites fechados; communityCreate: false]` | `[pós-incidente / ajuste de plantão]` | `[Não / Sim]` |
| **2. Incidente de segurança com dado de usuário** | `[Não / Sim]` | `[ex.: notice publicado; recurso pausado]` | `[pós-incidente em até 7 dias]` | `[Não / Sim]` |
| **3. Spam passando do limite por chave (`LAN-14`) por > 24 h** | `[Não / Sim]` | `[ex.: arweaveUpload: false; ajuste rate-limit.js]` | `[parâmetros ajustados e testados]` | `[Não / Sim]` |
| **4. Sinalização fora do ar > 2 h sem caminho reserva** | `[Não / Sim]` | `[ex.: convites pausados até restabelecer 2º nó]` | `[causa e redundância verificada]` | `[Não / Sim]` |
| **5. Custo mensal acima do orçamento coberto (`LAN-32`)** | `[Não / Sim]` | `[ex.: convites fechados; teto TURN mantido]` | `[revisão de INFRA-CUSTOS e cobertura]` | `[Não / Sim]` |
| **6. Ordem judicial sem cumprimento técnico possível** | `[Não / Sim]` | `[ex.: onda pausada; acionamento jurídico REV-12]` | `[parecer e cumprimento no PWA oficial]` | `[Não / Sim]` |
| **7. Bloqueador automático de No-Go (`LAN-28 §6.2`):** falha de segurança/jurídico, bus factor = 1 ou cobertura < 12 meses | `[Não / Sim]` | `[bloqueio de passagem para G3]` | `[evidência de regularização]` | `[Não / Sim]` |

---

## 4. Livro operacional e financeiro real (beta vs. projeções)

### 4.1 Incidentes, moderação e SLA (`LAN-04` e `LAN-24`)

Referências: [`procedimento-conteudo-grave-lan04.md`](../operations/procedimento-conteudo-grave-lan04.md), [`runbook-incidentes.md`](../operations/runbook-incidentes.md) e [`transparency-report.mjs`](../../scripts/transparency-report.mjs) (`REV-20`).

| Métrica operacional / moderação | Meta (`LAN-04` / `LAN-28`) | Valor real no beta | Observações (sem PII) |
|---|---|---|---|
| **Denúncias recebidas no app (`LAN-12`)** | Registro 100% auditável | `[N]` | `[distribuição por categoria]` |
| **Denúncias externas de não usuários (`REV-20`)** | Canal ativo e respondido | `[N]` | `[via .github/ISSUE_TEMPLATE/denuncia-nao-usuario.yml]` |
| **Ocorrências graves (CSAM, íntimo não consentido, terrorismo etc.)** | **100%** contidas em **≤ 2 h**; **0** sem resposta em 24 h | `[N casos · pior tempo: X min]` | `[ações na hide-list LAN-13 e autoridades]` |
| **Entradas na `hide-list` assinada do PWA oficial (`LAN-13`)** | Assinatura Ed25519 verificável | `[N]` | `[referência de versão da hide-list]` |
| **Simulados datados executados (`LAN-04` / `NET-02`)** | ≥ 1 simulado grave + ≥ 1 drill DR | `[datas]` | `[links para atas nas tabelas dos runbooks]` |
| **Incidentes de infraestrutura / kill-switch (`LAN-08`)** | Contenção imediata + pós-incidente em ≤ 7 dias | `[N incidentes]` | `[flags alteradas e tempo de restauração]` |

### 4.2 Saúde da sinalização, malha e TURN (`LAN-09`, `LAN-07` e `REV-10`)

Comparar o comportamento real do beta com o benchmark local em [`bench-sinalizacao-lan09.md`](../operations/bench-sinalizacao-lan09.md) (`500` pares simulados em loopback; padrão de fábrica `VOX_SIGNAL_MAX_CONNECTIONS=64`):

| Componente | Referência (`LAN-09` / `INFRA-CUSTOS`) | Medido no beta | Gargalo / ajuste necessário para Onda 3 |
|---|---|---|---|
| **Nó de sinalização 1 (Render)** | Banda incluída (`REV-21`) · cold start ~13 s se dormir | `[uptime % · picos de peers · cold starts]` | `[ex.: configurar pinger 5 min / Starter INF-03]` |
| **2º nó de sinalização (`REV-01` / `INF-02`)** | Cloudflare Durable Object sem sleep | `[uptime % · failover testado?]` | `[ajustes de failover em signalingUrls]` |
| **Sinalização Nostr (`REV-09` / `PM-17`)** | Pool `nostrRelays` · `nostr-smoke.yml` | `[taxa de sucesso % · latência média]` | `[relays removidos/adicionados]` |
| **Página de status (`LAN-07`)** | [`scripts/generate-status-page.mjs`](../../scripts/generate-status-page.mjs) | `[URL pública · histórico 30 dias contínuo?]` | `[lacunas de monitoramento]` |
| **TURN Relay (`REV-10` / `INF-01`)** | Franquia grátis **1.000 GB/mês** · corte Worker **~800 GB/mês** | `[GB/mês consumidos · % sessões via TURN]` | `[risco de excedente US$ 0,05/GB na Onda 3]` |

### 4.3 Razão financeiro real vs. projeção de 12 meses (`LAN-32`)

Comparar o gasto real durante o beta com a projeção de [`INFRA-CUSTOS.md §6`](../INFRA-CUSTOS.md#6-projeção-orçamentária-de-12-meses--1000-e-10000-usuários-ativos-lan-32) (câmbio de referência `US$ 1,00 = R$ 5,80`):

| Linha de custo | Projetado 1.000 ativos / mês (`LAN-32`) | Gasto real no beta (média/mês em R$) | Gasto acumulado na janela (R$) | Fonte / justificativa da variação |
|---|---|---|---|---|
| **Domínio + DNS (`LAN-06`)** | R$ 4 – R$ 8 | `[R$]` | `[R$]` | `[ex.: registro .org.br anual / Cloudflare Free]` |
| **Sinalização + Relay (`REV-01` / `REV-04`)** | R$ 60 – R$ 120 | `[R$]` | `[R$]` | `[ex.: Free tier vs VPS/Workers]` |
| **TURN Relay (`REV-10` > 1.000 GB/mês)** | R$ 0 – R$ 145 | `[R$]` | `[R$]` | `[consumo em GB vs teto de 800 GB]` |
| **Créditos Turbo / Arweave (`REV-07` / `REV-11`)** | R$ 0 – R$ 60 | `[R$]` | `[R$]` | `[R$ 0 enquanto arweaveUpload: false]` |
| **PJ / Contabilidade / Jurídico (`REV-18`)** | R$ 400 – R$ 900 (ou R$ 0 se dispensado) | `[R$]` | `[R$]` | `[abertura única R$ … se executada]` |
| **Total real no beta** | **R$ 557 – R$ 1.480** (com PJ + 20% cont.) | **`[R$]`** | **`[R$]`** | — |

- **Cobertura confirmada para ≥ 12 meses (`LAN-32`, obrigatório para G3):**
  - **Fonte(s) confirmada(s):** `[GitHub Sponsors REV-22 / edital NLnet LAN-36 / edital BR PM-108 / caixa da associação REV-18]`
  - **Valor líquido disponível / comprometido (R$):** `[R$]` · **Cobre quantos meses no cenário 1k / 10k?** `[N meses]` · **Comprovação (ata/contrato sem segredos):** `[link]`

---

## 5. Decisão formal do portão G3 (Go / Hold / No-Go)

Regra de [`criterios-go-beta-lan28.md §6.1`](../strategy/criterios-go-beta-lan28.md#61-quem-assina-o-go-para-o-público-g3): **nenhum papel pode declarar "Go" unilateralmente**. A passagem para a Onda 3 (Público) e corte da tag `v1.0.0` ([`checklist-release-v1-lan33.md`](../operations/checklist-release-v1-lan33.md)) exigem registro escrito unânime abaixo:

### 5.1 Resultado da votação

- **Decisão registrada:**
  - `[ ]` **GO — Autorizar Onda 3 (Público) e corte da release `v1.0.0` (`LAN-33`)** *(todos os critérios `LAN-28` atendidos, 0 gatilho de pausa aberto, cobertura ≥ 12 meses confirmada)*
  - `[ ]` **HOLD — Manter beta fechado e remediar pendências listadas na §5.3**
  - `[ ]` **NO-GO — Bloquear G3; abrir plano de remediação e nova rodada mínima de 2 semanas antes de nova votação**
- **Data da decisão:** `[AAAA-MM-DD]` · **PR / Ata que registra o resultado no `ROADMAP.md`:** `[#PR]`

### 5.2 Bloco de assinaturas / aprovação (4 papéis obrigatórios)

| Papel obrigatório (`LAN-28 §6.1`) | Titular (nome / handle público acordado) | Escopo conferido | Voto (`GO` / `HOLD` / `NO-GO`) | Data | Referência da aprovação (PR / ata) |
|---|---|---|---|---|---|
| **1. Mantenedor técnico** | `[ ]` | CI verde, `LAN-09`, `LAN-18`, `LAN-22`, `LAN-23`, `LAN-33` | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |
| **2. Steward externo A** (`LAN-30`, `NET-04`) | `[ ]` | Independência operacional, drill DR (`NET-02`), espelho B | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |
| **3. Steward externo B** (`LAN-30`, `NET-04`) | `[ ]` | Redundância de operação/contas sem o mantenedor | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |
| **4. Responsável pelo plantão e confiança** (`LAN-04`, `LAN-13`, `REV-20`) | `[ ]` | SLA ≤ 2 h, rodízio de 2 pessoas, simulado e `hide-list` | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |
| **5. Conferência jurídica / institucional** (`REV-12`, `REV-18`, `LAN-02`, `LAN-03`, `LAN-32`) | `[ ]` | Parecer/PJ, Termos/LGPD/ECA e cobertura ≥ 12 meses | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |

### 5.3 Plano de ação pós-decisão

- **Se `GO`:** executar em ordem estrita [`checklist-release-v1-lan33.md`](../operations/checklist-release-v1-lan33.md) (incluindo ensaio pré-release de rollback, paridade espelho A ↔ B e kit de imprensa `LAN-35`) e atualizar o `ROADMAP.md` com data e responsáveis.
- **Se `HOLD` ou `NO-GO`:** listar abaixo cada item bloqueante, responsável, prazo e critério de reavaliação (mínimo **2 semanas** antes de nova votação para `NO-GO`, conforme `LAN-28 §6.3`):

| Item bloqueante | Responsável | Prazo | Critério objetivo de fechamento |
|---|---|---|---|
| `[ ]` | `[ ]` | `[AAAA-MM-DD]` | `[ ]` |
