# ADR-038: Subrede — a comunidade é um território assinado na malha mais um manifesto que só sugere

**Status:** proposed (2026-11-17; só documentação, nada implementado) · **Revisado:** 2026-11-17 · **Relacionados:** [spec do manifesto v1](../specs/community-manifest-v1.md) (substitui o [rascunho v0](../specs/community-module-manifest-v0.md)), [ADR-012](./012-soberania-digital-cintura-fina-cartuchos-webxdc.md) (cartuchos Webxdc em sandbox), [ADR-013](./013-sistema-voxels-e-conquistas-civicas.md) (voxels e conquistas), [ADR-027](./027-autorizacao-no-relay-dono-e-origem.md) (autorização no relay), [ADR-028](./028-ponte-activitypub-via-bluesky.md) (Fediverso só na borda), [ADR-036](./036-agilidade-criptografica-pos-quantica.md) (todo formato diz o seu algoritmo), [THREAT-MODEL](../THREAT-MODEL.md) (T1, T15, T22, T28), [ROADMAP](../ROADMAP.md) (PM-09, EXP-03)

## 1. Contexto

Uma comunidade no Vox hoje é um post `community` assinado, com `communityId`, e uma série de posts `community_update` que mudam foto, título, descrição, categoria e modo de publicação. Quem pode mudar já está decidido no código desde o PM-09 (`client/js/community-updates.js`, `client/js/cache-node.js` `isCommunityUpdateAcceptable`): o dono, que vem só do post canônico `c_<communityId>`, e os moderadores listados nele. O gossip não grava nem repassa update de outra chave (T15).

O que falta é a comunidade poder **sugerir** como o seu canto da rede funciona: cores, quais relays e servidores de sinalização ela mesma mantém, e, mais tarde, cartuchos próprios. O rascunho [community-module-manifest-v0](../specs/community-module-manifest-v0.md) (Horizonte C, 23/10) começou isso só para infraestrutura, com `governance.binding` sempre falso e a regra de nunca aplicar sozinho, mas não disse quem assina, como as versões andam nem o que fazer com tema e extensões.

A proposta do mantenedor organiza a rede em **três anéis**:

| Anel | Quem decide | O que muda | Onde vive |
|---|---|---|---|
| Global | o projeto (código, ADRs) | protocolo, assinatura, interface de segurança | o app |
| Comunidade | dono e moderação da comunidade | sugestões: tema, infra, mais tarde cartuchos | território assinado na malha + manifesto |
| Pessoa | a própria pessoa | o que aceita das sugestões, o que liga e desliga | o aparelho dela |

Um anel de fora nunca passa por cima de um de dentro: a comunidade não muda o que o app garante, e a pessoa pode recusar qualquer sugestão da comunidade. O ADR-037 (cofre na malha) é o eixo pessoal da malha; este ADR é o eixo coletivo. O Fediverso fica só na borda, pela ponte do ADR-028; uma subrede não é uma instância ActivityPub.

## 2. Opções

1. **Comunidade como servidor** (estilo instância do Fediverso ou servidor de Discord). Recusada: cria um centro que pode cair, ser comprado ou receber ordem, e contraria o local-first.
2. **Manifesto com poder de mandar** (aplica tema, troca relay e carrega código sem perguntar). Recusada: uma chave de dono roubada viraria um ataque a todos os membros de uma vez, e o relay escolhido pela comunidade passaria a ver os metadados de quem nunca escolheu esse relay.
3. **Território assinado na malha + manifesto que só sugere, com a mesma regra de permissão do PM-09.** **Escolhida.**

## 3. Decisão

### 3.1 O que é uma subrede

Uma subrede é:

- o **território**: o `communityId`, o post canônico `c_<communityId>` (que define o dono e os moderadores) e os `community_update` aceitos pelo PM-09 (nada muda aqui);
- mais o **manifesto**: um item assinado e versionado, tipo `community_manifest`, que circula pela malha como qualquer post e descreve as sugestões da comunidade. O formato está na [spec v1](../specs/community-manifest-v1.md).

Não há servidor da comunidade, lista central de comunidades nem registro de nomes. Duas comunidades com o mesmo título são duas comunidades; o que as distingue é o `communityId`.

### 3.2 Quem assina o quê: a regra do PM-09, sem segundo modelo de permissão

O manifesto **reusa a regra de aceitação do `community_update`**. A mesma função decide se o autor pode falar pela comunidade (`canUpdateCommunity`: dono do post canônico ou moderador listado nele), e o mesmo portão do gossip (`isCommunityUpdateAcceptable`, estendido para o tipo novo) recusa gravar e repassar manifesto de outra chave. Não existe papel novo, lista de permissões própria do manifesto nem delegação.

