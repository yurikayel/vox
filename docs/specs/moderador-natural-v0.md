# Moderador natural e vínculo assinado (v0)

> **Status:** vínculo assinado implementado no PM-82; moderador natural (PM-83) com spec aceita, ainda não implementado · **Owner:** mantenedor · **Revisado:** 2026-11-10
> Relacionados: [denúncia que arquiva até a revisão (PM-69)](../ROADMAP.md), [canal (PM-81)](./canal-comunidade-v0.md), `client/js/vox-link.js`, `client/js/app/vox-link-flow.js`, `client/js/report-review.js`.

## Problema

A moderação da comunidade (PM-69) é a única camada que age sobre uma denúncia. Ela não escala: quem modera decide sobre pessoas que não conhece, e enquanto isso o post continua no ar.

Quem convidou alguém para a rede conhece essa pessoa e responde por ela. A proposta é que a denúncia passe por essas pessoas, os **moderadores naturais**, antes de cair na moderação tradicional.

Um impedimento vem antes: **o Vox não sabe quem convidou quem.** O "convite" de hoje é só o link `#/connect/<id>` e um contador de compartilhamentos. Contatos e "seguir" ficam só no aparelho de cada pessoa, e os outros aparelhos não têm como conferir. O PM-82 cria esse dado, e o PM-83 usa.

## PM-82: vínculo assinado

Vínculo é um registro **assinado pelas duas pessoas**. Cada uma assina uma frase que cita a outra. Ninguém ganha vínculo com alguém sem a assinatura desse alguém.

### Fluxo

1. **Convite.** O link de "Convide amigos" (o seu `#/connect/<você>`) passa a levar um token: `#/connect/<A>?convite=<token>`. O token tem 16 bytes aleatórios em base64url. O aparelho de A guarda o convite ativo: no máximo **10 aceites** e **30 dias** de validade; esgotado ou vencido, gera outro.
2. **Aceite (B assina).** Quem abre o link vê "A te convidou" e o botão **Aceitar vínculo**, com a caixa **"A me trouxe para o Vox (padrinho)"**. O aceite sai assim:
   ```
   { id: "vlk_acc_<B>_<A>", type: "vox-link", kind: "accept",
     to: A, token, sponsor: true|false, ts }
   ```
3. **Confirmação (A assina).** O aparelho de A vê o aceite chegar pela malha (gossip ou sincronização ao conectar). Se o token é um convite seu, ainda dentro dos limites, ele confirma sozinho:
   ```
   { id: "vlk_<A>_<B>", type: "vox-link", kind: "confirm",
     to: B, token, sponsor, accept: "<aceite de B, em JSON>", ts }
   ```
   A confirmação é o vínculo.

O app lê os vínculos do banco na forma assinada (`cacheNode.getWirePosts()`). Antes da correção do PR yurikayel/vox#49, o post guardado não batia com a assinatura, e o aceite nunca seria confirmado.

### Regras de validade

Qualquer aparelho confere o vínculo sozinho, sem servidor. Ele vale se todas as condições abaixo fecham:

- as duas assinaturas são válidas;
- o aceite cita quem confirmou (`accept.to === confirm.author`);
- a confirmação cita quem aceitou (`confirm.to === accept.author`);
- o token e a marca de padrinho são iguais nas duas metades;
- as duas pessoas são diferentes.

**Por que o aceite vai como texto JSON, e não como objeto.** O texto que o Vox assina (`canonicalString` em `local-account.js`) só cobre as chaves de primeiro nível. Num objeto aninhado, as chaves internas que não coincidem com as de fora **não entram na assinatura**. Como texto, o aceite inteiro fica coberto pela assinatura de A.

### Padrinho

- O padrinho é quem B marcou na caixa ao aceitar.
  - Para uma conta nova, a caixa vem marcada.
  - Para quem já tem conta, a caixa vem desmarcada, e o vínculo vira um vínculo comum, base da "pessoa mais próxima" no PM-83.
- O aparelho de B só assina **um** aceite de padrinho. Depois disso, a caixa não aparece mais.
- Se, mesmo assim, circularem dois registros de padrinho de B (de um cliente modificado), os dois valem. Só B sai prejudicado, porque padrinho é quem pode arquivar posts de B.

### Privacidade

O vínculo **não vai ao Arweave**, mas circula pela malha e é enviado à **memória central** (servidor de steward), como todo item gravado no aparelho. Qualquer aparelho conectado, e quem opera a memória central, consegue ver quem convidou quem. Para quem atua em política isso é sensível, e por isso o aceite diz isso antes do botão. Quem não aceita não fica com vínculo nenhum; nesse caso, a denúncia contra essa pessoa segue direto para a moderação tradicional.

