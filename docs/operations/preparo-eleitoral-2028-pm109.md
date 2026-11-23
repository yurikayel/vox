# Preparo para as Eleições Municipais de 2028 (PM-109)

> **Status:** rascunho · **Owner:** mantenedor / steward ops · **Revisado:** 2026-11-22
> Não substitui o [ROADMAP](../ROADMAP.md). Auditoria técnica do modo eleitoral (**REV-24**) face às eleições municipais brasileiras de 2028, com lacunas a fechar antes de **16/08/2028** e revisão regulatória obrigatória agendada para **depois de 05/03/2028** (prazo legal do TSE pela Lei nº 9.504/1997, art. 105).

---

## 1. O que já está implementado e testado hoje (`REV-24`)

A auditoria direta do código atual mostra que a base mínima de neutralidade algorítmica já está em produção no cliente, com baseline declarada na **Resolução TSE 23.755/2026** (que alterou a Res. TSE 23.610/2019 — resumo em [pesquisa-complementar §1-B4](../research/pesquisa-complementar-2026-11.md)):

1. **Janela automática por ano par (`client/js/electoral-period.js`):**
   - `isInElectoralWindow(date = new Date())` verifica se `date.getFullYear() % 2 === 0` (cobre automaticamente 2026, 2028, 2030…).
   - Retorna `true` entre `new Date(y, 7, 16)` (**16/08 às 00:00:00** no fuso local do aparelho) e `new Date(y, 9, 31, 23, 59, 59)` (**31/10 às 23:59:59** no fuso local).
2. **Sobrescrita remota em `client/config/flags.json` (`client/js/feature-flags.js`):**
   - A chave raiz `"electoralMode": false` (fora do objeto `flags`) é sanitizada por `sanitizeFlags()` e exposta por `isElectoralModeForced()`.
   - `isElectoralModeActive(date, { forced })` retorna `Boolean(forced) || isInElectoralWindow(date)`, permitindo antecipar ou prolongar o modo eleitoral por deploy do `flags.json` (arquivo fora do precache do Service Worker, conforme [runbook-incidentes.md](./runbook-incidentes.md)).
   - O mesmo `flags.json` também provê `"notice"` (até 280 caracteres), exibido no topo via `renderOpsNotice()` em [`client/js/render/shell.js`](../../client/js/render/shell.js).
3. **Feed puramente cronológico e supressão de recomendações (`client/js/render/feed-chrome.js`):**
   - O feed do Vox já ordena postagens por horário de assinatura, sem ranqueamento por engajamento nem leilão de impulsionamento.
   - Em `renderBskySuggestionsRow()`, quando `isElectoralModeActive()` é `true`, os botões de `"Sugestões cívicas"` (que hoje trazem perfis fixos políticos e jornalísticos) são removidos e substituídos pela nota:
     > *"Período eleitoral: o Vox não sugere perfis nem ranqueia conteúdo político (Res. TSE 23.755/2026)."*
   - O módulo experimental de ranqueamento por pontes de consenso ([`client/js/labs/parado/bridging-rank.js`](../../client/js/labs/parado/bridging-rank.js)) está isolado em `labs/parado/`, fora do app principal.
4. **Cobertura automatizada existente:**
   - [`tests/electoral-period.test.js`](../../tests/electoral-period.test.js) verifica 2 casos: fronteiras da janela `16/08–31/10` em 2028 vs. 2027 (ano ímpar) e acionamento via `{ forced: true/false }`.

---

## 2. Auditoria de lacunas para as eleições municipais de 2028

A base atual atende ao corte mínimo do `REV-24` ("não sugerir perfis nem ranquear conteúdo"), mas **não basta sozinha** para a realidade operacional de uma eleição municipal em 5.570 municípios. Cinco lacunas precisam ser fechadas antes de **16/08/2028**:

### Lacuna 1 — Fronteiras do 2º turno municipal, precisão de fim de dia e prorrogação pós-31/10

