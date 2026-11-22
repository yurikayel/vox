# Aviso assinado — Lotes 5–10 da Praça de Colunas (PM-97)

> **Status:** rascunho (spec PM-97 para Lotes 5–10 antes de qualquer código; continuação do aviso assinado v0) · **Owner:** mantenedor · **Revisado:** 2026-11-22
> **Acompanhamento:** **PM-97** no [ROADMAP](../ROADMAP.md) · **Base implementada (lotes A–D e 1–4):** [aviso-assinado-v0.md](./aviso-assinado-v0.md)
> **Relacionados:** [modo assembleia (PM-23)](./modo-assembleia-v0.md), [canal da comunidade (PM-81)](./canal-comunidade-v0.md), [integridade na entrada (ADR-021)](../adr/021-integridade-na-entrada-forma-assinada.md), [postura do piloto G1 (ADR-020)](../adr/020-postura-de-operacao-do-piloto-g1.md), [síntese — a praça de colunas](../brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md), [HARDENING](../HARDENING.md), [go/no-go do piloto](../pilot/piloto-comunidade-go-no-go.md).

---

## 1. Contexto e escopo

O [aviso assinado v0](./aviso-assinado-v0.md) especificou e entregou, atrás da flag de laboratório `vox.lab.aviso`, os **lotes A–D** (aviso no topo, contagem colada do WhatsApp, página leve `aviso.html`, envio manual) e os **lotes 1–4** (chamada de ação por DM, competências locais, termo de convivência + mediação, e sorteio cívico com testemunhas).

Esta spec define os **Lotes 5–10** do **PM-97** antes de qualquer linha de código:

| Lote | Peça | Tipo principal (`sigv: 2`) | Função na praça |
|---|---|---|---|
| **5** | Prestação de contas simples | `prestacao-contas` | Resumo assinado de entradas e saídas em totais agregados |
| **6** | Escala / turnos de tarefa | `escala-turnos` / `escala-turno-acao` | Grade de turnos com confirmação assinada e troca voluntária |
| **7** | Ata rápida vinculada à assembleia | `ata-assembleia` | Resumo e hash SHA-256 da ata (`PM-23`) fixados no mural |
| **8** | Mural de documentos e links verificados | `biblioteca-local` | Até 12 links `https:` ou hashes de documentos comunitários |
| **9** | Consulta pré-pauta | `consulta-pauta` / `consulta-pauta-voto` | Coleta de prioridades para assembleia sem peso de voto (corte de F8) |
| **10** | Fechamento e arquivo de ciclo | `fechamento-ciclo` | Consolida referências/hashes dos lotes para exportação offline (`EXP-04`) |

Todos os lotes 5–10 nascem **atrás da flag `vox.lab.aviso`**, só recebem implementação após validação no piloto **G1** e seguem as regras de código de [HARDENING](../HARDENING.md) (`LLOC <= 30`, `Nesting <= 4`, `CC <= 15`, `params <= 5`).

---

## 2. Invariantes comuns aos Lotes 5–10

### 2.1 Forma canônica `sigv: 2` (`client/js/sig-format.js`)

1. **Obrigatório `sigv: 2`:** todo objeto dos Lotes 5–10 deve ser assinado com `sigv: 2` (`sortDeep` recursivo de todas as chaves em qualquer profundidade, excluindo `sig` e `pubKey`, conforme [`sig-format.js`](../../client/js/sig-format.js)).
2. **Rejeição de `sigv !== 2`:** ao contrário de `aviso` legado em convivência v1/v2, qualquer payload dos tipos dos Lotes 5–10 sem `sigv: 2` (ou com `sigv` desconhecido) **é recusado na entrada** por `verifyPayload` ([`signed-verify.js`](../../client/js/signed-verify.js)).
3. **Campos obrigatórios base:** todo objeto assinado carrega `type`, `version: 1`, `id`, `communityId`, `ts` (UTC ms finito `> 0`, após o corte de gênese), `sigv: 2`, `author` (`vx_…`), `pubKey` (JWK P-256) e `sig` (`base64url` ECDSA P-256 SHA-256).
4. **Higiene de tamanho:** `authorAvatar` não deve ir embutido (ou deve ser `""`) quando o objeto circular em links ou lotes compactos; payload UTF-8 total nunca passa de `MAX_GOSSIP_ITEM_BYTES` (na prática `<= 8 KiB` por registro).