## PM-83: moderador natural (a implementar)

### Quem recebe a denúncia

Além da moderação da comunidade (PM-69), a denúncia vai, por mensagem cifrada, para:

| Moderador natural | Se confirmar | Sabe quem denunciou? |
|---|---|---|
| **N1:** padrinho do denunciado (sem padrinho, a pessoa mais próxima dele) | **Arquivamento firme:** o post some para todos na hora. Só a moderação da comunidade desfaz ("Volta para todos") | Não. Vê o post, o motivo e que veio de um membro verificado |
| **N2:** padrinho de quem denunciou (sem padrinho, a pessoa mais próxima dela) | **Em revisão:** o post fica escondido, mas a moderação pode reverter. A confirmação vai para a moderação, que aplica pelo caminho do PM-69 | Sim, é afilhado dele |
| Ninguém confirma em 48 h | Cai na moderação tradicional (PM-69), como hoje | — |

- **Pessoa mais próxima:** o vínculo comum mais antigo da pessoa, dando preferência a quem é membro da comunidade. Nunca a outra parte da denúncia.
- **Como os outros aparelhos aceitam o arquivamento de N1:** ele leva junto a prova do vínculo entre N1 e o autor do post. A denúncia só avisa N1. Quem decide é N1, que responde pelo afilhado.

### Arquivar não é apagar

No Vox, "apagar" um post de outra pessoa sempre significa escondê-lo na malha. O que já foi para o Arweave fica lá. Só o próprio autor pode emitir a remoção (tombstone) do que publicou.

## Crítica do desenho

| Ataque ou falha | O que acontece | Mitigação |
|---|---|---|
| Duas contas: alguém denuncia com uma e confirma com a outra, que é o padrinho dela | O post só fica **em revisão**, e a moderação reverte | Confirmação assimétrica: só o lado do denunciado arquiva de vez |
| O denunciado cria contas falsas e as aceita como padrinho ou vínculo | A falsa nunca confirma, e o caso cai na moderação em 48 h | O ataque só **atrasa**. Dar poder sobre um post de outra pessoa exige a assinatura dessa pessoa |
| Link de convite publicado em grupo grande | Quem compartilhou vira padrinho de desconhecidos | No máximo 10 aceites por convite, 30 dias de validade, e o botão avisa |
| Padrinho que abusa e arquiva o afilhado | O post some até a moderação reverter | Reversível. A partir de 3 reversões, o padrinho perde o papel (no PM-83) |
| Padrinho offline | Ninguém confirma | 48 h e cai na moderação |
| Datas do vínculo | A data é escrita pelas partes, então "mais antigo" pode ser forjado por quem combina | Só serve contra terceiros, e quem combina só atrasa o próprio caso |
| Grafo social exposto na malha | Quem convidou quem fica visível | Consentimento no aceite. O vínculo não vai ao Arweave, mas passa pela memória central |
| Assinatura aninhada | Campos de objetos aninhados ficam fora da assinatura | O aceite vai como texto. O mesmo problema afeta os `photoTags` dos posts e fica para um passo próprio |

## Fora desta versão

- Telas "quem eu convidei", "meus vínculos" e revogação de vínculo.
- Selo "convidado por" no perfil.
- Renovar o convite à mão, invalidando o token em circulação.

## PM-83 em lotes (emenda 1 do ADR-023)

Atrás da flag de laboratório `localStorage["vox.lab.moderador"] = "1"`. Lógica pura em `client/js/natural-mod.js`.

### Lote A (11/11/2026): quem responde por quem e "Meus vínculos"

- `collectLinks` aceita só vínculos com as duas assinaturas conferidas (`verifyLink`). Par repetido conta uma vez, pela data mais antiga.
- `naturalModeratorOf(pessoa)`: o padrinho, se não for parte do caso. Senão, o mais próximo: vínculo comum em qualquer direção, membro da comunidade primeiro, depois o mais antigo. Nunca a própria pessoa nem a outra parte.
- `caseModerators({ target, reporter })` dá N1 (lado do denunciado) e N2 (lado de quem denunciou).
- **Meus vínculos**, no topo da tela Pessoas: padrinho (ou o mais próximo, ou "sem vínculos: vai para a moderação da comunidade"), afilhados e vínculos comuns.
- **Peso:** `cantina-gate.jpg` virou `cantina-gate.webp` (119 para 79 KB, visualmente igual). A folga pagou os lotes A a F; o teto desceu para 0,2% acima do medido (2.012.013 bytes).

### Lote E (11/11/2026): mediação pelos moderadores naturais

