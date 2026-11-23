# Relatório Trimestral "Estado da Praça" — Template Operacional (PM-103)

> **Status:** rascunho · **Owner:** mantenedor / steward ops · **Revisado:** 2026-11-22
> Não substitui o [ROADMAP](../ROADMAP.md). Este documento define o modelo reutilizável do item **PM-103** (cadência trimestral em abril, julho, outubro e dezembro), base pública do relatório anual de transparência (**REV-20**) e de evidências para editais (**LAN-32**, [PM-108](./editais-brasileiros-pm108.md)).

## 1. Cadência, fechamento e regra de revisão

| Edição | Mês de publicação | Período coberto | Escopo específico |
|---|---|---|---|
| **Q1** | **Abril** | Jan–mar | 1º relatório do ciclo anual; consolida o piloto de assembleias (**G1**) e verifica datas de desistência de T1 |
| **Q2** | **Julho** | Abr–jun | Consolida o portão **G2** (beta) e o desempenho da sinalização em campo (**PM-18**) |
| **Q3** | **Outubro** | Jul–set | Acompanha a expansão do beta por convite e a entrada de stewards externos |
| **Q4** | **Dezembro** | Out–dez + ano fechado | **Retrospectiva anual completa + plano do ano seguinte** (orçamento **LAN-32**, metas e preparo cívico/eleitoral, ex.: [PM-109](../operations/preparo-eleitoral-2028-pm109.md)) |

