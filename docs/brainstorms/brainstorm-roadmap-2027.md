# Brainstorm — o ano de 2027 (roadmap e backlog de doze meses)

> **Status:** brainstorm · **Owner:** mantenedor · **Revisado:** 2026-11-12 · **Não substitui o [ROADMAP](../ROADMAP.md)** ([ADR-017](../adr/017-consolidacao-roadmap-unico.md)). O calendário por trimestre e as linhas novas (PM-99…PM-109) moram no ROADMAP, em [Calendário 2027](../ROADMAP.md#calendário-2027). Aqui ficam as ideias, a triagem e o porquê.
> **Origem:** o ROADMAP de 12/11/2026, o [caminho até a rede pública](../strategy/backlog-lancamento-publico-2026-11.md), o [plano de 90 dias](../strategy/estrategia-5-pontos-fracos-90-dias-2026-11.md), a [síntese da praça de colunas](./brainstorm-sintese-praca-de-colunas-2026-11-10.md) e duas conversas do mantenedor em 12/11/2026: a sujeira de contas de teste no navegador e a hierarquia dos memes ("feudalismo memético"). Nada foi enviado a ninguém.

## A pergunta

O que precisa ser verdade em dezembro de 2027 para o Vox ser usado por organizações reais e continuar de pé se o mantenedor sumir por um mês?

## Resumo

- **2027 é o ano de sair do laboratório.** O código está à frente da rede: os portões G1, G2 e G3 travam em gente (parecer, piloto, segunda pessoa, stewards), não em tela.
- **Ordem do ano:**
  - T1: piloto na temporada de assembleias;
  - T2: parecer e beta;
  - T3: beta por convite, com as cópias dos seguidores;
  - T4: decisão sobre o público e preparo de 2028.
- **Cada trimestre tem uma data de desistência.** Quando o que é humano não chega, o plano muda de rota em vez de empurrar a data.
- **Backlog:** 11 linhas novas (PM-99…PM-109) e 4 promovidas do [brainstorm de melhorias](./brainstorm-backlog-proximas-melhorias-2026-11.md): PM-01, PM-13, PM-18 e PM-23. O resto fica como candidata.
- **2027 não tem eleição.** É o melhor ano para crescer em uso comunitário. O período eleitoral municipal começa em 16/08/2028, e o T4 prepara isso.

## 1. O norte de dezembro de 2027

O **piso** é o mínimo para chamar o ano de bem-sucedido. A **meta** é o que dá para alcançar se as pessoas aparecerem. Tudo é medido sem telemetria central, como manda a [síntese §10](./brainstorm-sintese-praca-de-colunas-2026-11-10.md#10-métricas).

| Eixo | Piso | Meta | Como medir |
|---|---|---|---|
| Uso | 1 coluna de pé: 3 organizações, dois ciclos seguidos, com registro que qualquer um confere | 2 colunas de pé | Registros públicos e assinados (ata, mural, livro-caixa) |
| Rede sem dono | Sinalização em 2 caminhos que não dependem só do mantenedor (Nostr e um segundo nó) | Relay completo e TURN operados por um steward de fora | `client/config/signaling.json` e página de status (LAN-07) |
| Gente | Bus factor 2 em código e no Render (LAN-30, parte do G1) | LAN-30 completo e 3 stewards de fora | Acessos listados em [segunda pessoa](../process/segunda-pessoa-acesso-gradual.md) |
| Jurídico | Parecer em mãos e G2 aberto | G3 decidido, com go ou no-go escrito (LAN-29) | Linhas do ROADMAP com evidência |
| Dinheiro | Custo do mês publicado em todo relatório trimestral (PM-103) | 12 meses cobertos (LAN-32) por uma fonte que não seja o bolso do mantenedor | Relatório trimestral |
| Prova técnica | Dois navegadores se conectam e trocam um post no CI em todo PR (PM-99) | Disponibilidade de post com autor offline medida em campo (PM-75) | CI e relatório do beta |

## 2. O que já está dado

### 2.1 Datas fixas

| Data | O que acontece | Efeito no ano |
|---|---|---|
| 24/11/2026 | Os aparelhos passam a assinar no formato v2 (`SIGV2_FROM` em `client/js/sig-format.js`) | Em 2027 dá para fechar a convivência com o v1 nos itens novos (PM-102) |
| 02/01/2027 | Submeter ao NLnet (prazo: 03/01/2027, 12:00 CET) | LAN-36. Se aprovado, os marcos M1–M8 da [proposta](../strategy/proposta-nlnet-restack-2027.md) viram trabalho pago por entrega |
| Começo de 2027 | Condomínios fazem a assembleia anual que aprova orçamento e contas (Código Civil, art. 1.350), e muitas associações seguem o mesmo ritmo | Janela da cunha do piloto: modo assembleia (PM-23) |
| Fev e ago/2027 | Começam os semestres letivos | Coluna 3 (escola, só adultos) e coluna 8 (universidades) entram por semestre |
| 2027 | Ano sem eleição | Crescer em uso comunitário longe do modo eleitoral |
| 05/03/2028 | Prazo para o TSE publicar as instruções das eleições de 2028 (Lei 9.504/1997, art. 105) | O PM-109 prepara o que der em 2027 e marca a revisão para março de 2028 |
| 16/08/2028 | Começa o período eleitoral municipal (janela do `client/js/electoral-period.js`, que já cobre anos pares) | O que for cívico e público precisa estar estável antes |

### 2.2 Gargalos

- **Gente, não código.** Das linhas abertas do G1, quatro são código: PM-79, PM-83, PM-96 e PM-97, que já roda em lab. As outras, mais o PIL-01 que o portão exige, são humanas: parecer contratado, segunda pessoa, divulgação de falhas, confirmação da postura do piloto e comunidade nomeada.
- **Bytes.** O teto do precache em `tests/shell-reachability.test.js` não tem folga: cada tela nova precisa pagar o próprio peso. Por isso o **PM-01 (dieta do shell) vem antes de qualquer feature grande**.
- **Uma pessoa com agentes.** No máximo duas frentes de código ao mesmo tempo, cada uma com o [mutex de arquivos](../process/metodo-agentes-mutex-e-revisor.md). O que é humano não se paraleliza.

## 3. Brainstorm por eixo (sem filtro)

Ideias marcadas **nova** não estavam em nenhum doc. As outras já têm ID e só ganham lugar no ano.

### A. Gente e governança

1. Segunda pessoa com acesso em etapas (LAN-30, [roteiro](../process/segunda-pessoa-acesso-gradual.md)).
2. Steward de fora e a escada de contribuição: piso de 2 por comunidade antes do G1 (PM-53) e smoke por outra pessoa (NET-04).
3. Porta de entrada para contribuidor: 10 issues ([primeiras tarefas](../process/primeiras-tarefas-contribuidor.md), PM-41), código de conduta (PM-63) e devcontainer (PM-64).
4. **nova** — Turma de extensão por semestre (coluna 8). Um professor parceiro, um pacote de issues e um nó por turma. Resolve gente, parecer universitário e o parceiro do ADR-018 de uma vez.
5. **nova** — Relatório trimestral "Estado da praça". Traz:
   - custo do mês em R$;
   - incidentes;
   - decisões de moderação agregadas (PM-31);
   - disponibilidade;
   - o que travou;
   - como estão as datas de desistência.

   É a base do relatório anual de transparência (REV-20), dos editais e da revisão do calendário.
6. Associação ou PJ (REV-18), decidida depois do parecer.

### B. Jurídico e confiança pública

1. Parecer (REV-12, LAN-01) e o que depende dele: Termos (LAN-02), privacidade e ECA Digital (LAN-03), autorregulação (REV-20) e conteúdo grave (LAN-04).
2. **nova** — "Garantia da praça". Uma página curta, no app e no repositório, que diz duas coisas:
   - O que ninguém pode fazer com a sua conta, nem o projeto: apagar de fora e ler DM.
   - O que cada um pode fazer:
     - ocultar no próprio aparelho;
     - a moderação, ocultar na comunidade;
     - o PWA oficial, ocultar por uma lista assinada e pública (LAN-13), que outro espelho pode não seguir.

   Isso transforma a dificuldade de calar uma conta em promessa explícita, com o contrapeso dito junto: ninguém derruba ninguém, e o que equilibra é contexto e ocultação local, não remoção. A redação passa pelo parecer.
3. Revisão externa de cripto (LAN-18), paga pelo marco M5 do NLnet ou feita por parceiro universitário.

### C. Rede sem dono

1. Segundo nó de sinalização no Cloudflare Durable Object (REV-01).
2. Medir o Nostr em campo e só então aposentar o keepalive do Render (REV-09, PM-18).
3. **nova** — Teste de dois navegadores no CI: dois Chromium sem tela se conectam por Nostr e por WebSocket e trocam um post assinado. O plano de 90 dias pedia isso e hoje não existe; transforma "a malha funciona" em evidência a cada PR.
4. TURN com orçamento (REV-10) e modo "privacidade de IP" (LAN-19).
5. Relay completo operado por steward (REV-04): DM offline, cofre, `/oauth/exchange`.
6. Página de status (LAN-07), espelhos que se conferem sozinhos (PM-19, PM-20) e drill de DR (NET-02).
7. **Cópias dos seguidores** ([ADR-030](../adr/030-trazer-do-bluesky-pesos.md), [replicação por grau](../specs/replicacao-por-grau-v0.md)): armazenamento durável (PM-72), replicação por grau (PM-74), métrica de disponibilidade (PM-75), mochila de DMs (PM-79) e guardião na tomada (REV-15). É a tese de preservação: quem segue guarda, e o Arweave é só cartório.
8. Mídia v2 (PM-70, PM-71, PM-77), depois de decidir a CSP para o codificador em WebAssembly.

### D. Produto para quem organiza (a praça de colunas)

1. Aviso assinado para todos (PM-97), depois do G1.
2. Modo assembleia (PM-23): pauta, presença assinada, votação com prazo e ata exportável. É a cunha escolhida em 10/11.
3. As outras peças da síntese: mural, ata com resumo falado, modelos de grupo (`kit-genesis.js`), missão, livro-caixa (PM-33), mutirão (PM-58), agenda com `.ics` (PM-25), do voto ao ofício (PM-57) e sorteio cívico (PR #92).
4. Moderador natural (PM-83, PR #94).

### E. Circulação honesta (da conversa sobre memes)

No Vox o alcance é repasse de pessoa a pessoa, sem algoritmo. Os três papéis da hierarquia dos memes já existem: quem cria, quem repassa e quem recebe. Falta três coisas: ver a origem, baixar o custo de criar e chegar onde os outros estão sem perder a origem. **Neutralidade:** a ferramenta serve igual a qualquer lado. Usá-la por uma causa é trabalho de comunicação, não do produto.

1. **nova** — Árvore do repasse. Mostra de onde o post veio: quem criou e por quem ele passou até chegar a você.
   - Só aparecem os saltos que você já enxerga, sem expor o grafo (a mesma regra da replicação por grau).
   - Base: o repost assinado (`client/js/render/repost-cite.js`).
2. **nova** — Estúdio de cartões no compositor. Modelos de imagem com texto, feitos no aparelho e assinados como qualquer post.
   - Tira do barão o monopólio de "fazer bem feito".
   - Base: `client/js/story-card.js`.
   - Custa bytes, então só entra se o PM-01 abrir espaço.
3. **nova** — Caminho de volta do POSSE. O link levado ao WhatsApp, ao X ou ao Bluesky abre no Vox o original, com a assinatura conferida e a conversa, sem pedir conta. Junta o PM-54 (ler antes de entrar) e o PM-55 (prévia de link). Hoje o meme chega ao grupo da família sem dono; assim ele chega com origem.
4. Notas de contexto por ponte (F7), só depois do selo por aval (F8, anti-Sybil).
5. Resumo semanal para o grupo (F10) e rotuladores assinados (PM-59).

### F. Identidade e chaves

1. **nova** — Modo ensaio. Uma conta de teste que não sai do aparelho:
   - não entra no gossip, na memória central, no Arweave nem no POSSE;
   - tem uma faixa "Ensaio" sempre visível;
   - tem um botão para apagar tudo.

   A gênese limpou a sujeira de antes de 12/11, com purga no aparelho e recusa nos servidores (PRs #98 e #102). O modo ensaio evita a sujeira de depois.
2. **nova** — Lápide de conta. O dono assina "esta conta foi encerrada", e aparelhos e servidores passam a esconder o perfil e os posts e a não repassar mais nada dela.
   - Hoje só existe lápide de post (`postOwnership.createPostTombstone`).
   - Com o cartão de recuperação (PM-13), funciona também quando a chave se perdeu num navegador limpo.
   - Sem chave e sem cartão não há como encerrar a conta. Esse é o preço de ninguém poder calar uma conta, e a "Garantia da praça" (B2) diz isso.
3. Revogar e trocar a chave com o cartão QR (PM-13, REV-14).
4. Recuperação pela comunidade: k de n membros assinam a troca, com 72 h de espera e veto da chave antiga ([terceiro lugar](./brainstorm-terceiro-lugar-2026-11-10.md)). Mexe com chave, então depende do LAN-18.
5. Sessão do Bluesky cifrada no aparelho (PM-96).
6. **nova** — Fechar a convivência v1. Itens criados depois do corte só valem assinados em v2, e o v1 fica para o legado. A regra e a margem ficam na spec, revisadas no LAN-18.
7. Selo por aval (F8) e aval que tira da quarentena (PM-29).

### G. Leveza, acesso e alcance

1. Dieta do shell (PM-01) e minificar só no deploy (PM-03).
2. WCAG 2.2 AA (LAN-22), Android de entrada (LAN-23), economia de dados (PM-26) e ouvir post (PM-27).
3. Tirar as strings do código (PM-40): espanhol só em 2028.
4. Onboarding com 5 leigos (LAN-25).

### H. Dinheiro

1. NLnet (LAN-36) e GitHub Sponsors (REV-22).
2. Vaquinha transparente (F4), só depois do parecer (CDC e Pix).
3. Orçamento de 12 meses (LAN-32).
4. **nova** — Editais brasileiros de tecnologia social, extensão e inovação cívica. Mapear prazos e elegibilidade de quem não tem CNPJ, e se candidatar com o relatório do piloto.

### I. Calendário cívico de 2028

1. **nova** — Preparar 2028:
   - o que o modo eleitoral (REV-24) já cobre numa eleição municipal;
   - o que falta;
   - quando reler a resolução do TSE (depois de 05/03/2028).
2. **nova** — Pauta municipal: a pauta legislativa automática (F9, PM-38) na versão câmara de vereadores. Conferir se o SAPL, sistema do Interlegis usado por câmaras municipais, tem API aberta. Só leitura e igual para todos os vereadores.
3. Neutralidade: nada de ranquear ou recomendar candidato (REV-24 já garante).

## 4. Triagem das ideias novas

Critérios:
- **Portão:** destrava G1, G2 ou G3?
- **Sem dono:** tira dependência do mantenedor?
- **Cunha:** serve a quem organiza, em pelo menos duas colunas?
- **Custo:** em R$ e em bytes do shell.

As ideias que já tinham ID entram direto no calendário do ROADMAP.

| Ideia | Portão | Sem dono | Cunha | Custo | Decisão |
|---|---|---|---|---|---|
| C3 Teste de dois navegadores | G1 (prova o REV-09) | alto | — | só CI, 0 byte | **PM-99**, dez/2026 |
| F1 Modo ensaio | — | médio (para de sujar a rede) | — | poucos bytes | **PM-100**, dez/2026 |
| F2 Lápide de conta | G2 (saída da conta nos Termos) | — | — | spec e pouco código | **PM-101**, T2 |
| F6 Fechar a convivência v1 | G2 (o LAN-18 revisa um formato só) | — | — | 0 byte | **PM-102**, T2 |
| A5 Relatório trimestral | G2 (base do REV-20) | alto | — | só doc | **PM-103**, primeiro em abr/2027 |
| B2 Garantia da praça | G2 (Termos) | — | — | só doc | **PM-104**, T2, depois do parecer |
| E3 Caminho de volta do POSSE | — | — | alto (vive no WhatsApp) | médio | **PM-105**, T2 |
| E1 Árvore do repasse | — | — | médio | médio; risco de expor o grafo | **PM-106**, spec no T3 |
| A4 Turma de extensão | G3 (gente) | alto | coluna 8 | 0 | **PM-107**, semestre 2027.2 |
| H4 Editais brasileiros | G3 (LAN-32) | alto | — | 0 | **PM-108**, T1 |
| I1 Preparar 2028 | — | — | todas as colunas | só doc | **PM-109**, T4 |
| E2 Estúdio de cartões | — | — | médio | alto em bytes | candidata, só se o PM-01 abrir espaço |
| I2 Pauta municipal | — | — | médio | médio | candidata, pesquisa no T4 |
| F4 Recuperação pela comunidade | G3 | médio | quem organiza | alto (cripto) | candidata, spec depois do LAN-18 |

**Promovidas a linha do ROADMAP**, porque o calendário depende delas: **PM-01** (dieta do shell, pré-condição de feature grande), **PM-23** (modo assembleia, cunha do piloto), **PM-18** (medição de campo, decide o REV-09) e **PM-13** (trocar a chave, base da lápide e da recuperação).

## 5. Por que esta ordem

- **Dezembro fecha o que está aberto e semeia o humano.**
  - Os PRs #92, #94 e #101 terminam.
  - O NLnet é submetido.
  - O briefing do parecer sai.
  - Começa a dieta do shell.

  Nada de feature grande, porque o T1 precisa de silêncio para o piloto.
- **T1 usa a temporada de assembleias.** O piloto com uma associação de verdade vale mais que qualquer tela. O critério de go do beta (LAN-28) é escrito antes, como manda o backlog de lançamento. Durante as 4 semanas de piloto o código congela.
- **T2 depende do parecer.** Termos, privacidade, autorregulação e conteúdo grave só podem ser escritos com ele. Entra também o que o piloto mostrar que falta, e a infra que o G2 exige (TURN, drill, página de status).
- **T3 é a primeira vez com centenas de pessoas.** Por isso é aqui que entram as cópias dos seguidores, a mochila de DMs e o guardião. Com uma comunidade só, ninguém saberia se funcionam. O segundo semestre letivo traz a turma de extensão e a coluna da escola.
- **T4 decide sem pressa.** O relatório do beta sai antes da decisão do público. O go só vale se sair até 15/11. Depois disso, a onda 2 fica para fevereiro de 2028, porque dezembro e janeiro não têm gente para o plantão. O ano fecha preparando 2028.

## 6. Riscos e datas de desistência

| Risco | Sinal | Data | Plano B |
|---|---|---|---|
| Sem associação ou sem segunda pessoa | PIL-01 ou LAN-30 vazio | 31/01/2027 | O piloto espera, porque não se passa do G1 com bus factor 1. O T1 adianta infra (REV-10, NET-02, PM-01), e a oficina "golpe não" (coluna 7) testa o aviso assinado sem piloto |
| Parecer não contratado | LAN-01 | 28/02/2027 | O G1 espera e o G2 vai para o T3. O T2 vira infra e cópias dos seguidores |
| NLnet recusa ou diz que não é elegível | resposta do NLnet | quando chegar | Sponsors e editais brasileiros (PM-108). LAN-18 por parceiro universitário |
| Nostr não se sustenta em campo | PM-18 ou REV-19 em queda | 30/04/2027 | Manter Render e o Durable Object (REV-01). O keepalive não é aposentado |
| Sem duas pessoas no plantão | LAN-04 | 30/06/2027 | O G2 não abre |
| Nenhum steward de fora | NET-04 | 30/09/2027 | O beta não passa da onda 1 |
| O peso trava as features | teto do precache | contínuo | Nada de tela nova antes do PM-01 |
| Cansaço do mantenedor | horas no relatório trimestral | todo trimestre | Cortar o eixo G antes dos eixos A e B (regra do plano de 90 dias) |

## 7. Fora de 2027 (corte deliberado)

- Play Store (PM-39), Vox Bridge MV3 (EXP-05 só decide) e Webxdc.
- Lightning, voto secreto (PM-56 fica em pesquisa), raiz diária MMR (PM-47) e reconciliação por intervalos (PM-49, só acima de ~1.000 itens por comunidade).
- Selo gov.br (REV-08), a menos que um parceiro público apareça.
- **Enquete cívica pública com peso.** Sem ela, o selo por aval (F8) e as notas por ponte (F7) podem esperar 2028.
- Espanhol. Em 2027 só sai a extração das strings (PM-40).
- Widget embed (EXP-02).

## 8. Decisões que dependem do mantenedor

1. Aceitar o norte (§1), com piso e meta, ou mudar os números.
2. Aceitar as datas de desistência (§6).
3. **A tabela do G1 mistura bloqueio com assunto vizinho.** Pelo PM-76, o piloto roda com DM só online e sem login social. Então a mochila de DMs (PM-79) e a sessão do Bluesky cifrada (PM-96) parecem não bloquear o G1. A proposta é tirá-las do G1: PM-96 vai para o T2 e PM-79 para o T3.
4. Escolher a segunda pessoa e a associação do piloto até 31/01/2027.
5. O PR #94 (moderador natural) estoura o teto de bytes. Decidir como ele paga o peso, porque o piloto precisa dele.

## Referências

Para conferir o texto vigente antes de usar em peça jurídica:

- Código Civil, art. 1.350 (assembleia anual do condomínio): <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm>
- Lei 9.504/1997, art. 36 (propaganda eleitoral depois de 15 de agosto) e art. 105 (instruções do TSE até 5 de março do ano da eleição): <https://www.planalto.gov.br/ccivil_03/leis/l9504.htm>
- SAPL, sistema de apoio ao processo legislativo do Interlegis: <https://github.com/interlegis/sapl> (API a confirmar no PM-109)