### 2.2 Autoridade PM-09 e verificação na leitura (`ADR-021`)

1. A verificação ocorre **na leitura e na entrada em cada aparelho** ([`moderation.js`](../../client/js/moderation.js) + [ADR-021](../adr/021-integridade-na-entrada-forma-assinada.md)), usando os metadados assinados mais recentes da comunidade (`community_update`).
2. **Objetos administrativos** (`prestacao-contas`, `escala-turnos`, `ata-assembleia`, `biblioteca-local`, `consulta-pauta`, `fechamento-ciclo` e seus `cancels`): só valem quando `isModerator(communityMeta, author)` for verdadeiro (dono ou moderação ativa). Se emitidos por terceiros, são ignorados no painel oficial da comunidade (não ganham selo nem substituem o estado vigente).
3. **Objetos participativos de membro** (`escala-turno-acao`, `consulta-pauta-voto`): exigem assinatura válida (`verifyPayload`), referência a um objeto pai válido da mesma `communityId` e respeito à janela temporal (`expiresAt` / `closesAt`). Respostas de quem possui `membership` válido na comunidade são contabilizadas separadamente de respostas "de fora da comunidade", seguindo o padrão do [aviso-assinado-v0.md](./aviso-assinado-v0.md).

### 2.3 Disciplina de orçamento do shell (`LAN-23`)

- **Regra "tela nova paga os próprios bytes":** nenhuma tela ou módulo lógico dos Lotes 5–10 entra no caminho crítico de boot nem em `SHELL_ASSETS` por padrão.
- Cada lote deve carregar via `import()` dinâmico sob demanda a partir da aba `#/c/<id>/avisos` (ou sub-rotas da comunidade), mantendo o shell crítico dentro dos limites de [`shell-budget-check.mjs`](../../scripts/shell-budget-check.mjs) (`maxRawBytes: 2_800_000`, `maxGzipBytes: 900_000`, `maxBootMs: 3_000` em Slow 3G `750 kbps` / `400 ms` RTT).
- Caso algum módulo seja promovido ao precache no futuro, o PR deve comprovar no `shell-budget-check.mjs` que o orçamento `LAN-23` permanece verde ou compensar com corte equivalente (sem remover JSDoc nem comentários úteis, conforme [HARDENING](../HARDENING.md)).

### 2.4 Cortes jurídicos e de produto preservados

- **Bloqueio de `cobranca` e dados Pix DICT:** permanece proibido publicar boletos, cobranças individuais ou chaves Pix pessoais até o parecer jurídico específico ([aviso-assinado-v0.md](./aviso-assinado-v0.md)).
- **Corte de F8 (sem peso de voto / anti-Sybil):** conforme o [ROADMAP](../ROADMAP.md) e o [brainstorm 2027](../brainstorms/brainstorm-roadmap-2027.md), não existe voto ponderado por reputação ou aval nos Lotes 5–10.
- **Só 18+** ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)) e zero telemetria oculta.

---

## 3. Especificação por Lote (Lotes 5–10)

### 3.1 Lote 5 — Prestação de contas simples (`prestacao-contas`)

**Objetivo:** permitir que a tesouraria/coordenação publique um resumo mensal ou de evento com entradas, saídas e saldo em valores agregados, com hash opcional de comprovante externo, sem expor dados pessoais de doadores.