- Com a flag ligada, **Pedir mediação** (menu ⋯ do post) manda uma mensagem cifrada ao moderador natural de cada parte: N1 do lado de quem publicou e N2 do lado de quem pede. A mensagem leva o cartão do post e o texto "Ninguém arquivou nada". Quando os dois lados dão a mesma pessoa, ela recebe uma vez.
- Diferente da denúncia, quem pede mediação **é identificado**: mediação é conversa.
- É uma DM comum (`kind: "message"` com cartão), e qualquer aparelho já a mostra. Não passa pela malha e não arquiva nada.
- Se ninguém tem vínculo, ou se nenhum destinatário tem chave de DM, cai no caminho do lote 3: a conversa com quem modera a comunidade.

### Lotes B, C e D (11/11/2026): denúncia aos moderadores naturais, arquivamento firme, teto e reversões

- **Aviso de caso (B):** com a flag ligada, cada lado recebe uma mensagem cifrada (`kind: "moderacao-natural"`) com o post, o motivo e o autor do post. O aviso **nunca leva quem denunciou**.
  - **N1** (lado de quem foi denunciado) é avisado pelo **aparelho da moderação da comunidade**, quando ele recebe a denúncia assinada (PM-69). Se o aviso saísse de quem denunciou, a conversa cifrada mostraria o remetente a N1.
  - **N2** (lado de quem denunciou) é avisado por quem denunciou. N2 sabe quem é pela própria conversa, e é o afilhado ou o próximo dele.
  - Se N1 e N2 forem a mesma pessoa, ela recebe só o aviso de N1, que não revela quem denunciou.
  - **O caso guardado no aparelho do moderador natural** tem só o necessário para decidir (post, comunidade, autor do post, motivo e lado). Quem denunciou e quem mandou o aviso não ficam guardados.
  - **Motivo grave** (imagem íntima, abuso infantil, violência) **não vai** ao moderador natural. Segue pela moderação e pelos canais oficiais, sem expor o conteúdo a mais gente.
- **Decidir (B e C):** os casos aparecem em Pessoas → Meus vínculos.
  - **Arquivar para todos:** só N1 com vínculo de padrinho e poder firme. Publica `natural-hide`, assinado, com a confirmação do vínculo de padrinho como texto (`proof`).
  - **Concordo: mandar para revisão:** N2, ou N1 sem poder firme. Avisa quem modera a comunidade por mensagem cifrada; o post já está em revisão pelo PM-69.
  - **Não quero decidir:** avisa a moderação na hora, sem esperar 48 h.
- **Leitura conservadora da emenda:** só o vínculo de **padrinho** dá arquivamento firme. A "pessoa mais próxima" depende do grafo inteiro, e cada aparelho conhece só uma parte, então ninguém de fora consegue conferir essa escolha. Por isso a confirmação dela vai à moderação, como revisão.
- **Como os outros aparelhos aceitam (C):** `fetchModActions` confere cada `natural-hide`: assinatura, prova do vínculo de padrinho e o padrinho ser quem arquivou. Daí constrói uma ação marcada `naturalVerified`, e ação vinda de fora perde essa marca. O post some como "em revisão": o autor e a moderação veem, e o `unhide` da moderação desfaz. Arquivamento sobre post de outra pessoa que não o afilhado não esconde nada.
- **Teto e reversões (D):**
  - O poder firme vale para os **30 primeiros afilhados** pela data do vínculo.
  - O padrinho perde o poder com **3 reversões em 90 dias**: `unhide` da moderação daquela comunidade depois de um arquivamento dele, contadas até cada arquivamento.
  - **Limite:** um aparelho que não conhece todos os vínculos antigos de um padrinho pode contar a posição do afilhado para menos.

### Lote F (11/11/2026): trocar de padrinho e vínculo só para mediação

- **Vínculo só para mediação:** ao aceitar um convite, a pessoa pode marcar "Só para mediação". O aceite leva `scope: "mediacao"`, e só quem aceita assina isso, então aparelhos antigos continuam confirmando o vínculo.
  - Esse vínculo serve para pedir mediação (lote E), mas nunca para denúncia, para arquivar ou para a lista de afilhados.
- **Trocar de padrinho:** quem já tem padrinho pode aceitar o convite de outra pessoa marcando "Trocar meu padrinho". O aceite leva `sponsor: true` e `switchFrom: <padrinho de antes>`, e quem convidou confirma como sempre, de modo que as duas partes assinam.
  - A troca vale **7 dias depois** da confirmação. Até lá, o padrinho de antes continua, e "Meus vínculos" mostra a data.
  - **Uma vez só:** o aparelho não oferece segunda troca.
  - Depois da troca, o padrinho de antes perde o afilhado (e o poder firme sobre ele).
- As opções novas do cartão do convite só aparecem com a flag `vox.lab.moderador`.