- **Calendário esperado de out/2028:** pela regra constitucional (1º domingo de outubro para 1º turno; último domingo de outubro para 2º turno), outubro de 2028 tem 1º turno em **01/10/2028** e eventual 2º turno em **29/10/2028** — datas exatas **a confirmar** após a publicação do calendário oficial do TSE.
- **Brecha no código atual:** `31/10/2028` cobre `29/10/2028`, porém `new Date(y, 9, 31, 23, 59, 59)` termina em `23:59:59.000` (excluindo `23:59:59.001–999`), usa o relógio local do aparelho (vulnerável a fuso/relógio desajustado) e **não cobre automaticamente** eventual eleição suplementar, decisão judicial de direito de resposta em novembro ou mudança excepcional de calendário pelo TSE.
- **Ação necessária:** corrigir a fronteira final para `ms` inclusivo (`< 01/11 00:00:00` ou `23:59:59.999`), avaliar referência em horário de Brasília (`America/Sao_Paulo`, UTC-3) para evitar virada prematura no Acre/Amazonas ou fora do país, e documentar o uso de `electoralMode: true` em `flags.json` como extensão manual quando necessário.

### Lacuna 2 — Pré-campanha, propaganda antecipada e enquetes antes de 16/08/2028

- **Problema:** a janela automática só dispara em `16/08` (marco legal da propaganda eleitoral na Lei nº 9.504/1997, art. 36), mas disputas municipais começam meses antes (convenções entre julho e agosto, pré-campanha e vedações a pedido explícito de voto e enquetes não registradas).
- **Superfícies no Vox:**
  - `Sugestões cívicas` em [`feed-chrome.js`](../../client/js/render/feed-chrome.js) exibe perfis políticos/editoriais fixos fora da janela eleitoral;
  - Enquetes e votações comunitárias (**PM-23** modo assembleia) e futuras telas de descoberta não possuem distinção entre votação interna de associação/condomínio e enquete pública de intenção de voto (que sofre restrição específica na legislação eleitoral).
- **Ação necessária:** revisar na política de comunidades/Termos (`LAN-02`) a proibição de uso de enquetes abertas para sondagem eleitoral no período vedado e avaliar neutralização ou remoção da lista fixa de perfis políticos de `Sugestões cívicas` antes mesmo de 16/08/2028.

### Lacuna 3 — Rotulagem de mídia sintética / IA e eventual retorno de módulos de ordenação

- **Baseline normativa:** segundo o resumo da Res. TSE 23.755/2026 em [pesquisa-complementar §1-B4](../research/pesquisa-complementar-2026-11.md), há exigência de rotulagem de conteúdo eleitoral gerado ou substancialmente alterado por IA e previsão de remoção de conteúdo sintético após ordem judicial.
- **Estado no código:** o compositor atual e a spec de mídia v2 (**PM-71**) não oferecem campo explícito/opt-in para o autor declarar mídia sintética/IA, e o projeto ainda depende do parecer jurídico (**REV-12**) e do fluxo de ocultação assinada (**LAN-04** / **LAN-13**) para responder a ordens judiciais eleitorais dentro do prazo legal.
- **Ação necessária:** (a) se `bridging-rank.js` ou qualquer ordenação não cronológica sair de `labs/parado/` até 2028, exigir trava direta com `isElectoralModeActive()` + teste unitário bloqueante; (b) após a revisão de março/2028, decidir se o compositor deve incluir marcação voluntária de conteúdo gerado por IA; (c) garantir que o fluxo `LAN-04` / `LAN-13` contemple cumprimento de ofício da Justiça Eleitoral no PWA oficial.

### Lacuna 4 — Escopo municipal (comunidades locais, câmaras e pressão sobre stewards)

- **Diferença de 2026 para 2028:** eleições gerais polarizam no plano nacional/estadual; eleições municipais atingem diretamente o tecido local onde o Vox pretende operar (associações de bairro, escolas de adultos, agricultura familiar, conselhos e eventuais painéis legislativos municipais como SAPL / **PM-38**).
- **Riscos específicos:**
  - Cooptacão de comunidades locais (`PM-09`) por campanhas a prefeito ou vereador;
  - Exposição pessoal de moderadores e stewards locais a representações eleitorais na comarca caso não haja regra clara de comunidade (`LAN-02`), canal de notificação (`REV-20`) e entidade/representação resolvida (`REV-18`);
  - Desatualização de [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md) (que ainda cita apenas a Res. TSE 23.610/2019 sem incorporar a 23.755/2026 nem as instruções de 2028 — pendente em **LAN-03**).
