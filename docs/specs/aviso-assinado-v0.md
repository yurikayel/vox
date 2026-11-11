# Aviso assinado (v0)

> **Status:** proposta, não implementada · **Owner:** mantenedor · **Revisado:** 2026-11-11
> Primeira peça da [síntese — a praça de colunas](../brainstorms/brainstorm-sintese-praca-de-colunas-2026-11-10.md) (§5 e §6). Junta numa peça o selo contra golpe, o "Ciente", o "Vou / Talvez" e o "Fixar no mural".
> Relacionados: [canal da comunidade (PM-81)](./canal-comunidade-v0.md), dono e moderação (PM-09, `moderation.js`), [integridade na entrada (ADR-021)](../adr/021-integridade-na-entrada-forma-assinada.md), forma assinada `sigv` (PM-85, `sig-format.js`), modo assembleia (PM-23), teste com 5 leigos (LAN-25).

## Problema

Quem organiza manda aviso pelo WhatsApp: convocação da assembleia, mudança de horário, alerta. Dois problemas se repetem:

1. **Golpe.** Qualquer um copia o nome e a foto do grupo ou de quem coordena e manda um aviso falso (cobrança, link, "reunião cancelada"). Quem recebe não tem como conferir.
2. **Quem viu e quem vai.** A confirmação se perde no meio da conversa. Quem organiza conta à mão, de memória.

