# ADR-040: Fairplay — rolagem verificável na mesa em três fases, com o Mestre como hub que não pode forjar

**Status:** accepted (aceito pelo mantenedor em 2026-11-25; PR-3a em #498, PR-3b a seguir) · **Revisado:** 2026-11-25 (revisão 2: partes depois dos compromissos, fechamento pelo log, veto do Mestre, compromisso amarrado) · **Relacionados:** [ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md) (honestidade de segurança), [ADR-033](./033-ia-so-no-rpg-local-primeiro.md) (o RPG fica isolado do feed cívico), [ADR-036](./036-agilidade-criptografica-pos-quantica.md) (todo formato diz o seu algoritmo), [spec Subversus VTT §7 e §10](../specs/subversus-vtt-v0.md), [THREAT-MODEL](../THREAT-MODEL.md)

## 1. Contexto

Hoje a rolagem de dados da Mesa Soberana (Subversus) é sorteada no aparelho de quem rola e chega aos outros pronta, numa operação `ROLL_RECORDED` assinada. A assinatura prova **quem** registrou, não que o número foi sorteado com honestidade: quem rola pode repetir em segredo até sair o valor que quer.

O repositório já tem as peças do protocolo Commit-Reveal² em `client/js/rpg-crypto-table.js`: compromisso duplo por SHA-256, backup da semente em partes Shamir GF(256) e sorteio sem viés por rejeição. O adaptador `client/js/dungeon/vtt-fairplay-roll.js` (#495) já separa o que é público (`commit`), o que fica no aparelho (`secret`, a semente) e as partes de backup (`shares`, uma por par), e só aceita revelação de quem se comprometeu na mesma rolagem. O que falta é **levar isso pela rede da mesa**, e aí aparecem escolhas que mudam a garantia. Por isso este ADR vem antes do código.

### 1.1 Como a rede da mesa funciona hoje

`client/js/dungeon/vtt-sync.js` monta uma **estrela**: o Mestre é o hub. O jogador manda `ACTION_OP` ao Mestre; o Mestre aplica, filtra o que cada jogador pode ver (`projectStateForPlayer`, Zero-Spoiler) e reenvia `COMMIT_OP`. Toda operação é assinada com ECDSA P-256 pela chave de quem a criou (`signVttOp`), e o Mestre confere (`verifyVttOpSignature`). Consequência: o Mestre **não consegue forjar** a operação de um jogador, mas **consegue segurar, atrasar ou não repassar** qualquer mensagem.

## 2. Decisão

### 2.1 Fases, todas como operações assinadas no log da campanha

| Fase | Operação | Quem manda | Conteúdo |
|---|---|---|---|
| Abertura | `FAIRPLAY_OPEN` | quem pede a rolagem | `rollId` novo, fórmula, visibilidade e prazo de cada fase. A lista de participantes **não é escolhida à mão**: é o conjunto dos pares da sala com `FAIRPLAY_KEY` válida no log naquele ponto (§2.3), ordenado por `peerId`. No mínimo 2 |
| 1. Compromisso | `FAIRPLAY_COMMIT` | cada participante | só o `commit`, **sem semente e sem partes** |
| 1b. Partes | `FAIRPLAY_SHARES` | cada participante | uma parte de backup **cifrada** para cada um dos outros. Só é aceita depois que **todos** os compromissos estão no log |
| 2. Revelação | `FAIRPLAY_REVEAL` | cada participante | a semente. Só é aceita depois que a fase 1b fecha |
| Recuperação | `FAIRPLAY_SHARE` | quem guarda parte de alguém que não revelou | a parte em claro (a fase de revelação já fechou) |
| Fechamento de fase | `FAIRPLAY_CLOSE` | quem abriu a rolagem, ou o Mestre se quem abriu sumiu | qual fase fecha. Só é aceito depois do prazo daquela fase |
| Resultado | `ROLL_RECORDED` com `fairplay` | quem abriu | resultado e referência ao `rollId` |

As partes **não** podem ir junto com o compromisso: quem se compromete por último leria as partes dos outros antes de fixar a própria semente.

O sorteio sai de `resolveFairplayRoll` sobre o que está no log. Cada operação só é aceita na sua fase; o resto é recusado.

### 2.1a O que fecha uma fase é o log, não o relógio

Cada aparelho tem seu relógio. Se cada um fechasse a fase "com o que chegou", dois aparelhos poderiam chegar a resultados diferentes. Por isso:

- Uma fase termina quando todas as operações esperadas estão no log, ou quando aparece um `FAIRPLAY_CLOSE` assinado. O prazo só dá o direito de emitir o fechamento. A ordem do log é a que o Mestre-hub já impõe.
- Operação daquela fase que entra no log depois do fechamento é ignorada em todos os aparelhos.
- As sementes são combinadas na ordem da lista do `FAIRPLAY_OPEN`. Hoje `resolveCommitReveal2Roll` concatena na ordem em que recebe a lista; o PR-3a passa a ordem explicitamente.

### 2.2 Ninguém confia no selo de outro par

O campo `fairplay` do `ROLL_RECORDED` não é uma afirmação de verdade: **cada aparelho refaz a conta** a partir das operações de compromisso, revelação e recuperação que recebeu, e só mostra o selo "✓ Verificada" se o resultado recalculado bater com o registrado. Uma rolagem que não fecha (fraude, falta de quórum, operação faltando) aparece como **"não verificada"**, nunca como verificada.

### 2.3 Chaves só da mesa, sem tocar em identidade

As partes de backup precisam ir cifradas para cada destinatário; senão o Mestre, que repassa tudo, juntaria o quórum e saberia a semente antes da revelação. Para isso cada par publica, ao entrar na sala, uma **chave ECDH P-256 efêmera da sessão** numa operação assinada (`FAIRPLAY_KEY`). As partes vão cifradas com ECDH + HKDF-SHA-256 + AES-GCM, com o `rollId` e os dois `peerId` como dados associados. A chave efêmera vive só na memória da sessão e não tem relação com a chave de identidade nem com a de DM: **não mexe em `identity/`**, que está congelada, nem no `crypto-dm.js`. O formato carrega o nome do algoritmo (`alg: "ecdh-p256+hkdf-sha256+aes-256-gcm"`), como pede o ADR-036.

### 2.3a Compromisso amarrado à rolagem

Hoje `commitO = SHA-256(semente)` não diz de qual rolagem nem de quem é. Na v0:

- Dentro da mesma rolagem, um `commitO` repetido é recusado: ninguém copia o compromisso de outro.
- Compromisso sem `commitO` é recusado. Hoje a camada de baixo (`verifyRevealedSeed`) pula a verificação quando falta o `commitO`; o adaptador já exige o campo (#495), e o PR-3a fecha a lacuna também embaixo, com teste que falha na base.
- Amarrar rolagem e pessoa dentro do hash (`SHA-256(rollId‖peerId‖semente)`) é o desenho mais firme, mas muda o formato. Entra com um `alg` novo (ADR-036), num PR próprio depois do PR-3b.

**Emenda (SUB-07; decidido em 25/11/2026, opção recomendada; autorização geral do mantenedor).** O formato fica fixo assim:
- `alg: "sha256-bound-v1"` no objeto `commit` do `FAIRPLAY_COMMIT`.
- `commitO = SHA-256(` bytes UTF-8 de `vox-fairplay-commit-v1`, `0x00`, `len32(rollId)`, bytes UTF-8 de `rollId`, `len32(peerId)`, bytes UTF-8 de `peerId`, bytes crus da semente `)`. `len32` é o comprimento em bytes, uint32 big-endian: sem ele, `"ab"+"c"` e `"a"+"bc"` dariam o mesmo hash.
- `alg` ausente ou desconhecido é recusado, sem transição (o log não aceita o `commit` e a rolagem não resolve). A flag `vox.lab.fairplay` é só de laboratório, então não há rolagem antiga a preservar.
- Só o `commitO` muda: `commitV = SHA-256(commitO)` continua igual, e a recuperação pelas partes confere a semente contra o novo `commitO`, com o `rollId` e o `peerId` do compromisso.
- A mesa local e o cofre de lore (`rpg-crypto-table.js` sem `binding`) seguem com SHA-256 simples: não há rolagem entre pares a amarrar.

### 2.4 Escopo da v0

- **Só rolagens públicas.** Rolagens "Somente Mestre" e "Cega" continuam locais, sem selo: os jogadores não veem o valor, então não teriam o que verificar. Uma versão com compromisso público e valor escondido fica para depois.
- **Jogo sozinho e mesa de demonstração** seguem com a rolagem local, sem selo.
- **Mínimo de 2 participantes.** O quórum Shamir é `M = ⌈N/2⌉ + 1` partes de `N − 1` (cada par guarda uma parte de cada outro), limitado a `N − 1`.
- **Com 2 participantes, o quórum é 1.** O outro jogador lê a minha semente assim que recebe a parte dele, na fase 1b. O compromisso dele já está fixado, então ele não escolhe o número; só fica sabendo do resultado antes de revelar. Se desistir por isso, não adianta: a parte dele está comigo e a semente dele é recuperada.
- **Fechamento do compromisso com menos participantes:** as partes de cada um são geradas no `FAIRPLAY_COMMIT`, para o N da abertura, e não dá para refazê-las depois (o compromisso fixa a divisão). Se o `FAIRPLAY_CLOSE` da fase de compromisso reduz a lista, a rolagem só segue se, repartidas as partes entre os que ficaram, nenhum par receber o mínimo para abrir a semente de outro. Do contrário a rolagem passa a `aborted` e aparece como não verificada. Na prática: de N ≥ 3 para N' ≥ 3 segue; de N ≥ 3 para N' = 2 aborta, porque o quórum cairia a 1 pessoa sem que a mesa tenha aceitado isso. O quórum de 1 pessoa continua valendo só para a mesa aberta com 2 participantes.
- **Partes liberadas conferidas:** cada envelope de `FAIRPLAY_SHARES` leva o SHA-256 da parte codificada; na recuperação só entram na conta as partes cujo hash foi publicado para aquele guardião. A parte liberada viaja com `y` em hex.
- **Admissão e limites:** participantes são os pares cuja `FAIRPLAY_KEY` tem `keyLamport` menor que o `lamport` da abertura; a chave precisa ser um ponto da curva P-256; no máximo 64 chaves por campanha, `sides` ≤ 1000, semente de exatamente 32 bytes em hex e envelope de no máximo 512 bytes cifrados.
- **Orçamento do snapshot:** as ops Fairplay que vão a quem entra cabem em 256 KiB de JSON (`SNAPSHOT_OPS_BUDGET`); passando disso, saem primeiro as rolagens mais antigas (cada rolagem mantida vai inteira) e ficam as admissões e as chaves vigentes. O log também só guarda trocas de chave que alguma rolagem guardada ainda usa. A admissão (`FAIRPLAY_ADMIT`) é gravada com a flag de laboratório desligada.
- **Vivacidade (custos aceitos desta versão):**
  - Com N = 3, um par que não se compromete até o fechamento leva a lista a 2, e a rolagem aborta (quórum cairia a 1 pessoa, ver acima). A mesa abre outra rolagem.
  - Uma fase de partes que fecha incompleta termina `unverified`: sem as partes de todos não há como recuperar quem sumir.
  - A recuperação só fecha pelo `FAIRPLAY_CLOSE`, depois do prazo. O reducer é síncrono e não confere o hash das partes liberadas (SHA-256 é assíncrono); contar partes ali fecharia a fase com partes que a conferência descarta. O preço é esperar o prazo da recuperação.
  - As partes só vão a pares cuja chave importa; precisam alcançar guardiões distintos em número suficiente para que nenhum tenha o mínimo para abrir a semente de outro. Se não alcançam, o aparelho avisa e não envia.
  - O prazo de cada fase tem mínimo de 5 s; coordenadas das chaves precisam estar em base64url canônico.
- **Prazo por fase:** 20 s por padrão, ajustável na abertura. Estourou o prazo, a fase fecha com o que chegou.

## 3. O que este desenho garante e o que não garante (ADR-024)

**Garante:**
- Quem pede a rolagem não escolhe o número: o resultado depende das sementes de todos, e cada semente foi fixada antes de alguém ver as outras.
- Quem some depois de ver as outras revelações não anula a rolagem, desde que o quórum de partes chegue: a semente dele é recuperada e confere com o compromisso.
- Ninguém, nem o Mestre, transforma uma rolagem que não fecha em "verificada" na tela dos outros.

**Não garante (limites honestos, visíveis na interface):**
- **O Mestre tem veto, e sabe o resultado antes de usá-lo.** Como hub, ele recebe as revelações antes de repassar. Se o número não agradar, pode segurar uma revelação ou uma parte, e a rolagem fica "não verificada". É mais que censura: é desistir seletivamente. Na v0 isso é exposto, não impedido:
  - a Crônica mostra cada rolagem que não fechou e o motivo que o próprio aparelho viu ("X não revelou o número a tempo; a rolagem foi anulada");
  - cada jogador sabe se mandou a própria revelação; se ela foi assinada e enviada e não aparece no log, o aparelho dele marca "segurada no caminho"; se nunca saiu, diz "você não revelou a tempo";
  - o Mestre grava a falta no log (uma por rolagem, sem texto confiável) e cada aparelho redesenha a frase pela própria conta.
  Tirar o veto exige rede direta entre jogadores (abaixo).
- **Abortar e pedir de novo.** Quem não gosta do rumo pode deixar a rolagem não fechar e abrir outra. Mitigação: toda rolagem aberta fica no log, e a Crônica mostra quantas rolagens não fecharam por pessoa. A punição é social, não técnica.
- **Conluio de quórum.** Se `M` participantes combinarem entre si, eles reconstroem a semente de um terceiro antes da revelação. Com 2 ou 3 pares, o quórum é quase todo mundo: a garantia real é contra **um** trapaceiro, não contra a maioria.
- **Vários aparelhos da mesma pessoa.** A lista vem dos pares com chave na sala (§2.1), então quem abre não escolhe a dedo quem entra. Quem tem vários aparelhos na sala, porém, entra várias vezes. Contra isso, a defesa continua sendo o Mestre admitir os jogadores.
- **Sem rede direta entre jogadores.** Tudo passa pelo Mestre. Uma malha completa entre jogadores tiraria o poder de censura, mas é outra decisão.
- **Histórico limitado para quem entra tarde.** A campanha guarda as ops assinadas das 50 rolagens mais novas, mais todas as admissões e chaves. Quem entra depois (ou a mesa depois de recarregar) refaz o estado só dessas; rolagens mais antigas aparecem como "não verificada" para esse aparelho. O arquivo de backup importado não traz estado Fairplay: ele é descartado e refeito pelas ops da mesa.
- **Sem partes verificáveis, um participante pode anular a rolagem, não enviesá-la.** Quem entrega partes que não refazem a semente ou sonega a revelação só consegue anular, e é apontado como faltoso. Quem é honesto revela sempre. Em mesa de dois, o guardião que tem todas as partes do outro as junta e confere contra o compromisso, mas o achado é só um aviso neste aparelho (as partes vão cifradas para ele, e ninguém mais consegue conferir): ele não trava a revelação, não entra na falta que o Mestre grava nem na contagem. Revelação que não refaz o compromisso publicado é falta de quem a mandou. Com até 5 participantes a recuperação depende de todos os outros (L1). A verificação pública das partes (VSS) fica para a LAN-18.
- **Fora desta emenda:** VSS, culpa por parte não liberada na recuperação e as camadas L2 a L4.
- **Admissão ainda automática (pendente).** Hoje o Mestre admite quem entra na mesa. A aprovação explícita e a revogação estão aceitas na §3.1 e valem só com a flag de laboratório ligada.

### 3.1 Emenda: aprovação de admissão e revogação (Aceito)

**Status:** Aceito pelo mantenedor em 2026-11-25. Passa a valer com o merge deste PR; o texto da §3 sobre admissão automática descreve o comportamento com a flag desligada. Tudo abaixo existe apenas com a flag de laboratório `vox.lab.fairplay` ligada; com ela desligada, nada muda (o Mestre segue admitindo quem entra).

- **Aprovação.** Com a flag ligada, quem entra na mesa fica **pendente** no aparelho do Mestre (estado local, fora do log). O Mestre aprova por `approveFairplayPeer(routeId)`, que grava `FAIRPLAY_ADMIT`. Sem aprovação, a `FAIRPLAY_KEY` do par é recusada (`not_admitted`) e ele não entra em nenhuma rolagem. A tela de aprovação está descrita na entrada "Recusa e interface" abaixo.
- **Recusa e interface (SUB-03).** `refuseFairplayPeer(routeId)` (só o Mestre, só com a flag ligada) tira o par da fila, o guarda em `refusedFairplay` (estado local, fora do log, como a fila) e devolve o pedido de chave dele como `OP_REJECTED` com motivo `revoked`. Recusar quem não está pendente ou já foi recusado não muda nada (devolve `false`). Depois da recusa, `approveFairplayPeer` devolve `false`, um novo pedido de entrada não o recoloca na fila e as chaves seguintes dele voltam `revoked`; como a recusa é estado local, ela dura enquanto o Mestre mantiver a mesa aberta, e desfazê-la não está definido aqui. O condutor expõe `getStatus()` (`waiting`, `refused` ou `ok`). A tela, atrás da flag: o Mestre vê Aprovar e Recusar para cada pedido; o jogador vê "Aguardando aprovação do Mestre", "Entrada recusada" ou "Não deu para falar com o Mestre", este com a opção de tentar de novo (`onHelloGaveUp` do reenvio do HELLO_SYNC). As mensagens usam `role="status"`.
- **Revogação.** Nova operação `FAIRPLAY_REVOKE { actor }`, persistida no log e assinada pelo Mestre. Só o Mestre revoga (de outro autor, é recusada). Revogar tira o par de `admitted` e de `keys` e o marca em `revoked` com o `lamport` da revogação. Revogação repetida, de par desconhecido ou do próprio Mestre não faz nada.
- **Efeito sobre as ops.** Toda operação Fairplay de um par revogado com `lamport` maior que o da revogação é recusada, em qualquer fase; o Mestre avisa o par com o motivo `revoked`. Rolagens já fechadas continuam verificáveis. Numa rolagem em andamento o revogado deixa de agir: se ainda não se comprometeu, cai pela regra do fechamento da fase de compromisso; se já se comprometeu, a rolagem segue ou aborta pelas regras de recuperação e de quórum já descritas.
- **Readmissão.** Só com um novo `FAIRPLAY_ADMIT` de `lamport` maior que o da revogação; um `FAIRPLAY_ADMIT` antigo reaplicado não readmite.
- **Log e replay.** Admissões e revogações de cada par entram no snapshot e no replay (até 16 eventos por par); o estado refeito é o mesmo, inclusive com ops duplicadas ou fora de ordem. Logs gravados antes desta emenda (uma admissão por par, sem `revoked`) continuam válidos.
- **`peerId` e `routeId`.** O autor de uma operação já é amarrado à chave que a assina (o `routeId` deriva da chave pública). Passa a valer também no condutor: ele só liga se o `peerId` recebido for o `routeId` do par de sincronização.
- **Limites (ADR-024).** Revogar não desfaz o que o par já viu e não impede quem tem outra identidade de pedir entrada de novo; a defesa continua sendo o Mestre aprovar quem entra. O Mestre segue podendo aprovar ou revogar de forma seletiva: isso é poder dele, visível no log, e não é impedido.

## 4. Alternativas descartadas

1. **Sorteio só do Mestre com assinatura.** É o que existe; não impede repetir em segredo.
2. **Partes de backup em claro.** Mais simples, mas entrega ao hub o quórum antes da revelação e desfaz o protocolo.
3. **Reusar a chave de DM para cifrar as partes.** Funcionaria, mas encosta em identidade (congelada) e liga o RPG ao resto da conta, contra o isolamento do ADR-033.
4. **Beacon público de aleatoriedade (drand e afins).** Depende de serviço externo e de rede; quebra o uso offline e local-first da mesa.

## 5. Consequências e entrega

- **PR-3a** — fases e verificação: `FAIRPLAY_OPEN/COMMIT/SHARES/REVEAL/SHARE/CLOSE` no reducer e no filtro de sincronização, recálculo do selo em cada aparelho, fechamento pelo log (§2.1a), recusa de `commitO` ausente ou repetido (§2.3a). Testes com 2 e 3 pares no hub em memória (`createInMemorySyncHub`): rolagem normal, semente adulterada, último revelador que some (com e sem quórum), `fairplay` forjado por outro par, Mestre que segura a revelação, operação fora de fase, partes antes de todos os compromissos, e a mesma rolagem dando o mesmo número com as operações chegando em ordens diferentes. Partes ainda em claro **só no hub de teste**; a flag fica desligada fora dos testes até o PR-3b.
- **PR-3a, como ficou:** `client/js/dungeon/vtt-fairplay-log.js`. Op recusada pelo reducer não entra no log (nem em `appliedOpIds`), e o Mestre devolve `OP_REJECTED` com motivo `out_of_phase` para o par assinar de novo. Com 2 participantes, a divisão Shamir pede pelo menos 2 partes, então as duas vão para o outro par (quórum efetivo de 1 pessoa, como em §2.4).
- **PR-3b parte 1, como ficou:** `vtt-fairplay-cipher.js` (§2.3; rótulo `rollId|de|para` como HKDF `info` e como dados associados do AES-GCM) e `vtt-fairplay-driver.js` (condutor idempotente pelo estado, reenvio depois de `OP_REJECTED`). A semente fica só na memória: se o aparelho recarregar no meio, a rolagem segue pela recuperação por quórum.
- **PR-3b** — `FAIRPLAY_KEY` com chave efêmera, cifra das partes (§2.3), selo na Crônica, contagem de rolagens que não fecharam e textos leigos. A flag de laboratório liga só depois deste PR.
- **Selo amarrado (emenda do PR-A):** o selo "✓ Verificada" só vale quando, neste aparelho, (1) o autor da entrada é quem abriu a rolagem, (2) é a primeira entrada de quem abriu com aquele `rollId` e o id do registro é único, (3) a fórmula registrada é a da abertura, o dado tem as mesmas faces e, sem `@`, a conta resolvida não traz bônus, (4) todos os dados, os críticos e o total exibidos saem da conta refeita aqui e (5) o texto avisa o limite: com bônus de ficha (`@`), o selo garante o dado, não o bônus. Entrada de `CHRONICLE_APPEND` nunca carrega vínculo Fairplay: o vínculo só nasce do `ROLL_RECORDED` assinado por quem registra. O jogador também confere a assinatura de `ROLL_RECORDED` Fairplay e de `CHRONICLE_APPEND` com `fairplayFault`, e não salva `SNAPSHOT_FILTERED` de uma campanha cujo Mestre não é o do convite.
- **Custo:** cada rolagem pública passa a esperar duas idas e voltas pela rede (compromisso e revelação). Na mesma rede local, isso é imperceptível; em 4G com TURN, alguns segundos. A interface mostra "rolando com a mesa…" enquanto isso.
- **Revisão externa:** a cifra das partes e o quórum entram na lista de revisão de cripto (LAN-18) antes de a flag sair do laboratório.

## 6. Critérios para rever esta decisão

- Se a mesa ganhar malha direta entre jogadores, rever §3 (censura pelo Mestre).
- Se aparecer abuso de "abortar e pedir de novo" em teste com o mantenedor, avaliar um custo por rolagem que não fecha.
- Se a revisão externa (LAN-18) apontar problema na cifra ou no quórum, este ADR volta para `proposed`.
