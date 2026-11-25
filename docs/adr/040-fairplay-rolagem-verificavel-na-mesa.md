# ADR-040: Fairplay — rolagem verificável na mesa em três fases, com o Mestre como hub que não pode forjar

**Status:** proposed (só documentação; o código entra em dois PRs depois do aceite) · **Revisado:** 2026-11-25 · **Relacionados:** [ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md) (honestidade de segurança), [ADR-033](./033-ia-so-no-rpg-local-primeiro.md) (o RPG fica isolado do feed cívico), [ADR-036](./036-agilidade-criptografica-pos-quantica.md) (todo formato diz o seu algoritmo), [spec Subversus VTT §7 e §10](../specs/subversus-vtt-v0.md), [THREAT-MODEL](../THREAT-MODEL.md)

## 1. Contexto

Hoje a rolagem de dados da Mesa Soberana (Subversus) é sorteada no aparelho de quem rola e chega aos outros pronta, numa operação `ROLL_RECORDED` assinada. A assinatura prova **quem** registrou, não que o número foi sorteado com honestidade: quem rola pode repetir em segredo até sair o valor que quer.

O repositório já tem as peças do protocolo Commit-Reveal² em `client/js/rpg-crypto-table.js`: compromisso duplo por SHA-256, backup da semente em partes Shamir GF(256) e sorteio sem viés por rejeição. O adaptador `client/js/dungeon/vtt-fairplay-roll.js` (#495) já separa o que é público (`commit`), o que fica no aparelho (`secret`, a semente) e as partes de backup (`shares`, uma por par), e só aceita revelação de quem se comprometeu na mesma rolagem. O que falta é **levar isso pela rede da mesa**, e aí aparecem escolhas que mudam a garantia. Por isso este ADR vem antes do código.

### 1.1 Como a rede da mesa funciona hoje

`client/js/dungeon/vtt-sync.js` monta uma **estrela**: o Mestre é o hub. O jogador manda `ACTION_OP` ao Mestre; o Mestre aplica, filtra o que cada jogador pode ver (`projectStateForPlayer`, Zero-Spoiler) e reenvia `COMMIT_OP`. Toda operação é assinada com ECDSA P-256 pela chave de quem a criou (`signVttOp`), e o Mestre confere (`verifyVttOpSignature`). Consequência: o Mestre **não consegue forjar** a operação de um jogador, mas **consegue segurar, atrasar ou não repassar** qualquer mensagem.

## 2. Decisão

### 2.1 Três fases, todas como operações assinadas no log da campanha

| Fase | Operação | Quem manda | Conteúdo |
|---|---|---|---|
| Abertura | `FAIRPLAY_OPEN` | quem pede a rolagem | `rollId` novo, fórmula, visibilidade, lista de participantes (os pares conectados naquele momento, no mínimo 2) e prazo de cada fase |
| 1. Compromisso | `FAIRPLAY_COMMIT` | cada participante | só o `commit` (sem semente, sem partes) e uma parte de backup **cifrada** para cada um dos outros participantes |
| 2. Revelação | `FAIRPLAY_REVEAL` | cada participante, só depois de ver o compromisso de todos | a semente |
| Recuperação | `FAIRPLAY_SHARE` | quem guarda parte de alguém que não revelou | a parte em claro (a fase de revelação já fechou) |
| Fechamento | `ROLL_RECORDED` com `fairplay` | quem pediu | resultado e referência ao `rollId` |

O sorteio sai de `resolveFairplayRoll` sobre o que está no log. A ordem das fases é imposta pelo próprio protocolo: revelação antes de todos os compromissos é recusada, e compromisso depois da primeira revelação também.

### 2.2 Ninguém confia no selo de outro par

O campo `fairplay` do `ROLL_RECORDED` não é uma afirmação de verdade: **cada aparelho refaz a conta** a partir das operações de compromisso, revelação e recuperação que recebeu, e só mostra o selo "✓ Verificada" se o resultado recalculado bater com o registrado. Uma rolagem que não fecha (fraude, falta de quórum, operação faltando) aparece como **"não verificada"**, nunca como verificada.

### 2.3 Chaves só da mesa, sem tocar em identidade

As partes de backup precisam ir cifradas para cada destinatário; senão o Mestre, que repassa tudo, juntaria o quórum e saberia a semente antes da revelação. Para isso cada par publica, ao entrar na sala, uma **chave ECDH P-256 efêmera da sessão** numa operação assinada (`FAIRPLAY_KEY`). As partes vão cifradas com ECDH + HKDF-SHA-256 + AES-GCM, com o `rollId` e os dois `peerId` como dados associados. A chave efêmera vive só na memória da sessão e não tem relação com a chave de identidade nem com a de DM: **não mexe em `identity/`**, que está congelada, nem no `crypto-dm.js`. O formato carrega o nome do algoritmo (`alg: "ecdh-p256+hkdf-sha256+aes-256-gcm"`), como pede o ADR-036.

### 2.4 Escopo da v0

- **Só rolagens públicas.** Rolagens "Somente Mestre" e "Cega" continuam locais, sem selo: os jogadores não veem o valor, então não teriam o que verificar. Uma versão com compromisso público e valor escondido fica para depois.
- **Jogo sozinho e mesa de demonstração** seguem com a rolagem local, sem selo.
- **Mínimo de 2 participantes.** O quórum Shamir é `M = ⌈N/2⌉ + 1` partes de `N − 1` (cada par guarda uma parte de cada outro), limitado a `N − 1`.
- **Prazo por fase:** 20 s por padrão, ajustável na abertura. Estourou o prazo, a fase fecha com o que chegou.

## 3. O que este desenho garante e o que não garante (ADR-024)

**Garante:**
- Quem pede a rolagem não escolhe o número: o resultado depende das sementes de todos, e cada semente foi fixada antes de alguém ver as outras.
- Quem some depois de ver as outras revelações não anula a rolagem, desde que o quórum de partes chegue: a semente dele é recuperada e confere com o compromisso.
- Ninguém, nem o Mestre, transforma uma rolagem que não fecha em "verificada" na tela dos outros.

**Não garante (limites honestos, visíveis na interface):**
- **O Mestre pode censurar.** Como hub, ele pode não repassar revelações ou partes; a rolagem fica "não verificada". Isso aparece, mas não é impedido.
- **Abortar e pedir de novo.** Quem não gosta do rumo pode deixar a rolagem não fechar e abrir outra. Mitigação: toda rolagem aberta fica no log, e a Crônica mostra quantas rolagens não fecharam por pessoa. A punição é social, não técnica.
- **Conluio de quórum.** Se `M` participantes combinarem entre si, eles reconstroem a semente de um terceiro antes da revelação. Com 2 ou 3 pares, o quórum é quase todo mundo: a garantia real é contra **um** trapaceiro, não contra a maioria.
- **Sem rede direta entre jogadores.** Tudo passa pelo Mestre. Uma malha completa entre jogadores tiraria o poder de censura, mas é outra decisão.

## 4. Alternativas descartadas

1. **Sorteio só do Mestre com assinatura.** É o que existe; não impede repetir em segredo.
2. **Partes de backup em claro.** Mais simples, mas entrega ao hub o quórum antes da revelação e desfaz o protocolo.
3. **Reusar a chave de DM para cifrar as partes.** Funcionaria, mas encosta em identidade (congelada) e liga o RPG ao resto da conta, contra o isolamento do ADR-033.
4. **Beacon público de aleatoriedade (drand e afins).** Depende de serviço externo e de rede; quebra o uso offline e local-first da mesa.

## 5. Consequências e entrega

- **PR-3a** — fases e verificação: `FAIRPLAY_OPEN/COMMIT/REVEAL/SHARE` no reducer e no filtro de sincronização, recálculo do selo em cada aparelho, prazos. Testes com 3 pares no hub em memória (`createInMemorySyncHub`): rolagem normal, semente adulterada, último revelador que some (com e sem quórum), `fairplay` forjado por outro par, Mestre que segura a revelação, revelação fora de ordem. Partes ainda em claro **só no hub de teste**; a flag fica desligada fora dos testes até o PR-3b.
- **PR-3b** — `FAIRPLAY_KEY` com chave efêmera, cifra das partes (§2.3), selo na Crônica, contagem de rolagens que não fecharam e textos leigos. A flag de laboratório liga só depois deste PR.
- **Custo:** cada rolagem pública passa a esperar duas idas e voltas pela rede (compromisso e revelação). Na mesma rede local, isso é imperceptível; em 4G com TURN, alguns segundos. A interface mostra "rolando com a mesa…" enquanto isso.
- **Revisão externa:** a cifra das partes e o quórum entram na lista de revisão de cripto (LAN-18) antes de a flag sair do laboratório.

## 6. Critérios para rever esta decisão

- Se a mesa ganhar malha direta entre jogadores, rever §3 (censura pelo Mestre).
- Se aparecer abuso de "abortar e pedir de novo" em teste com o mantenedor, avaliar um custo por rolagem que não fecha.
- Se a revisão externa (LAN-18) apontar problema na cifra ou no quórum, este ADR volta para `proposed`.