O Vox já assina tudo o que publica, mas o membro típico do piloto não tem conta e não vai instalar nada (degrau 0 da [escada de esforço](../brainstorms/brainstorm-terceiro-lugar-2026-11-10.md#5-escada-de-esforço-do-membro)).

## Decisão

O aviso é um **tópico da comunidade com campos de aviso**, não um objeto novo, do mesmo jeito que o canal é um modo da comunidade (PM-81).

- **Quem publica:** dono ou moderação da comunidade (`isModerator`). O selo "📣 Aviso da coordenação" só aparece quando o autor é dono ou moderação segundo os metadados assinados da comunidade (PM-09). Tópico com campos de aviso de outra pessoa aparece como tópico comum, sem selo.
- **Por onde chega ao membro:** pelo WhatsApp, colado por quem organiza. **O texto inteiro do aviso vai na mensagem**; o link serve só para conferir.
- **Conferir:** uma página leve (`aviso.html`), sem o app, confere a assinatura no próprio celular de quem abre.
- **Responder:** quem tem conta responde assinado no app. Quem não tem responde no WhatsApp como já faz; quem organiza cola as respostas e o app conta.
- **Fixar:** o aviso válido mais recente fica no topo da comunidade até vencer.

Versões antigas do app mostram o aviso como um post comum. É a degradação que se quer.

## Formato

Tudo no topo do objeto, sem campo aninhado, para valer igual nas formas v1 e v2 da assinatura (PM-85).

**Aviso** (`type: "topic"`, assinado com `signPayload`):

| Campo | Regra |
|---|---|
| `communityId` | Obrigatório |
| `avisoKind` | `convocacao`, `informe` ou `alerta`. `cobranca` fica reservado e recusado até o parecer jurídico |
| `title` | 8 a 80 caracteres |
| `body` | Até 280 caracteres: aviso curto, como "a lista" |
| `eventAt` | Data e hora do encontro (ms). Obrigatório em `convocacao`, proibido nos outros tipos |
| `eventPlace` | Até 80 caracteres, opcional |
| `expiresAt` | Opcional. Padrão: `eventAt` + 1 dia, ou `ts` + 7 dias |
| `cancels` | Opcional: `id` de um aviso anterior da mesma comunidade que este cancela ou corrige |
| `authorAvatar` | Sempre `""`. Sem isso, `signPayload` acrescenta a foto do perfil e o link pode estourar o tamanho |

**Resposta** (`type: "aviso-resposta"`, assinada por quem tem conta): `communityId`, `avisoId`, `choice` (`ciente`, `vou`, `talvez` ou `nao-vou`). Vale a resposta mais recente de cada autor, como em `tallyCivicVotes`. Respostas de quem tem `membership` na comunidade contam no total. As outras aparecem à parte ("de fora da comunidade").

**Contagem colada** (`type: "aviso-contagem"`, assinada por dono ou moderação): `communityId`, `avisoId`, `countCiente`, `countVou`, `countTalvez`, `countNaoVou`, `countedAt`. Só números: nenhum nome, nenhum telefone.

**Códigos**, calculados na leitura e nunca assinados (qualquer aparelho chega ao mesmo resultado):

- **código do aviso:** 4 caracteres do SHA-256 da assinatura, em base32 sem letras ambíguas. Vai no texto do WhatsApp e casa a resposta com o aviso;
- **código de conferência da pessoa:** 6 caracteres do SHA-256 do `routeId` de quem assinou, em dois grupos (`K7M-29Q`). Quem organiza fala em voz alta na reunião ou põe na descrição do grupo.

## Regras na leitura

As regras valem em cada aparelho, na mesma função onde hoje vale a regra do PM-81 (ADR-021 §3):

1. **Assinatura válida** e autor igual à chave que assinou (`verifyPayload`).
2. **Selo de aviso** só para dono ou moderação. Sem isso, o tópico fica comum.
3. **`cobranca`** recusado (vira tópico comum, sem selo) até o parecer.
4. **`cancels`** só vale se o autor do cancelamento for dono ou moderação. O aviso cancelado mostra "Cancelado" com link para o novo.
5. **`aviso-contagem`** só de dono ou moderação. Vale a mais recente por aviso.
6. **Vencido** (`expiresAt` no passado) sai do topo e fica na lista com "Encerrado".

## Texto para o WhatsApp

Montado no aparelho e enviado por `shareOrCopy` (`share.js`). O Vox não manda nada sozinho: quem cola no grupo é a coordenação.

```
📣 *Aviso — Associação Vila Esperança*
*Assembleia sábado, 14h, no salão*
Pauta: reforma da quadra e contas do mês.
Responda aqui: ✅ Ciente · 🙋 Vou · 🤔 Talvez · ❌ Não vou
Código do aviso: A7F3
```

**O link de conferência não vai no aviso** (decisão de 11/11/2026, ver [Dilemas](#dilemas-registrados-em-11112026)). Quem coordena toca **Gerar link de conferência** quando quiser, e o link vai numa **segunda mensagem**, separada:

```
🔒 Conferir se o aviso A7F3 veio da coordenação: <link>
```

## Página leve de conferência (`aviso.html`)

> Usada só quando a coordenação gera o link, sob demanda (ver Dilemas).

- **Endereço:** `aviso.html#v=1&a=<aviso assinado em base64url>`. O aviso vai depois do `#`, que o navegador não manda ao servidor. Sem servidor, sem conta, e funciona depois de carregada sem internet.
- **Tamanho do link:** até 2.000 caracteres no `a=`. O composer avisa e bloqueia antes disso.
- **Peso da página:** meta de até 15 KB entre HTML, JS e CSS. Sem o shell do app, sem fontes externas. Não importa `local-account.js`: a verificação (`computeRouteId` e conferência ECDSA P-256) sai para um módulo pequeno, `signed-verify.js`. O `local-account.js` passa a reexportar dele, sem mudar comportamento.
- **Memória de confiança no aparelho**, a primeira confiança: `localStorage`, por `communityId` e pelo nome normalizado do grupo, guarda as chaves já vistas. A chave é guardada na primeira vez que o grupo aparece. O `communityId` está dentro do que é assinado, mas qualquer pessoa pode copiá-lo para o próprio aviso. Por isso **chave nova para um grupo já conhecido nunca fica verde sozinha.**

**Estados:**

| Estado | Quando | O que a página diz |
|---|---|---|
| ✅ **Verde** | Assinatura válida e chave já vista (ou confirmada) para este grupo neste celular | "Veio de Maria, da coordenação. Código K7M-29Q." |
| 🟡 **Amarelo** | Assinatura válida, mas primeira vez que este celular vê este grupo | "Primeira vez que este celular vê este grupo. Confira o código **K7M-29Q** com a coordenação, uma vez." |
| 🔴 **Vermelho** | Assinatura inválida ou texto alterado | "Não confie: este aviso foi alterado ou não tem assinatura válida." |
| 🔴 **Vermelho** | Assinatura válida, mas **chave nova para um grupo que este celular já conhece** (mesmo `communityId` ou mesmo nome) | "Chave nova para um grupo que você já conhece. Pode ser outra pessoa da coordenação, pode ser golpe. Só confie se a coordenação confirmar o código **K7M-29Q**." Botão: **A coordenação confirmou este código**, que passa a chave para verde |
| ⚪ **Encerrado** | Válido, mas vencido ou cancelado | "Este aviso já passou" / "Foi cancelado" |

Se a primeira chave guardada era a falsa, o aviso verdadeiro aparece vermelho depois. Mesmo assim o conflito aparece, e a pessoa pergunta.

- **Botões de resposta:** Ciente, e Vou / Talvez / Não vou quando houver encontro. Cada um abre o compartilhamento com o texto pronto (`🙋 Vou — A7F3`), para a pessoa colar no grupo.
- **Aviso fixo na página:** "O verde só vale no **seu** celular. Print de tela verde não prova nada."

## Contar as respostas coladas

Na tela do aviso, quem organiza cola as mensagens do grupo (copiadas ou do arquivo de exportação). O app:

- reconhece as linhas no formato de exportação (`[10/11/2026, 14:03] Maria: vou` e `10/11/2026 14:03 - Maria: vou`) e também linhas soltas;
- **palavras reconhecidas:**
  - *ciente*: `ciente`, `ok`, ✅, 👍;
  - *vou*: `vou`, `confirmo`, `estarei`, 🙋;
  - *talvez*: `talvez`, 🤔;
  - *não vou*: `não vou`, `nao vou`, `não posso`, ❌.
- se a linha traz um código de aviso, conta só a que traz o código deste aviso;
- conta só a última resposta de cada nome. Os nomes servem só para isso, em memória, e somem quando a tela fecha;
- mostra o resultado e quantas linhas ignorou, antes de assinar. Quem organiza confere e assina a `aviso-contagem`.

Na tela, a contagem aparece separada das respostas assinadas: "Contado pela coordenação a partir do WhatsApp: 12 cientes, 8 vão" e "Assinadas no Vox: 3".

## Telas no app

- **Comunidade:**
  - o aviso válido mais recente aparece no topo, com o selo "📣 Aviso da coordenação", o código de conferência e os botões de resposta (quem tem conta);
  - aba **Avisos** com a lista, vencidos e cancelados incluídos (`#/c/<id>/avisos`).
- **Compor aviso** (só dono e moderação), três etapas no padrão do compositor (`render/compose-steps.js`):
  1. tipo;
  2. texto, com contador de 280;
  3. quando e onde.

  Termina na prévia do texto do WhatsApp, com dois botões: **Enviar pelo WhatsApp** e **Publicar só no Vox**. A dica na tela diz: "Não ponha telefone, CPF ou endereço de ninguém no aviso."
- **Tela do aviso:** respostas assinadas, contagem colada, botão **Colar respostas do WhatsApp** e botão **Cancelar ou corrigir**.

## Peso e cache

- **Estimativa:** de 10 a 15 KB de módulos novos no app: lógica pura, tela e fluxo. A página leve fica fora disso.
- **O teto do precache não sobe** (PM-02, folga de ~0,5 KB). O PR de implementação escolhe uma de duas saídas e diz qual no texto:
  1. **pagar com corte** de peso igual ou maior no precache (PM-01, dieta do shell);
  2. **carregar sob demanda:** import dinâmico, fora do `SHELL_ASSETS`, guardado pelo Service Worker no primeiro uso. O preço é não abrir sem internet antes do primeiro uso.
- **`aviso.html` e `aviso-page.js` ficam fora do precache:** a página é aberta a partir de um link, com internet.
- **Release:** bump do `CACHE_NAME` (sufixo de sempre).

## Privacidade e regras da praça

- **Nada de membro no aviso:** sem lista de nomes, sem telefone. A contagem é só de números.
- **O texto colado do WhatsApp não sai do aparelho** e não fica guardado.
- **Sem envio automático nem em massa:** cada aviso é colado à mão por quem coordena.
- **Sem ranking:** o aviso é cronológico e não entra em nenhuma recomendação. O modo eleitoral (REV-24) continua valendo.
- **Só 18+**, como o resto do piloto ([ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md)).

## Testes (a escrever com o código)

| Arquivo | Casos |
|---|---|
| `tests/aviso.test.js` | Montar e validar campos (limites, `eventAt` só em convocação, `cobranca` recusado, `authorAvatar` vazio); selo só para dono e moderação; tópico de outra pessoa fica comum; `cancels` só de dono ou moderação; vencimento e topo; última resposta por autor; membros e de fora separados; códigos estáveis |
| `tests/aviso-replies.test.js` | Os dois formatos de exportação e linhas soltas; cada palavra e emoji; última resposta por nome; filtro pelo código do aviso; linhas ignoradas contadas; nenhum nome no resultado |
| `tests/aviso-page.test.js` | Decodificar o link; verde, amarelo, vermelho (texto alterado; chave nova com o mesmo `communityId`; mesmo nome com outro `communityId` e outra chave) e encerrado; a confirmação manual passa a chave nova para verde; link acima do limite recusado. Usa o WebCrypto do Node |
| `tests/signed-verify.test.js` | O módulo extraído dá o mesmo resultado que `verifyPayload` hoje, nas formas v1 e v2 |
| Já existentes | `shell-reachability` (PM-04 e PM-02) e a suíte inteira verdes, sem subir teto |

Limites de código do projeto ([HARDENING](../HARDENING.md)): função ≤ 30 LLOC, complexidade ≤ 15, aninhamento ≤ 4, ≤ 5 parâmetros.

## Ordem de construção (lotes sem arquivo em comum)

| Lote | Arquivos | Depende de |
|---|---|---|
| A | `client/js/aviso.js` (puro: montar, validar, selo, topo, contagem assinada, códigos, texto do WhatsApp, link) + teste | — |
| B | `client/js/aviso-replies.js` (puro: contar o texto colado) + teste | — |
| C | `client/js/signed-verify.js` (extraído de `local-account.js`), `client/aviso.html`, `client/js/aviso-page.js` + testes | — |
| D | `client/js/render/aviso.js`, `client/js/app/aviso-flow.js`, rota da aba, `sw.js` (bump e cache) | A, B, C |

## Ligar, medir e desligar

- **Ligar:** atrás de flag de laboratório até o piloto G1; depois, para a moderação de qualquer comunidade.
- **Medir, sem telemetria nova:**
  - **teste com 5 leigos (LAN-25):** 4 de 5 acham o **Conferir** e dizem o que o verde e o vermelho significam, sem ajuda;
  - **no piloto:** mais da metade do grupo responde a uma convocação. É o critério de abandono da síntese: abaixo disso, volta para a enquete nativa.
- **Desligar:** tirar a flag esconde o composer. Os avisos já assinados continuam como tópicos comuns, e nada se perde.

## Crítica do desenho

1. **A primeira confiança só protege depois do primeiro contato.** No primeiro aviso, o membro precisa conferir o código. A oficina "golpe não" ensina isso, mas parte das pessoas não vai conferir.
2. **Clone com outro nome passa como amarelo.** "Associação Vila Esperança 2" não bate com o nome já visto, e a página diz "primeira vez". A defesa é o hábito: "aviso sem verde não é da coordenação".
3. **A contagem colada é palavra da coordenação**, como a lista feita à mão hoje. Por isso aparece separada das respostas assinadas.
4. **O link é longo e feio no WhatsApp.** Fica por último, depois do texto.
5. **Abrir o link gasta dado.** A página é pequena, e o aviso inteiro já está na mensagem.
6. **Celular perdido de quem modera:** até existir o círculo de confiança (peça 6 da síntese), o dono redesigna a moderação (PM-09). Até lá, a chave nova aparece vermelha para quem já conhecia o grupo, e cada pessoa precisa confirmar o código uma vez.
7. **A síntese falava em três botões.** "Não vou" entrou porque é o que as pessoas escrevem, e ajuda a ver o quórum.

## Fora desta versão

- Cobrança com Pix e conferência da chave Pix contra o mural: depois do parecer.
- O mural público do grupo: é a peça 2. Este formato já serve para ele listar os avisos.
- Prova no link de que a moderação foi designada pelo dono. Hoje a página leve confere a assinatura e a primeira confiança, não a cadeia de moderação.
- A página leve usar os dados da comunidade quando o app está instalado no mesmo celular.
- Aviso em áudio, lembrete automático, notificação push, ler o `.zip` da exportação do WhatsApp.

## Perguntas abertas (respondidas em 11/11/2026)

1. **`type` desconhecido nas versões atuais: guarda e repassa.** Em `peers.js` (`handleGossipMessage`), o item entra se tem `id` e assinatura válida, o autor não está bloqueado, não é mais velho que a versão guardada e, se for `community_update`, passa no PM-09. Não há lista de tipos aceitos: `aviso-resposta` e `aviso-contagem` são guardados e repassados por quem ainda não atualizou. O feed só lista `topic` e `listing` (`cache-node.js`, `screens-home.js`), então eles não aparecem como post. Quem não atualizou ajuda a espalhar as respostas e não vê lixo na tela. O aviso, por ser `topic`, aparece como post comum.
2. **O código de 4 caracteres basta.** São 32⁴ = 1.048.576 códigos. O código só precisa ser único entre os avisos **ativos** do mesmo grupo, que são poucos. Com 10 ativos, a chance de colisão é de ≈ 0,004%; com 50 num mês inteiro, ≈ 0,12%. Regra para o lote A: se dois avisos ativos do grupo tiverem o mesmo código, a resposta conta para o mais recente e a tela da coordenação avisa.
3. **Limite de 2.000 caracteres no WhatsApp: BLOCKED**, só dá para responder testando em aparelho. Não há fonte oficial do WhatsApp sobre tamanho de link reconhecido. Teste no piloto, antes do lote C: mandar links de 500, 1.000, 1.500 e 2.000 caracteres num grupo de teste, em Android antigo, iPhone e WhatsApp Business, e ver se o link fica clicável inteiro. Se falhar, o plano B é comprimir o aviso (`CompressionStream`) ou baixar o limite do texto.

## Dilemas registrados em 11/11/2026

**O que o teste mostrou:** links de 787, 1.000, 1.259 e 2.040 caracteres chegaram inteiros e clicáveis no WhatsApp. Funciona, mas **o paredão de texto do link é hostil**, principalmente para quem tem 50+.

**Por que o link é longo:** para conferir sem servidor, o link leva a chave pública e a assinatura (uns 170 caracteres que não comprimem, porque são bytes aleatórios) e o texto do aviso, porque a página só confere o que recebe. Nenhum aviso real passa de ~1.260 caracteres; o limite de 2.000 é folga.

| Saída | Tamanho | Custo |
|---|---|---|
| Formato atual | 790 a 1.260 | Paredão |
| Formato binário compacto + compressão | ~350 a ~650 (estimado) | Continua paredão, mais código |
| Link curto pelo Arweave (`perma-notary.js`, grátis até 100 KiB) | ~90 | Aviso **público e permanente**; a página precisa de internet. Pede ADR de privacidade (hora e lugar de núcleo podem ser sensíveis) |
| Link curto por relay do Vox | ~80 | Não há relay público ([INFRA-CUSTOS](../INFRA-CUSTOS.md)) |
| Só o código da pessoa no texto, sem link | 0 | Não prova nada: texto se copia |

**Decisão por agora (a mais simples):** o aviso vai **limpo**, sem link. O link de conferência é **sob demanda**, numa segunda mensagem, para quando houver dúvida (alerta, aviso estranho, pedido de quem recebeu). Conferir dentro do app, para quem tem conta, continua automático (selo). O lote C segue com o formato atual.

**Fica para depois, com ADR:** link curto pelo Arweave como opção "aviso público", com o compositor perguntando "Este aviso pode ficar público e permanente?"; formato binário compacto se o link longo continuar necessário.