Por cima dessa regra, cada campo tem um dono:

| Campo | Dono pode mudar | Moderador pode mudar | Por quê |
|---|:---:|:---:|---|
| `about` (texto de apresentação, regras da casa, links) | sim | sim | é o mesmo tipo de coisa que a moderação já muda hoje (título e descrição) |
| `theme` | sim | sim | só sugere cores de uma lista fechada (§3.4); não executa nada |
| `modules[]` | sim | **não** | aponta para infraestrutura que vai ver metadados de quem aceitar (§3.5) |
| `extensions[]` (v2) | sim | **não** | é código (§3.6) |

Um manifesto de moderador que traga `modules` ou `extensions` é **recusado inteiro** (não só o campo), para que o erro apareça em vez de sumir em silêncio. Os campos são resolvidos por grupo (§3.3), então um moderador mudar o texto nunca desfaz o que o dono pôs em `modules`.

A autoridade é conferida contra o registro atual da comunidade, como o `applyCommunityUpdates` já faz: se um moderador deixa de constar, os manifestos dele deixam de valer no próximo cálculo.

### 3.3 Versões: `issuedAt` só cresce, sem volta

- Cada manifesto traz `issuedAt` (milissegundos) e `prev` (hash do manifesto em que se baseou, ou `null` no primeiro).
- O aparelho guarda todos os manifestos válidos que recebe para a comunidade e calcula o efetivo **por grupo de campos**: o grupo do dono (`modules`, `extensions`) vem do manifesto do dono com o maior `issuedAt`; o grupo do texto (`about`, `theme`) vem do manifesto de dono ou moderador com o maior `issuedAt`.
- **Sem volta (rollback):** o efetivo de um grupo nunca anda para um `issuedAt` menor que o já visto. Reenviar um manifesto antigo e válido não muda nada, porque ele perde na comparação.
- **Futuro limitado:** manifesto com `issuedAt` mais de 10 minutos à frente do relógio do aparelho fica guardado mas não vale até o relógio chegar lá. Sem isso, um moderador poderia emitir com o ano 9999 e travar a comunidade para sempre.
- **Dois moderadores ao mesmo tempo:** o maior `issuedAt` vence o grupo do texto inteiro; no empate exato, vence o maior hash do manifesto (comparação de bytes). Todos os aparelhos que virem o mesmo conjunto chegam ao mesmo resultado, em qualquer ordem de chegada. A mudança de quem perdeu não se mistura: some do efetivo e continua no histórico, com `prev` mostrando que as duas partiram da mesma versão. Mesclar campo a campo dentro do texto foi descartado: produz um texto que ninguém escreveu.
- **Troca de dono:** hoje ela não existe. O dono vem só do post canônico `c_<communityId>`, que não muda (PM-09, T15). Este ADR não cria a troca. Quem quiser outro dono faz um fork (§3.7). Se um ADR futuro criar a passagem de dono, a regra fica fixada aqui: manifestos do dono antigo com `issuedAt` posterior à passagem deixam de valer, e o dono novo só herda o grupo do dono emitindo um manifesto próprio com `issuedAt` maior que o da passagem.

### 3.4 `theme`: lista fechada de tokens, contraste conferido, nada que imite o app

