# Guardiões (v0): a comunidade devolve a conta

> **Status:** aceita (2026-11-14, pelo mantenedor; as 3 decisões do §12 ficam para antes da parte 3b; spec antes do código, [ADR-032](../adr/032-login-perene-a-conta-nasce-com-saida.md) passo 3) · **Owner:** mantenedor · **Revisado:** 2026-11-13
> Relacionados: [ADR-032 §3.4](../adr/032-login-perene-a-conta-nasce-com-saida.md#34-guardiões-recuperação-pela-comunidade) (a decisão), [ADR-026](../adr/026-chaves-em-repouso-trava-depois-do-backup.md) (conta travada), [mochila de DMs](./mochila-dm-v0.md) (entrega quando a pessoa está offline), [THREAT-MODEL](../THREAT-MODEL.md) (T25), `client/js/recovery-phrase.js`, `client/js/identity-seed.js`, `client/js/crypto-dm.js`, `client/js/app/dm-wire.js`.

## 1. Problema

A frase de recuperação (passo 2, no ar desde o SW v7.116) resolve quem guarda papel. Muita gente perde o papel, ou nunca escreve. O ADR-032 §3.4 decidiu a segunda saída soberana: **a dona escolhe pessoas de confiança, e M delas juntas devolvem a conta**, sem servidor, sem empresa e sem e-mail. Esta spec diz como isso funciona, byte a byte, antes de qualquer código.

O que **não** muda: a conta continua sendo a mesma chave. Os guardiões devolvem **a semente** (12 palavras) ou, em conta antiga, **a chave de assinatura** (24 palavras), e o aparelho novo refaz a conta com o código que já existe (`identityFromPhrase`).

## 2. Termos

| Termo | O que é |
|---|---|
| **Dona** | A pessoa cuja conta é protegida. |
| **Segredo** | 16 bytes de semente (conta com semente) ou 32 bytes de `d` (conta antiga). É o que a frase codifica. |
| **Divisão** | Um sorteio de Shamir: `splitId` aleatório (16 bytes), N pedaços, mínimo M. |
| **Pedaço** | `{x, y}`: o ponto `x` (1…N) e os bytes `y`, do mesmo tamanho do segredo. |
| **Guardião** | Uma conta Vox, com chave de DM conhecida, que guarda um pedaço. |
| **Chave temporária** | Par ECDH P-256 gerado no aparelho novo só para receber os pedaços de volta. |

## 3. Shamir em GF(256)

- **Corpo:** GF(2⁸) com o polinômio do AES, `x⁸ + x⁴ + x³ + x + 1` (`0x11b`). Soma é XOR; multiplicação por tabelas de log/antilog com gerador `0x03`.
- **Dividir:** para cada byte `s` do segredo, um polinômio `f(z) = s + a₁z + … + a_{M−1}z^{M−1}` com `aᵢ` de `crypto.getRandomValues`. O pedaço `i` (i = 1…N) é `y[k] = f_k(i)`.
- **Juntar:** interpolação de Lagrange em `z = 0` com exatamente M pedaços de **x distintos** e **mesmo `splitId`**. Pedaços de divisões diferentes são recusados antes de calcular (misturar dá lixo, não erro).
- **Conferir sem guardar nada a mais:** o segredo juntado vira identidade (`identityFromPhrase` / `identityFromSeed`), e o `routeId` dela **tem que ser** o da dona. Não há hash do segredo dentro do pedaço: o próprio `routeId` é a conferência.
- **Limites:** `2 ≤ M ≤ N ≤ 7`; padrão **3 de 5**; menor permitido **2 de 3**. M = 1 seria entregar a conta a qualquer um dos guardiões e é recusado.
- **Módulo:** `client/js/shamir-gf256.js`, puro (sem DOM, sem rede), com vetores fixos nos testes — **implementado na parte 3a** (no precache desde a 3b).

## 4. Mensagens

Todas são JSON **assinado pela conta de quem manda** (`signPayload`, formato `sigv` atual) e viajam **dentro de um envelope de DM** (`crypto-dm.seal` para a chave de DM de quem recebe), pelo caminho que a DM já usa: WebRTC direto → caixa postal do relay → caixa de saída com reenvio (`dispatchSealedEnvelope`). Quem carrega o envelope não lê nada.

| `t` | De → para | Campos (além de `t`, `v: 0`, assinatura) |
|---|---|---|
| `vox-guardiao-pedaco` | dona → guardião | `owner` (routeId), `ownerName`, `splitId`, `m`, `n`, `x`, `kind` (`semente`\|`chave`), `y` (b64url), `createdAt` |
| `vox-guardiao-recibo` | guardião → dona | `owner`, `splitId`, `x`, `heldAt`, `released` (true quando o guardião para de guardar) |
| `vox-guardiao-revoga` | dona → guardião | `owner`, `splitId` |
| `vox-guardiao-pedido` | aparelho novo → guardião | `owner`, `tempPub` (JWK pública), `createdAt`, `nonce` (16 bytes) — **não é assinado** (o aparelho novo ainda não tem a conta) |
| `vox-guardiao-resposta` | guardião → aparelho novo | o `vox-guardiao-pedaco` original, intacto e assinado pela dona, mais `nonce` do pedido; selado para `tempPub` |

Regras de recebimento (em `dm-wire.js`, antes de `saveDmMessage`, como já é feito com denúncia e papel):
- `pedaco` só é aceito se a assinatura é da `owner`, o envelope veio da `owner` **e** o guardião segue a dona ou a tem nos contatos (metade do laço mútuo do §12.2, do lado de quem guarda). Não aparece no fio de conversa: vira um aviso curto para o guardião.
- `revoga` só vale assinado pela `owner`; apaga o pedaço daquela `splitId`.
- `recibo` só conta se o guardião é um dos que receberam aquele `x` daquela `splitId`.
- `resposta` é aberta só pelo aparelho que tem a chave temporária; o pedaço dentro dela tem que ter assinatura válida da `owner` pedida.

## 5. Dividir e entregar (aparelho da dona)

1. **Escolher:** Perfil → Segurança → "Guardiões". Lista só contatos com chave de DM conhecida. A tela recomenda pessoas que **não se conhecem entre si** e mostra o efeito de M e N em palavras ("3 de 5: se você perder o celular, 3 delas juntas devolvem sua conta; 2 sozinhas não conseguem").
2. **Abrir o segredo:** o mesmo caminho da frase (`openSeed` / `openAccountKeys`); conta travada pede a Senha Soberana.
3. **Dividir** (§3) e **mandar** um `pedaco` por guardião. O segredo sai da memória ao fim da função; nada do segredo nem dos pedaços fica guardado na dona.
4. **Guardar só o mapa:** `vox-guardians-v1:<routeId>` no `localStorage` com `{splitId, m, n, guardians: [{routeId, x, sentAt, heldAt|null}]}`. Sem `y`.
5. **Contar como saída** (`markAccountExit("guardioes")`) só quando **M recibos** chegaram. Antes disso, a tela diz "2 de 3 confirmaram" e a faixa de conta provisória continua.

## 6. Guardar (aparelho do guardião)

- O pedaço fica em `vox-guardian-shares-v1` (mapa `owner → registro`), **cifrado pela chave do aparelho** (`sealJsonStrict`), como as chaves. Diferente das chaves da própria conta, **não há volta em claro**: aparelho sem chave do aparelho (sem IndexedDB) recusa o pedaço, e a dona vê esse guardião sem recibo. Entra na limpeza local.
- O mapa da dona (`vox-guardians-v1:<routeId>`) guarda só a escolha dela: `splitId`, M, N e quem recebeu cada `x`. Nunca os pedaços.
- **Caixa preta** (ADR-030, ADR-032 §3.4.3): não há tela para ver, exportar nem usar o pedaço. O app mostra só "Você guarda a volta de Ana" e o botão "Parar de guardar" (que manda um aviso para a dona e apaga o pedaço). No navegador, caixa preta é ausência de manuseio, não segredo contra quem tem o aparelho destravado; o texto diz isso.
- **Limites:** até 20 donas por guardião; um pedaço por dona (uma divisão nova substitui a anterior). Ninguém guarda pedaço da própria conta.
- **Recibo** automático ao guardar, e de novo quando a dona pergunta (v1, ver §10).

## 7. Pedir de volta (aparelho novo)

1. "Já tenho conta" → "Pelos meus guardiões". A pessoa digita **o próprio `@handle` ou cola o link do próprio perfil** para dizer quem é (o `owner`). Sem isso, o guardião não sabe de quem é o pedido.
2. O aparelho gera a **chave temporária** (guardada só nesta aba, em `sessionStorage`, por 24 h) e mostra um **link de pedido** `#/guardiao?o=<routeId>&k=<tempPub comprimida>&t=<createdAt>&n=<nonce>`, com botão de compartilhar e um código curto de conferência (4 palavras derivadas do hash do pedido).
   - O link **não carrega segredo**: só a chave pública temporária. Qualquer um pode fazer um link desses, e é por isso que o passo 3 existe.
   - **QR:** o codificador de QR do app guarda até 106 bytes e o link passa disso. O QR do pedido entra quando o codificador ganhar versões maiores (passo 3c); até lá o link é compartilhado por texto, ou mostrado na tela para o guardião digitar o código curto e abrir pelo próprio app.
3. **O guardião abre o link** no app dele. A tela mostra:
   - nome e foto da dona **tirados dos contatos do próprio guardião**, não do pedido;
   - há quanto tempo o pedido foi criado (pedido com mais de 24 h é recusado);
   - o código curto, para conferir com a pessoa;
   - a pergunta "Você falou com Ana **por voz ou pessoalmente** agora e ela confirmou este código?". Sem marcar, não há botão de devolver.
4. **Devolver:** o guardião sela a `resposta` para `tempPub` e entrega:
   - pela caixa postal do relay, num endereço temporário `vxtmp_` + 20 caracteres do SHA-256 da `tempPub` (a caixa já é cega e com prazo);
   - e, se os dois aparelhos estão juntos, por WebRTC direto.
5. **Juntar:** com M respostas válidas (§4), o aparelho novo junta (§3), confere o `routeId`, refaz a conta como na frase (`restoreFromPhrase` com o segredo já em bytes), apaga a chave temporária e marca `markAccountExit("guardioes")`. A divisão antiga continua valendo; a tela sugere refazer a divisão se a pessoa acha que o celular perdido pode estar com alguém.

## 8. Trocar ou tirar guardiões

- Trocar um guardião, mudar M ou N = **divisão nova** (novo `splitId`, polinômios novos) para todos, mais um `revoga` assinado da divisão anterior para quem a tinha.
- Pedaços de divisões diferentes não se juntam (§3), então um guardião antigo que ignore o `revoga` não ajuda ninguém a juntar com os novos.
- Remover todos os guardiões manda `revoga` e tira a saída `guardioes` do registro.

## 9. Ameaças (no THREAT-MODEL como [T25](../THREAT-MODEL.md#3-ameaças--mitigações-o-que-existe-hoje), escrito antes da 3c)

| Ameaça | O que segura | O que sobra |
|---|---|---|
| M guardiões combinam e tomam a conta | M ≥ 2; recomendação de guardiões que não se conhecem; a dona escolhe | Conluio de M pessoas é possível por desenho: é o preço de não depender de empresa |
| Alguém se passa pela dona e pede os pedaços | Pedido só pelo app do guardião; nome e foto vêm dos contatos do guardião; idade do pedido; código curto conferido **por voz ou pessoalmente** | Guardião que não confere por fora. O texto da tela insiste |
| Quem carrega o envelope lê o pedaço | Envelope de DM cifrado para o guardião (e, na volta, para a chave temporária) | Metadado `from`/`to` no envelope v1 até o envelope cego (mochila, passo 1) |
| Pedaço falso ou de outra divisão | Pedaço assinado pela dona; mesmo `splitId`; `routeId` juntado tem que bater | — |
| Aparelho do guardião destravado | Pedaço cifrado pelo aparelho; um pedaço sozinho não diz nada (abaixo de M, Shamir não vaza nenhum bit do segredo) | Quem tem M aparelhos destravados de guardiões |
| Guardião limpa o navegador e perde o pedaço | Recibo mostra quantos confirmaram; a dona pode refazer | Sem pergunta periódica no v0 (§10) |

## 10. Fora do v0

- **Pergunta periódica "ainda guarda?"** (recibo renovado a cada N dias, saída cai se ficar abaixo de M): v1.
- **Envelope cego** para esconder `from`/`to`: vem da mochila de DMs (PM-79), não daqui.
- **Guardião sem conta Vox** (por exemplo, um pedaço impresso): não; cada pedaço sozinho é inútil e confuso no papel.
- **Raiz e subchaves** (PM-13): quando existir, os guardiões passam a guardar a raiz; o formato do pedaço já carrega `kind`.

## 11. Entrega em partes

| Parte | O que entra | Testes |
|---|---|---|
| **3a** | `shamir-gf256.js` (dividir, juntar, recusar misturas e M fora da faixa) | vetores fixos; todo subconjunto de M pedaços devolve o segredo; M−1 pedaços dão resultado diferente do segredo; splitId misturado recusado |
| **3b** | Mensagens `pedaco`/`recibo`/`revoga`, guarda no guardião, mapa na dona, tela de escolher, saída com M recibos | assinatura de outra conta recusada; envelope de terceiro recusado; limite de 20 donas; revoga apaga; limpeza local leva junto; saída só com M recibos |
| **3c** | Pedido e resposta (chave temporária, link, código curto, caixa `vxtmp_`), juntar no aparelho novo; QR maior | pedido velho recusado; resposta para outra chave não abre; M respostas → mesmo `routeId`, DM e semente; navegador com rede bloqueada nos testes de tela |
| **3d** | Trocar e tirar guardiões | divisão antiga não junta com a nova; remover tudo tira a saída |

Cada parte é um PR, com SW novo quando tocar o cliente, e a 3c só entra depois do THREAT-MODEL T25 revisado.

**Andamento:** 3a em main (`shamir-gf256.js`); **3b no SW v7.117** — `guardians.js` (mensagens, mapa da dona, guarda), `app/guardians-flow.js` (envio, recebimento, parar de guardar) e a tela `#/guardioes`. Na implementação, o laço mútuo é: a dona segue ou tem a pessoa nos contatos **e** recebeu dela o aviso assinado "adicionou você aos contatos".

## 12. Decisões do mantenedor (2026-11-14, antes da 3b)

1. **Volta para o aparelho novo: pessoalmente ou pela caixa postal.** A `resposta` vai por WebRTC direto quando os dois aparelhos estão juntos **e**, quando há um relay, pela caixa postal cega no endereço temporário `vxtmp_` (§7.4). No piloto sem relay público, na prática só a volta pessoal funciona; a tela diz isso em vez de prometer.
2. **Guardião só com laço mútuo:** a lista de escolha mostra só quem **segue a dona e é seguido por ela**, e tem chave de DM conhecida. Laço de mão única (ou conta recém-criada que só segue) não aparece.
3. **Padrão 3 de 5** no piloto. A tela aceita de 2 de 3 a 7 de 7 (§3), mas abre em 3 de 5.
