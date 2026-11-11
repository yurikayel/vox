# ADR-023: Moderação em camadas — comunidade, moderador natural assimétrico e vínculo assinado

**Status:** accepted · vínculo assinado implementado (PM-82, SW v7.54); moderador natural implementado em laboratório (PM-83, SW v7.74, flag `vox.lab.moderador`) · **Emenda 1 (§4): aceita em 11/11/2026** · **Revisado:** 2026-11-11 · **Relacionados:** [ADR-020](./020-postura-de-operacao-do-piloto-g1.md) (uma denúncia arquiva), PM-69, PM-81, [spec moderador-natural-v0](../specs/moderador-natural-v0.md), [GOVERNANCE](../../GOVERNANCE.md), [THREAT-MODEL T19](../THREAT-MODEL.md)

## 1. Contexto

A moderação da comunidade (PM-69) é a única camada que hoje age sobre uma denúncia. Ela não escala, porque quem modera decide sobre gente que não conhece.

Quem trouxe uma pessoa para a rede a conhece e responde por ela. Mas o Vox não sabia quem convidou quem: o "convite" era só um link.

O mantenedor decidiu, em 10/11/2026, os três pontos que mudam o desenho:
- **Peso da confirmação:** assimétrico.
- **Quem modera quando não há padrinho:** a pessoa mais próxima.
- **Anonimato de quem denuncia:** o padrinho do denunciado vê só o post e o motivo.

## 2. Decisão

1. **Camadas, nesta ordem:**
   1. o próprio aparelho (bloquear, silenciar);
   2. o **moderador natural**;
   3. a **moderação da comunidade** (PM-69: uma denúncia arquiva até a revisão);
   4. o operador (ADR-020), para conteúdo grave.
2. **Vínculo assinado (PM-82)** é a base: um registro assinado pelas **duas** pessoas.
   - **Formato:** o aceite de quem entra vai dentro da confirmação de quem convidou, como texto.
   - **Limites do convite:** até 10 aceites em 30 dias.
   - **Padrinho:** marcado uma vez só, por quem entra.
3. **Moderador natural, assimétrico** (PM-83):
   - **N1, padrinho do denunciado** (sem padrinho, a pessoa mais próxima dele): se confirma, o post é **arquivado para todos, de forma firme**. Só a moderação da comunidade desfaz.
   - **N2, padrinho de quem denunciou** (sem padrinho, a pessoa mais próxima dela): se confirma, o post fica **em revisão**, escondido e reversível pela moderação.
   - **Ninguém confirma em 48 h:** a denúncia cai na moderação da comunidade.
4. **"Pessoa mais próxima"** é o vínculo comum mais antigo da pessoa, com preferência para quem é membro da comunidade. Nunca é a outra parte da denúncia.
5. **Anonimato:** N1 vê **só o post e o motivo**, nunca quem denunciou.
6. **Arquivar não é apagar.** Esconder vale na malha. O que foi ao Arweave fica lá, e só o autor emite a remoção do próprio post.

## 3. Consequências

- **Conta falsa só atrasa.** Para ganhar poder sobre o post de alguém é preciso a assinatura dessa pessoa; o máximo que uma conta falsa faz é atrasar o caso em 48 h.
- **O grafo de convites fica visível** para a malha e a memória central (não para o Arweave). Para a militância, isso é sensível. Por isso o aceite avisa antes do botão (T19).
- **Abuso de padrinho:** um padrinho que abusa perde o papel após 3 reversões (a implementar no PM-83).
- **Ordem de implementação:** o PM-83 depende de assinatura confiável. Convém fechar o PM-85 antes.

## 4. Emenda 1 (11/11/2026): aceita

**Status:** aceita pelo mantenedor em 11/11/2026, com os valores recomendados. Esta emenda não muda as seções 1 a 3; ela as completa antes do PM-83.

### 4.1 Contexto