- **Ação necessária:** fechar `LAN-03` antes de 2028 e incluir orientação curta para moderadores de comunidades sobre período eleitoral municipal (sem censura prévia de opinião cidadã, mas com regra clara sobre disparo, identidade falsa e atendimento a ordens judiciais).

### Lacuna 5 — Copy global de `notice` e ensaio operacional do kill-switch (`flags.json`)

- **Estado atual:** fora da linha de sugestões do Bluesky, nenhuma outra tela exibe automaticamente aviso durante a janela eleitoral, e o campo `"notice"` em [`client/config/flags.json`](../../client/config/flags.json) está vazio (`""`), sem texto pré-aprovado e sem simulado registrado.
- **Ação necessária:** preparar copy padrão (≤ 280 caracteres) para o `"notice"` de período eleitoral e executar **pelo menos um simulado datado** ligando `"electoralMode": true` + `"notice"` em ambiente de teste/homologação, validando atualização com Service Worker ativo e retorno ao estado normal.

---

## 3. Marco obrigatório de revisão: depois de `05/03/2028`

Pela Lei nº 9.504/1997 (art. 105), o TSE deve expedir todas as instruções para as eleições municipais de 2028 até **5 de março de 2028**. Portanto, fica marcado um **checkpoint bloqueante entre 06/03/2028 e 31/03/2028** (antes da entrada em vigor das mudanças operacionais de T2/T3 de 2028):

1. **Leitura integral das resoluções do TSE de 2028** (especialmente sucessoras/atualizações da Res. 23.610/2019 e Res. 23.755/2026 sobre propaganda na Internet, IA, impulsionamento, enquetes, direito de resposta e deveres de provedores).
2. **Conferência do calendário oficial TSE 2028:** confirmar datas exatas de convenções, início de propaganda, 1º turno, 2º turno e prazos de remoção/direito de resposta; atualizar `client/js/electoral-period.js` se a janela `16/08–31/10` precisar de ajuste.
3. **Auditoria de código e módulos plugados:** verificar se algum módulo de `labs/parado/` (ex.: `bridging-rank.js`), painel municipal (`PM-38`/SAPL) ou descoberta de comunidades passou para produção sem respeitar `isElectoralModeActive()`.
4. **Atualização documental (`LAN-03` / `REV-20`):** alinhar [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md), `privacy.html` e orientações aos stewards ao texto de 2028.
5. **Ensaio do kill-switch até `31/07/2028`:** testar `electoralMode: true` + `notice` no `flags.json`, confirmar que clientes online/offline recebem e aplicam na recarga e validar o texto do aviso antes de `16/08/2028`.

---

## 4. Checklist executivo de prontidão (2027 → 16/08/2028)

| # | Ação | Tipo (DoD) | Prazo alvo | Critério de pronto |
|---|---|---|---|---|
| 1 | Fechar `LAN-03` incorporando Res. TSE 23.755/2026 em [COMPLIANCE-BR.md](../legal/COMPLIANCE-BR.md) | `doc` | Junto do `G2` (2027) | Texto atualizado com fontes primárias |
| 2 | Garantir trava `isElectoralModeActive()` caso `bridging-rank` ou ordenação equivalente saia de `labs/parado/` | `code` | Antes de plugar | Teste automatizado reprova ranqueamento na janela eleitoral |
| 3 | **Revisão pós-05/03/2028:** ler instruções TSE 2028 e confirmar calendário oficial | `ops-humano` + `doc` | Mar/2028 | Este doc atualizado para `canônico` com links das resoluções de 2028 |
| 4 | Ajustar precisão de fim de janela (`23:59:59.999` / fuso BR) e eventual extensão em `electoral-period.js` | `code` | Abr–jun/2028 | `tests/electoral-period.test.js` atualizado e verde |
| 5 | Avaliar exigência de rótulo de IA / protocolo eleitoral em `LAN-04` e `LAN-13` | `doc` + `code` | Jun/2028 | Decisão registrada + fluxo testado se aplicável |
| 6 | Definir copy padrão do `notice` (≤ 280 chars) e realizar simulado datado de `electoralMode: true` em `flags.json` | `ops-humano` | Até 31/07/2028 | Registro do simulado com data e verificação de SW |