**Formato wire (`sigv: 2`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"prestacao-contas"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único do registro (`pc_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `periodLabel` | string | sim | 3 a 32 caracteres (ex.: `"2026-11"` ou `"Mutirão Quadra"`) |
| `currency` | string | sim | Fixo `"BRL"` no v1 |
| `totalInCents` | integer | sim | Inteiro `>= 0` (centavos) |
| `totalOutCents` | integer | sim | Inteiro `>= 0` (centavos) |
| `balanceCents` | integer | sim | Inteiro finito (`totalInCents - totalOutCents` para o período, ou explicitado em `notes` quando houver saldo anterior) |
| `categories` | array | sim | 1 a 8 objetos `{ label: string (2–32), inCents: int >= 0, outCents: int >= 0 }`; soma das entradas/saídas das categorias deve bater com `totalInCents` / `totalOutCents` |
| `receiptHash` | string | não | SHA-256 (64 hex ou 43–44 base64url) do PDF/imagem do recibo guardado fora da malha |
| `notes` | string | não | Até 280 caracteres. **Proibido** nome de doador, CPF, telefone ou chave Pix/DICT |
| `cancels` | string | não | `id` de uma `prestacao-contas` anterior da mesma comunidade que esta substitui |
| `ts` | integer | sim | UTC ms |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09:** somente `owner` ou `isModerator` de `communityId` publica ou emite `cancels`. Entre registros válidos não cancelados do mesmo `periodLabel`, vence o de maior `ts`.
- **Privacidade e validação:** o cliente valida na montagem (e alerta na UI) padrões que pareçam CPF, telefone ou chave Pix em `notes`/`categories`, recusando publicação com PII; `cobranca` continua bloqueada.
- **Orçamento de shell (`LAN-23`):** módulo puro `aviso-contas.js` + tela lazy fora de `SHELL_ASSETS` (meta `<= 6 KB` gzipped).

---

### 3.2 Lote 6 — Escala / turnos de tarefa (`escala-turnos`)

**Objetivo:** organizar turnos de trabalho comunitário (portaria, cozinha, limpeza, plantão de oficina) com confirmação assinada e substituição voluntária, **sem** ranking punitivo, pontuação de falta ou vigilância.

**Formato wire (`sigv: 2`) — Grade (`escala-turnos`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"escala-turnos"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único (`esc_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `title` | string | sim | 8 a 80 caracteres |
| `cycleLabel` | string | sim | 3 a 32 caracteres |
| `slots` | array | sim | 1 a 24 objetos `{ slotId (2–24), role (2–24), startsAt (ms), endsAt (ms > startsAt), capacity (1..20) }` |
| `expiresAt` | integer | sim | UTC ms (`>= max(endsAt)`) |
| `cancels` | string | não | `id` de escala anterior cancelada |
| `ts` | integer | sim | UTC ms |
| `sigv` | integer | sim | `2` |

**Formato wire (`sigv: 2`) — Ação de turno (`escala-turno-acao`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"escala-turno-acao"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único |
| `communityId` | string | sim | Deve coincidir com a escala |
| `scheduleId` | string | sim | `id` da `escala-turnos` |
| `slotId` | string | sim | `slotId` existente em `slots` |
| `action` | string | sim | Enum fechado: `"claim"` \| `"release"` \| `"swap-offer"` \| `"swap-accept"` |
| `swapTargetId` | string | condicional | `id` da ação `"swap-offer"` aceita; obrigatório em `"swap-accept"`, proibido nos demais |
| `ts` | integer | sim | UTC ms (`<= expiresAt`) |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09 e regras de resolução:**
  - Só `owner` / `isModerator` publica ou cancela `escala-turnos`.
  - Qualquer membro (`membership`) pode emitir `escala-turno-acao`. Ação mais recente por `(scheduleId, slotId, author)` define o estado do participante naquela vaga.
  - Em caso de disputa concorrente por última vaga (`capacity`), ordena-se deterministicamente por `(ts ASC, id ASC)` — quem confirmou primeiro fica na vaga; quem pediu troca (`swap-offer`) permanece responsável até um `"swap-accept"` válido de outro membro.
  - **Sem ranking punitivo:** o app **não** calcula nem exibe histórico de desistências (`release`) ou taxa de faltas por pessoa.
- **Orçamento de shell (`LAN-23`):** lógica pura + UI lazy carregada via `import()` somente ao abrir a aba de escala (meta `<= 7 KB` gzipped, `0` bytes no precache).

---

### 3.3 Lote 7 — Ata rápida vinculada à assembleia (`ata-assembleia`)

**Objetivo:** publicar no mural da comunidade um cartão leve e verificável com o resumo e o hash SHA-256 da ata completa gerada pelo [modo assembleia (PM-23)](./modo-assembleia-v0.md), além do estado pós-decisão.

**Formato wire (`sigv: 2`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"ata-assembleia"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único (`ata_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `assemblyId` | string | sim | ID da assembleia/decisão de origem (`PM-23`) |
| `avisoId` | string | não | `id` da `convocacao` vinculada, se houver |
| `title` | string | sim | 8 a 80 caracteres |
| `summary` | string | sim | Até 500 caracteres com decisões objetivas |
| `ataHash` | string | sim | SHA-256 (64 hex ou 43–44 base64url) do JSON canônico da ata assinada (`PM-23`) |
| `decisionStatus` | string | sim | Enum alinhado ao `PM-23`: `"em_andamento"` \| `"cumprida"` \| `"arquivada"` |
| `quorumCount` | integer | sim | Inteiro `>= 0` |
| `cancels` | string | não | `id` de publicação de ata anterior corrigida |
| `ts` | integer | sim | UTC ms |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09:** somente `owner` / `isModerator` publica, atualiza `decisionStatus` (via nova versão com maior `ts` para o mesmo `assemblyId` ou `cancels`) ou corrige a ata no mural.
- **Conferência offline:** ao abrir ou importar o JSON completo da ata do `PM-23`, o aparelho recalcula o SHA-256 canônico e compara com `ataHash`, exibindo selo verde ("Ata confere com o mural") ou alerta vermelho ("Hash diverge do mural").
- **Orçamento de shell (`LAN-23`):** reutiliza o cartão de mural já existente + folha lazy de conferência de hash (meta `<= 4 KB` gzipped fora de `SHELL_ASSETS`).

---

### 3.4 Lote 8 — Mural de documentos e links verificados (`biblioteca-local`)

**Objetivo:** manter um mural fixo com até 12 documentos ou links oficiais da comunidade (estatuto, edital, regimento, ata pública) assinados pela moderação, evitando links adulterados no WhatsApp.

**Formato wire (`sigv: 2`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"biblioteca-local"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único (`bib_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `title` | string | sim | 4 a 80 caracteres (ex.: `"Documentos da Associação"`) |
| `revision` | integer | sim | Inteiro `>= 1`, monotônico por comunidade |
| `items` | array | sim | 1 a 12 objetos `{ label (2–60), url (opcional, estritamente `https:`), docHash (opcional, SHA-256), note (opcional, <= 80) }`; cada item exige ao menos `url` ou `docHash` |
| `ts` | integer | sim | UTC ms |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09:** somente `owner` / `isModerator` pode publicar. Entre registros válidos da mesma `communityId`, vence o de maior `(revision, ts)`.
- **Sanitização estrita:** na leitura, qualquer item com esquema diferente de `https:` (`http:`, `javascript:`, `data:`, `blob:`) é descartado ou marcado inválido sem renderizar link clicável. Nenhum arquivo binário trafega no gossip (apenas `url` e/ou `docHash`).
- **Orçamento de shell (`LAN-23`):** componente lazy fora de `SHELL_ASSETS` (meta `<= 4 KB` gzipped).

---

### 3.5 Lote 9 — Consulta pré-pauta (`consulta-pauta`)

**Objetivo:** coletar prioridades e sugestões de temas para a próxima assembleia de forma simples e auditável, **sem peso de voto** e sem dependência de aval anti-Sybil (`F8`).

**Formato wire (`sigv: 2`) — Abertura (`consulta-pauta`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"consulta-pauta"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único (`cp_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `title` | string | sim | 8 a 80 caracteres |
| `topics` | array | sim | 2 a 10 objetos `{ topicId (2–24), label (4–80) }` |
| `maxSelect` | integer | sim | `1` a `3` (quantos temas cada pessoa pode priorizar) |
| `allowSuggestions` | boolean | sim | Se aceita texto livre curto (`suggestedTopic`) |
| `closesAt` | integer | sim | UTC ms (`> ts`) |
| `cancels` | string | não | `id` de consulta cancelada |
| `ts` | integer | sim | UTC ms |
| `sigv` | integer | sim | `2` |

**Formato wire (`sigv: 2`) — Participação (`consulta-pauta-voto`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"consulta-pauta-voto"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único |
| `communityId` | string | sim | Deve coincidir com a consulta |
| `consultaId` | string | sim | `id` da `consulta-pauta` |
| `selectedTopicIds` | array | sim | `1` a `maxSelect` IDs únicos presentes em `topics` |
| `suggestedTopic` | string | não | Até 80 caracteres; só aceito quando `allowSuggestions === true` |
| `ts` | integer | sim | UTC ms (`<= closesAt`) |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09 e corte de F8:**
  - Só `owner` / `isModerator` abre ou cancela `consulta-pauta`.
  - Cada `author` tem peso fixo `1` (proibido campo `weight` ou multiplicador por voxels/F8). Vale a resposta mais recente antes de `closesAt`.
  - A apuração exibe separado: "Membros da comunidade" (`membership` válido) e "De fora da comunidade", deixando explícito na UI que é **consulta consultiva de pré-pauta**, não deliberação vinculante.
- **Orçamento de shell (`LAN-23`):** módulo lazy fora de `SHELL_ASSETS` (meta `<= 5 KB` gzipped).

---

### 3.6 Lote 10 — Fechamento e arquivo de ciclo (`fechamento-ciclo`)

**Objetivo:** consolidar os artefatos assinados de um ciclo organizacional (avisos, contas, escalas, atas, biblioteca e consultas) num manifesto verificável pronto para exportação HTML offline-forever ([`export-html-backup.mjs`](../../scripts/export-html-backup.mjs), **EXP-04**).

**Formato wire (`sigv: 2`):**

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `type` | string | sim | `"fechamento-ciclo"` |
| `version` | integer | sim | `1` |
| `id` | string | sim | ID único (`fc_…`) |
| `communityId` | string | sim | Comunidade alvo |
| `cycleLabel` | string | sim | 3 a 32 caracteres (ex.: `"2026-Q4"`) |
| `startedAt` | integer | sim | UTC ms |
| `closedAt` | integer | sim | UTC ms (`>= startedAt`) |
| `refs` | array | sim | 1 a 64 objetos `{ type: string, id: string, sha256: string }` apontando para objetos válidos dos Lotes 1–9 / `PM-23` da mesma `communityId` |
| `bundleHash` | string | sim | SHA-256 do JSON canônico (`sortDeep`) do array `refs` ordenado por `(type, id)` |
| `exportFormat` | string | sim | Enum: `"exp-04-html-v1"` \| `"json-bundle-v1"` |
| `notes` | string | não | Até 280 caracteres |
| `ts` | integer | sim | UTC ms (`>= closedAt`) |
| `sigv` | integer | sim | `2` |

- **Autoridade PM-09:** somente `owner` / `isModerator` publica o fechamento.
- **Integração com `EXP-04`:** o exportador HTML estático (`ARCHIVE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:;"`) empacota os objetos locais correspondentes a `refs`, verifica cada `verifyPayload` e cada `sha256` contra `bundleHash`, e marca explicitamente eventuais itens ausentes no aparelho ("item referenciado não disponível neste aparelho").
- **Orçamento de shell (`LAN-23`):** fluxo de exportação carregado sob demanda (import dinâmico fora de `SHELL_ASSETS`, meta `<= 6 KB` gzipped).

---

## 4. Critério de abandono no piloto G1 e portão de entrega

Em coerência com o [aviso-assinado-v0.md](./aviso-assinado-v0.md), a [síntese da praça de colunas](../brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) e o [critério de go/no-go do piloto](../pilot/piloto-comunidade-go-no-go.md):

1. **Pré-condição de código:** os Lotes 5–10 **não** são implementados antes do resultado do piloto **G1** sobre o núcleo v0 (lotes A–D e 1–4).
2. **Critério explícito de abandono:**
   - Se, ao fim da janela do piloto **G1**, **menos da metade (`< 50%`) dos membros ativos do grupo piloto** responder às convocações assinadas, **ou** nenhuma comunidade piloto completar **dois ciclos organizacionais consecutivos** com registro conferível sem intervenção manual da equipe:
     - **os Lotes 5–10 são abandonados/congelados** (não entram no código nem no precache, e eventuais protótipos permanecem desligados atrás de `vox.lab.aviso`);
     - o produto recua o foco da praça para enquete/texto simples no WhatsApp + conferência mínima do v0.
3. **Critério de avanço:** atingido o piso do G1, cada lote entra em PR isolado, mantendo `npm run validate` verde, `audit:docs` com `0` achados novos, `shell-budget-check.mjs` dentro do orçamento `LAN-23` e limites de [HARDENING](../HARDENING.md).

---

## 5. Plano de testes e Definition of Done (`DoD`)

### 5.1 Matriz mínima de testes (futuros PRs por lote)

| Lote | Casos obrigatórios em `tests/` |
|---|---|
| **Lote 5 (`prestacao-contas`)** | Recusa sem `sigv: 2`; rejeição de `author` não-moderador (PM-09); soma de `categories` consistente; recusa/alerta de PII/Pix DICT; `cancels` substitui apenas se for de moderação |
| **Lote 6 (`escala-turnos`)** | Conflito de última vaga determinístico `(ts, id)`; troca voluntária `swap-offer`/`swap-accept` assinada pelos dois; ausência total de ranking punitivo; expiração após `expiresAt` |
| **Lote 7 (`ata-assembleia`)** | Conferência de `ataHash` contra ata `PM-23` (verde quando bate, vermelho quando diverge); transição de `decisionStatus` só pela moderação |
| **Lote 8 (`biblioteca-local`)** | Limite de 12 itens; bloqueio estrito de URLs não-`https:` (`javascript:`, `data:`, `http:`); precedência por `(revision, ts)` |
| **Lote 9 (`consulta-pauta`)** | Rejeição de qualquer campo de peso/F8; separação membros vs fora da comunidade; limite `maxSelect` (`1..3`); recusa após `closesAt` |
| **Lote 10 (`fechamento-ciclo`)** | Verificação de `bundleHash` sobre `refs` ordenados; sinalização honesta de item ausente; saída compatível com CSP do `EXP-04` (`default-src 'none'`) |
| **Transversais** | `shell-budget-check.mjs` (`LAN-23`) sem regressão no shell crítico; `audit:layers` (`ADR-035`) e `audit:complexity` (`HARDENING.md`) verdes |

### 5.2 DoD desta fase (`doc`)

- Spec revisada para Lotes 5–10 com schema `sigv: 2`, regras PM-09, orçamento `LAN-23` e critério de abandono G1 explícito.
- Link cruzado registrado em [aviso-assinado-v0.md](./aviso-assinado-v0.md) e `npm run audit:docs` aprovado (`0` achados novos).