- O PM-85 (assinatura v2) fechou, e o PM-83 ficou desbloqueado.
- Na conversa com uma participante do piloto, apareceu a objeção "moderador já é hierarquia". A resposta do desenho é que o moderador natural é **responsabilidade por quem você conhece**, e não um cargo:
  - age só sobre quem tem vínculo assinado com ele;
  - age só quando chega uma denúncia ou um pedido de mediação.
- Quatro pontos ficaram em aberto no texto original e precisam de regra antes do código.

### 4.2 Decisões

1. **Mediação antes de punição.** "Pedir mediação" (lote 3 do kit cívico, hoje dirigido a quem modera a comunidade) passa a ir para o **moderador natural das duas partes**: o padrinho, ou o mais próximo, de cada lado.
   - Nesse caminho ninguém arquiva nada.
   - Sem moderador natural de nenhum lado, o pedido segue para a moderação da comunidade, como hoje.
2. **Pessoa mais próxima, só por vínculo assinado.** A ordem é a do §2.4: membro da mesma comunidade, depois o vínculo mais antigo, nunca a outra parte.
   - **Ficam de fora** sinais de interação (curtidas, mensagens, frequência). São vigilância, fáceis de fabricar, e nenhum outro aparelho consegue conferir.
3. **Teto de afilhados com poder firme.** O arquivamento firme (N1) vale para os **primeiros 30 afilhados** de um padrinho, contados pela data do vínculo.
   - Acima disso, a confirmação do padrinho vira "em revisão", como N2.
   - Assim, quem mais divulga o Vox não vira moderador de muita gente.
4. **Perda do papel, por comunidade.** O padrinho perde o papel de N1 numa comunidade depois de **3 reversões em 90 dias**, assinadas pela moderação dessa comunidade.
   - Nas outras comunidades, ele segue padrinho.
   - Qualquer aparelho confere a contagem pelas reversões publicadas.
5. **Recusar sem custo.** O moderador natural pode responder "não quero decidir isso". O caso segue na hora para a próxima camada, sem esperar as 48 h.
6. **Transparência para o afilhado.** "Meus vínculos" mostra quem é o padrinho e quem é o mais próximo, ou seja, quem pode arquivar os posts da pessoa.
7. **Trocar de padrinho**, uma vez:
   - exige o aceite das duas partes, no mesmo formato do vínculo;
   - vale 7 dias depois, para não servir de fuga no meio de um caso.
8. **Vínculo só para mediação** (opcional, por privacidade). Ao aceitar o vínculo, a pessoa pode marcá-lo como "só mediação".
   - Esse vínculo conta para mediação, mas nunca dá poder de arquivar.
   - Continua visível na malha, como todo vínculo (T19).

### 4.3 Consequências

- **O poder fica distribuído e com limite:** ninguém responde por mais de 30 pessoas com poder firme, e o abuso tira o papel só onde aconteceu.
- **Rede pequena ou sem vínculos:** tudo cai na moderação da comunidade, como hoje. O sistema degrada sem quebrar.
- **Mediação ganha um caminho próprio, sem punição.** Ele chega antes do poder de arquivar.
- **Novo dado público:** reversões assinadas por comunidade. Elas dizem que um padrinho errou, mas não dizem quem denunciou.

### 4.4 Ordem de implementação (PM-83, cada lote com seu PR e flag de laboratório)

| Lote | Entrega |
|---|---|
| A | Lógica pura para achar N1 e N2 a partir dos vínculos, e a tela "Meus vínculos" |
| E | "Pedir mediação" para o moderador natural das duas partes |
| B | Denúncia também por mensagem cifrada para N1 e N2 (N1 vê só o post e o motivo), com a recusa sem custo |
| C | Arquivamento firme de N1 com a prova do vínculo, e o caminho de revisão para N2 |
| D | Teto de 30 afilhados e perda do papel por reversões |
| F | Trocar de padrinho e vínculo só para mediação |

### 4.5 Decidido em 11/11/2026

- **Teto:** 30 afilhados com poder firme.
- **Reversões:** contadas por comunidade.
- **Vínculo só para mediação:** oferecido.