- O tema é **só** uma lista fechada de tokens de cor (a lista e os formatos estão na [spec §4](../specs/community-manifest-v1.md#4-theme)). Cada valor é uma cor `#rrggbb`; nada de CSS livre, `url()`, fonte remota, imagem de fundo ou seletor. Isso mantém a CSP sem estilo vindo da rede e fecha o caminho de injeção pelo tema (T1).
- O cliente confere o contraste antes de aplicar: texto sobre fundo e texto sobre a cor de destaque precisam de pelo menos 4,5:1 (WCAG 2.1 AA). Tema que não passa não é aplicado; a pessoa vê o tema padrão e um aviso discreto para a moderação.
- O tema só vale **dentro das telas da comunidade** (feed, perfil e tela de entrar da comunidade). Fora delas, nada muda.
- **A interface global não é tematizável.** Avisos de segurança, pedidos de confirmação, a faixa de pedido de volta do cofre ("Foi você?", ADR-037), a barra de navegação, o selo de assinatura e qualquer tela de identidade, cofre ou guardiões usam sempre as cores do app. O tema também não pode criar elemento novo: não tem texto, ícone ou posição. Assim uma comunidade não consegue montar uma faixa falsa de "Foi você?" ou um selo falso de verificado com as próprias cores.

### 3.5 `modules[]`: nunca aplicar sozinho

- `modules[]` lista infraestrutura que a comunidade sugere: espelho de índice, TURN, `ar-pool`, sinalização e relay HTTP (os tipos do rascunho v0).
- **O manifesto nunca aplica um módulo.** Cada um aparece como sugestão em Ajustes → Rede, e só passa a valer quando a pessoa toca em usar, um por um. A escolha fica no aparelho e vale para aquela pessoa (anel da pessoa).
- Antes de aceitar, a tela diz em linguagem simples o que aquele serviço passa a ver: endereço IP, horários, com quem a pessoa conversa e quanto, mesmo sem ler o conteúdo. É o risco de metadados do relay já descrito em T22 e, para a sinalização, o da tabela de ativos (endereço IP). Aceitar um relay da comunidade é confiar em quem opera esse relay.
- Um manifesto novo que tira ou troca um módulo **não** troca a escolha da pessoa sozinho: o módulo aceito continua ligado e aparece marcado como "a comunidade não sugere mais". Trocar de servidor por ordem de um manifesto seria o mesmo ataque da opção 2 por outro caminho.
- Segredos (senha de TURN, token) nunca vêm no manifesto, que é público.
- `governance.binding` do v0 sai: no v1 nada é vinculante, e o campo deixaria a impressão contrária.

### 3.6 `extensions[]`: código da comunidade só na v2

- O v1 **não aceita** `extensions[]`. Um manifesto v1 que traga o campo é recusado.
- Na v2, uma extensão será um cartucho Webxdc (ADR-012), referenciado **por hash** do pacote (SHA-256 com o algoritmo declarado, ADR-036), rodando no sandbox do ADR-012 (`iframe sandbox="allow-scripts"`, origem opaca, rede zero). Trocar o pacote muda o hash, e a pessoa aceita de novo.
- A v2 pede ameaça própria no THREAT-MODEL antes do código: cartucho que tenta sair do sandbox, que imita a interface global dentro do próprio quadro, que gasta CPU ou armazenamento do aparelho, e dono que publica uma versão maliciosa depois de ganhar confiança.

### 3.7 Fork (EXP-03): `communityId` novo, manifesto derivado

- Fork é uma **comunidade nova**: novo `communityId`, novo post canônico assinado por quem fez o fork, que vira o dono, e moderadores escolhidos por ele.
- O manifesto da nova comunidade pode **derivar** do original: copia `about`, `theme` e `modules` e declara `forkOf: { communityId, manifest }` (o hash do manifesto de origem). `forkOf` é só informação, para a tela mostrar "derivada de". Não dá nenhum direito sobre a comunidade de origem e não é conferido contra ela.
- Os posts antigos continuam sendo da comunidade de origem. Quem quiser seguir as duas segue as duas. Não há migração automática de membros: cada pessoa entra na nova se quiser.
- Fork é a saída quando a moderação diverge ou o dono some, sem precisar de voto nem de um servidor que arbitre.

### 3.8 O que fica de fora

Cotas e capacidades por comunidade, cobrança, nota pública de comunidade, imposição de relay e qualquer forma de a comunidade bloquear quem não aceita as sugestões dela.

## 4. Consequências

**Ganha:**
- Comunidades podem ter cara e infraestrutura próprias sem criar centro e sem um segundo modelo de permissão.
- Chave de dono roubada não liga infraestrutura nem código no aparelho de ninguém; no máximo sugere, e a pessoa vê a sugestão.
- Fork vira uma operação comum, que não depende de ninguém concordar.

**Perde ou custa:**
- Com o dono fixo no post canônico, comunidade cujo dono sumiu só sai do lugar por fork.
- Tema por lista fechada é pobre de propósito; comunidade que quer mais terá de esperar extensões (v2) ou pedir token novo por PR.
- Cada pessoa decide módulo por módulo, o que dá menos adesão aos relays da comunidade do que um "aplicar tudo".
- Guardar todos os manifestos válidos ocupa espaço; a spec limita quantos guardar por comunidade.

**Riscos:** registrados em [T28](../THREAT-MODEL.md) (manifesto de comunidade: chave de moderação roubada, tema enganoso, relay sugerido que vigia).

## 5. Próximos passos

1. Revisão e aceite deste ADR e da spec v1 pelo mantenedor.
2. Código do v1 (cliente): tipo `community_manifest`, portão no gossip junto do PM-09, cálculo do efetivo por grupo, tela de sugestões em Ajustes → Rede, tema só nas telas da comunidade. Cada passo com teste de cada regra (§3.2 a §3.5) antes do código, como no PM-09.
3. Spec de fork (EXP-03) a partir do §3.7, se o v1 for aceito.
4. v2 (`extensions[]`) só depois de ameaça própria e da revisão do sandbox do ADR-012.
