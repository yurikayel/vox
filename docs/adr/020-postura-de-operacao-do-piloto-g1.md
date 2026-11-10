# ADR-020: Postura de operação do piloto G1

**Status:** accepted · **Revisado:** 2026-11-10 · **Relacionados:** REV-12 (parecer), LAN-04 (conteúdo grave), LAN-12 (denúncia), LAN-30 (bus factor), REV-23 (menores), [voluntariado](../product/voluntariado-tres-trabalhos.md)

## 1. Contexto

O caminho crítico do G1 é o parecer jurídico (REV-12). O escopo do parecer depende de três escolhas que só o mantenedor pode fazer: quem é o operador, quanto risco os voluntários assumem e se o piloto aceita menores. Descentralizar não apaga dever legal: desde o STF de 2025 (Temas 987/533), quem opera uma peça pode ser tratado como provedor de aplicação.

## 2. Decisão

1. **O mantenedor é o operador** do PWA oficial e dos nós que o projeto mantém. Não se transfere essa responsabilidade a voluntários nem a uma associação de fachada.
2. **Voluntários só em trabalho de baixo risco:** testar, apontar problemas do app, deixar o Vox ligado na tomada com o conteúdo das próprias comunidades, traduzir, escrever documentação, moderar **dentro da própria comunidade** e revisar código. Relay completo público, plantão de conteúdo grave e relay Nostr público ficam com o operador.
3. **Piloto só para maiores de 18 anos.** A confirmação é autodeclarada e fica só no aparelho (`client/js/age-gate.js`); nenhuma data de nascimento ou documento é coletado. Quem aceitou o pacto antes do aviso vê o pacto uma vez mais.
4. **Uma denúncia arquiva** o post até a revisão da moderação (política abaixo).
5. **Proposto, a confirmar com o mantenedor: G1 sem relay completo público.** DM só com as duas pessoas online; cofre e login social desligados no piloto. Menos peças no ar, menos a responder.

### 2.1 Política "uma denúncia arquiva"

A regra (uma denúncia arquiva até a revisão) é decisão do mantenedor. As salvaguardas da tabela são o desenho proposto para implementá-la.

| Regra | Por quê |
|---|---|
| A denúncia continua indo ao moderador por DM cifrada; **quem arquiva para todos é o aparelho do moderador**, automaticamente, ao receber, com uma ação assinada "arquivado, aguardando revisão" | Quem denuncia segue anônimo na malha; chave falsa não arquiva nada; os clientes já obedecem a ações de moderador (`applyFilters`) |
| Para quem denunciou, o post some na hora (como hoje) | Proteção imediata de quem denunciou |
| Só **membros da comunidade** denunciam com efeito de arquivar | Barra contas falsas num piloto por convite |
| O **autor vê "em revisão"** e pode contestar | Transparência e defesa |
| Limite de **3 denúncias pendentes por pessoa**; denúncias seguidas rejeitadas tiram o efeito de arquivar | Evita uso da denúncia como arma de silenciamento |
| **Prazo de revisão visível** (ex.: 48 h); pendências vencidas entram no relatório de transparência | Mede o desgaste e evita fila parada |
| Denúncia contra um moderador vai para outro moderador ou para o operador | Conflito de interesse |
| Motivos graves (`intimo`, `crianca`, `violencia`) nunca vão para revisão comunitária | Exibir esse material a voluntários é, em si, distribuí-lo |

Custo conhecido: no G1 sem relay completo, o arquivamento para todos acontece quando o aparelho do moderador fica online (minutos ou horas). **Implementado no PM-69** (SW v7.46), com estes limites:

- a denúncia vai **assinada pela conta local** de quem denuncia, dentro da DM cifrada, porque o envelope da DM não autentica o remetente; "ser membro" é conferido contra essa conta. Quem usa carteira e entrou na comunidade só com o endereço da carteira cai no caso manual (sem arquivar);
- a ação `review-hide` circula só na malha (não vai ao Arweave, ADR-019); "Mantém arquivado" publica o `hide` de sempre;
- denúncia contra moderador **não arquiva** e fica como caso manual: o encaminhamento automático a outro moderador ou ao operador ainda não existe;
- a contestação do autor é pela conversa com a moderação, e o relatório de transparência das pendências vencidas ainda não existe;
- a fila de casos fica no aparelho de quem recebeu a denúncia.

### 2.2 Depois do piloto (não decidido para o G1)

Júri comunitário de voluntários (sorteio, voto às cegas, casos de treino, biblioteca de precedentes) para revisar denúncias **não graves**, decidindo sobre o post e nunca sobre a pessoa, com o operador podendo reverter.

## 3. Consequências

- **O parecer fica menor:** sai a pergunta sobre voluntário virar provedor e sai a de menores. Restam: o operador pessoa física, Termos de Uso, notificação e remoção, guarda de registros (o Marco Civil obriga provedor **pessoa jurídica**; o parecer diz se e como se aplica), permanência no Arweave e período eleitoral.
- **Saem do caminho crítico do G1:** REV-18 (associação/PJ) e REV-23 (menores); o REV-04 (relay completo público) também, se o item 5 for confirmado.
- **O plantão recai sobre o operador**; a segunda pessoa do LAN-30 vira o substituto. Prometer só o prazo que der para cumprir: o parecer diz se as 2 h são obrigatórias no G1.
- **Antes do G3**, menores e relay completo voltam à mesa.