**Regra operacional do PR:** toda publicação trimestral do *Estado da Praça* deve revisar o [Calendário 2027](../ROADMAP.md#calendário-2027) (ou calendário vigente do ano) **no mesmo PR**, registrando explicitamente o que avançou, o que escorregou e qual data de desistência foi acionada.

---

## 2. Cabeçalho da edição (preencher a cada trimestre)

- **Edição:** `Q[1|2|3|4] / [AAAA]`
- **Período coberto:** `AAAA-MM-DD` a `AAAA-MM-DD`
- **Data de publicação:** `AAAA-MM-DD`
- **Responsável / Revisão (bus factor):** `[mantenedor]` · revisado por `[segunda pessoa — LAN-30]`
- **Linha de release vigente:** consultar [release-metadata.json](../release-metadata.json) (não duplicar versão de cache do SW no texto)
- **Usuários/contas ativas estimadas (sem telemetria central):** `[≤50 | >50 — critério: pico em /health ou relato de stewards]` · Status do gatilho: [gatilho-infra-50-ativos.md](../operations/gatilho-infra-50-ativos.md)

---

## 3. Custos reais do mês em R$ e cobertura (LAN-32)

Registrar valores efetivamente pagos no trimestre (média mensal e acumulado do trimestre), conferidos com o mapa de componentes de [INFRA-CUSTOS.md](../INFRA-CUSTOS.md). Free tiers com cota devem informar o consumo percentual observado.

| Categoria | Fornecedor / referência | Mês 1 (R$) | Mês 2 (R$) | Mês 3 (R$) | Consumo / cota observada | Observação |
|---|---|---:|---:|---:|---|---|
| **PWA Shell A e B** | GitHub Pages + Cloudflare Pages ([ops-shell-mirrors.md](../operations/ops-shell-mirrors.md)) | 0,00 | 0,00 | 0,00 | `[dentro do free tier / limite]` | — |
| **Domínio próprio (`LAN-06`)** | `[.org.br / Registro.br]` | — | — | — | Anualidade / 12 | Só após `REV-18` / `LAN-06` |
| **Sinalização (`REV-01` / `REV-21`)** | Render Free (`wss://vox-sentinel.onrender.com`) ou 2º nó CF Durable Object | 0,00 | 0,00 | 0,00 | `[h/mês de 750h; banda Billing]` | Sem cartão, estourar banda suspende até fim do mês |
| **TURN (`REV-10` / `INF-01`)** | Cloudflare Realtime TURN (`workers/turn`) | 0,00 | 0,00 | 0,00 | `[GB de 1.000 GB grátis/mês]` | Teto operacional ≤ 800 GB/mês; US$ 0,05/GB excedente |
| **Créditos Turbo / Arweave (`REV-07`)** | `upload.ardrive.io` (`arweaveUpload: false` por padrão) | 0,00 | 0,00 | 0,00 | `[desligado / KiB consumidos]` | Cota grátis (~10 MiB) **vitalícia e não renovável** |
| **Associação / PJ e contabilidade (`REV-18`)** | Cartório, contador, taxa bancária, certificado | — | — | — | `[não constituída / ativa]` | Só após decisão de `REV-18` |
| **Parecer jurídico / auditoria (`LAN-01` / `LAN-18`)** | Prestação pontual | — | — | — | `[pendente / executado]` | — |
| **Total de despesas do período** | — | **R$ 0,00** | **R$ 0,00** | **R$ 0,00** | — | — |

**Receitas e cobertura (`REV-22` / `LAN-32`):**
- **GitHub Sponsors (PF / org):** `R$ [valor]` (`[número]` apoiadores)
- **Editais / bolsas ([proposta NLnet](./proposta-nlnet-restack-2027.md) / [editais BR](./editais-brasileiros-pm108.md)):** `R$ [valor]`
- **Saldo reservado / meses de operação cobertos (`LAN-32`, meta ≥ 12 meses):** `[N meses]`

---

## 4. Disponibilidade operacional e saúde da sinalização (`PM-18`)

O Vox não possui telemetria central. Todos os indicadores abaixo vêm de:
1. Relatórios voluntários exportados localmente pelos usuários/stewards na tela `#/status` via [`client/js/signaling-telemetry.js`](../../client/js/signaling-telemetry.js) (`formatSignalingReport`, sem IDs de pares);
2. Issues de falha automática (`alerta-automatico`, **PM-61**: `sentinel-keepalive.yml`, `nostr-smoke.yml`, `deps-mensal.yml`, `deploy-shell-b.yml`);
3. Checagens manuais de espelhos e simulados de DR ([ops-dr-drill-checklist.md](../operations/ops-dr-drill-checklist.md)).

### 4.1 Saúde de conexão (`PM-18`) e disponibilidade

| Métrica | Valor no trimestre | Meta / gatilho | Fonte |
|---|---|---|---|
| **Canais WebSocket — sucesso / tentativas** | `[ok / tentativas (%)]` | Referência primária atual | Export `#/status` (`channels.ws`) |
| **Canais Nostr — sucesso / tentativas** | `[ok / tentativas (%)]` | Desistência em 30/04 se fraco | Export `#/status` (`channels.nostr`) |
| **Conexões WebRTC (pares) via WS vs Nostr** | `WS: [%] · Nostr: [%]` | Comparativo de campo | Export `#/status` (`peers`) |
| **Tempo até conectar o 1º par (média / mediana)** | `[ms média] / [ms mediana]` | ≤ 30 amostras locais por aparelho | Export `#/status` (`firstPeerSamplesMs`) |
| **Alertas automáticos (`alerta-automatico`)** | `[N abertos / N fechados]` | Keepalive, Nostr smoke, Shell B | GitHub Issues |
| **Disponibilidade de post com autor offline (`PM-75`)** | `[1h: % · 6h: % · 24h: %]` | A preencher após `PM-75` | Relatório de campo / beta |
| **Simulado de DR (`NET-02`)** | `[data do último simulado]` | Semestral / pré-G2 | [ops-dr-drill-checklist.md](../operations/ops-dr-drill-checklist.md) |

### 4.2 Incidentes, pós-incidentes e kill-switch (`LAN-08` / `LAN-24`)

Regra do [runbook-incidentes.md](../operations/runbook-incidentes.md): conter primeiro, registrar sem dados pessoais e publicar pós-incidente em até **7 dias**.

| Data | Incidente / sintoma | Duração / impacto | Flag alterada em [`flags.json`](../../client/config/flags.json)? | Link do pós-incidente |
|---|---|---|---|---|
| `AAAA-MM-DD` | `[ex.: cold start Render / falha relay Nostr]` | `[impacto]` | `[não / sim: nome da flag + notice]` | `[issue / doc]` |

---

## 5. Moderação agregada e remoções — Zero PII (`REV-20`)

Esta seção alimenta diretamente o relatório anual de transparência do kit de autorregulação (**REV-20**, itens 8–10 da tese do STF nos Temas 987/533) e o controle de conteúdo grave (**LAN-04** / **LAN-13**).

> **Regra estrita de privacidade (zero PII):** nunca publicar `routeId`, nomes civis, apelidos de denunciantes, e-mails, endereços IP, links de conteúdo removido ou transcrições de denúncias. Dados pessoais eventuais de denunciantes externos ficam fora de issues públicas e deste relatório.

| Indicador (estritamente agregado) | Q1 | Q2 | Q3 | Q4 / Total | Observação / SLA |
|---|---:|---:|---:|---:|---|
| **Denúncias recebidas no app (`LAN-12`)** | `[N]` | `[N]` | `[N]` | `[N]` | Enviadas assinadas aos moderadores locais |
| **Notificações de não usuários (`REV-20`)** | `[N]` | `[N]` | `[N]` | `[N]` | Recebidas pelo canal externo (issue form / e-mail) |
| **Ocultações locais em comunidades (`mod-action`)** | `[N]` | `[N]` | `[N]` | `[N]` | Decisões de moderação comunitária (ciclo E1–E5) |
| **Entradas na lista assinada do PWA oficial (`LAN-13`)** | `[+add / -rem]` | `[+add / -rem]` | `[+add / -rem]` | `[+add / -rem]` | Não apaga da malha nem do Arweave; oculta no PWA oficial |
| **Ocorrências de conteúdo grave (`LAN-04`)** | `[N]` | `[N]` | `[N]` | `[N]` | Meta de resposta ≤ **2 h** (íntimo não consentido / Decretos 2026) |
| **SLA cumprido em conteúdo grave (≤ 2 h)** | `[N / total]` | `[N / total]` | `[N / total]` | `[N / total]` | Registrar qualquer descumprimento como incidente |
| **Ordens judiciais recebidas / cumpridas** | `[N / N]` | `[N / N]` | `[N / N]` | `[N / N]` | Encaminhamento jurídico (`REV-12`) + ocultação no PWA oficial |

---

## 6. Progresso no Roadmap vs. Datas de Desistência

Conferir o estado de cada marco contra o [Calendário 2027](../ROADMAP.md#calendário-2027) e o [backlog de lançamento](./backlog-lancamento-publico-2026-11.md).

| Data de desistência / marco fixo | Gatilho do calendário | Estado na data de corte | Desvio ou plano B acionado |
|---|---|---|---|
| **03/01/2027** (fixo) | Submissão NLnet Restack (`LAN-36`) | `[submetido nº ___ / recusado / não elegível]` | Se recusado/inelegível: acionar [editais-brasileiros-pm108.md](./editais-brasileiros-pm108.md) |
| **31/01/2027** | Associação ou segunda pessoa (`LAN-30`) para piloto | `[no prazo / disparou]` | Se disparou: piloto espera; T1 adianta `REV-10`, `NET-02` e `PM-01` |
| **28/02/2027** | Parecer jurídico contratado (`LAN-01` / `REV-12`) | `[no prazo / disparou]` | Se disparou: portão **G2** vai para T3 |
| **30/04/2027** | Nostr funcional no campo (`PM-18`) | `[no prazo / disparou]` | Se Nostr fraco: mantém keepalive do Render e `REV-01` (CF Durable Object) vira principal |
| **30/06/2027** | Plantão com 2 pessoas (`LAN-04`) | `[no prazo / disparou]` | Se disparou: **G2** não abre |
| **30/09/2027** | Steward de fora validado (`NET-04`) | `[no prazo / disparou]` | Se disparou: beta não passa da onda 1 |
| **15/11/2027** | Decisão go/no-go de público (`LAN-29` → **G3**) | `[no prazo / disparou]` | Se sair depois: onda 2 começa em fev/2028 |
| **Após 05/03/2028** (fixo) | Publicação das resoluções TSE 2028 | `[agendado / revisado]` | Executar checklist de [preparo-eleitoral-2028-pm109.md](../operations/preparo-eleitoral-2028-pm109.md) |

### Bloqueios atuais (separar técnico vs. humano/institucional)

- **Bloqueios técnicos:** `[listar IDs do ROADMAP, ex.: PM-01, PM-71]`
- **Bloqueios humanos / institucionais / jurídicos:** `[listar IDs, ex.: REV-12, LAN-30, PIL-01, REV-18]`

---

## 7. Registro de decisões para o próximo trimestre

| # | Decisão tomada | Tipo (`doc` / `code` / `ops-humano`) | Responsável | Prazo | Critério de verificação (DoD) |
|---|---|---|---|---|---|
| 1 | `[ex.: adiar abertura de G2 para T3]` | `[ops-humano]` | `[papel]` | `[AAAA-MM-DD]` | `[evidência esperada]` |
| 2 | `[ex.: priorizar edital X ou parceria ICT]` | `[ops-humano]` | `[papel]` | `[AAAA-MM-DD]` | `[evidência esperada]` |

---

## 8. Anexo exclusivo do Q4 (edição de dezembro): Retrospectiva Anual e Plano do Ano Seguinte

Preencher **apenas na edição de dezembro** para consolidar o ano fechado e abrir o ciclo seguinte:

1. **Retrospectiva do ano (Piso vs. Meta):** comparar entregas reais contra o piso e a meta do ciclo (uso comunitário, bus factor, estabilidade da sinalização, parecer jurídico, cobertura financeira `LAN-32`).
2. **Relatório anual de transparência (`REV-20`):** consolidar a soma Q1–Q4 da seção 5 em peça pública linkável.
3. **Orçamento e sustentabilidade para os próximos 12 meses (`LAN-32`):** projetar custos para o patamar de usuários esperado (manter `<50` vs cruzar gatilho `>50` ativos) e indicar fontes confirmadas.
4. **Prioridades e datas de desistência do próximo ano:** listar no máximo 3 frentes simultâneas para T1–T4, incluindo os marcos cívicos/eleitorais aplicáveis ([preparo-eleitoral-2028-pm109.md](../operations/preparo-eleitoral-2028-pm109.md) quando o ciclo entrar em 2028).
