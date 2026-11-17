# ADR-033: IA só no RPG, primeiro no próprio aparelho; serviço externo só com a chave da mesa e o consentimento de todos

**Status:** accepted (2026-11-16, pelo mantenedor; nenhuma IA implementada — o AI Social Dungeon é demonstração sem IA) · **Revisado:** 2026-11-16 · **Relacionados:** [spec AI Social Dungeon](../specs/ai-social-dungeon-v0.md), [ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md), [COMPLIANCE-BR](../legal/COMPLIANCE-BR.md), [THREAT-MODEL](../THREAT-MODEL.md)

## 1. Contexto

O laboratório AI Social Dungeon chegou com telas que diziam mais do que o código fazia:
- um narrador marcado "IA Local" ou "Sabiá-3 BR", quando eram três frases fixas;
- um seletor de "Cérebro de IA" com a Maritaca, sem nenhuma chamada de rede;
- um bônus de prioridade (+10000) para o aparelho com chave da Maritaca, que faria a narração da mesa inteira ir para um serviço pago sem ninguém escolher isso;
- guardiões "online", recibos de GPU emprestada, um compromisso de dado com hash inventado e um cofre de Shamir "aberto" por um contador.

O Vox é rede cívica. Texto gerado por máquina no feed, nas votações ou na moderação mudaria o que as pessoas leem como fala de outra pessoa. No RPG, a ficção é declarada e a IA pode ajudar a mesa.

## 2. Opções

1. **Sem IA em lugar nenhum.** Simples, mas fecha a porta para um uso que a comunidade de RPG pede.
2. **IA em qualquer parte do app.** Recusada: mistura texto de máquina com fala cívica.
3. **IA só no RPG, local primeiro, serviço externo só por escolha explícita da mesa.** **Escolhida.**

## 3. Decisão

1. **IA só dentro do RPG** (rotas `#/dungeon…` e `#/labs/dungeon`), na faixa "isolado do feed cívico". Nada de texto gerado vai para feed, votação, comunidade ou moderação.
2. **Primeiro no próprio aparelho** (ou no aparelho de alguém da mesa), sem servidor do Vox.
3. **Serviço externo (Maritaca ou outro) só se:**
   - a mesa usar a **própria chave** (o Vox não tem chave, conta nem custo em serviço de IA);
   - **todos os jogadores** consentirem antes, sabendo qual serviço recebe o quê; quem não consentir trava o uso para a mesa;
   - o envio levar só o contexto filtrado do papel (inspetor por papel), nunca segredos do mestre nem dados fora do jogo.
4. **Ter chave não dá prioridade.** A escolha de quem narra não favorece quem tem chave de serviço pago (o bônus saiu de `community-pillar-pool.js`).
5. **A tela diz o que é.** Enquanto não houver modelo rodando, o narrador aparece como "Roteiro" e a tela diz "sem IA". Rótulo de modelo só aparece quando um modelo de verdade gerou o texto ([ADR-024](./024-divulgacao-responsavel-e-honestidade-de-seguranca.md)).

## 4. Estado (SW v7.122)

- Demonstração de laboratório: roteiro fixo, sem IA e sem rede; jogadores e guardiões de exemplo.
- De verdade na tela: d20 sem viés neste aparelho e cofre de Shamir (`sealLoreVaultSecret` / `unlockLoreVaultSecret`) com as partes neste aparelho.
- `rpg-maritaca-router.js` fica como função pura (rota e payload), sem tela e sem chamada de rede.

## 5. Consequências

- Ligar um modelo local ou externo pede um PR próprio, com a tela de consentimento da mesa e testes de que nada sai sem ela.
- Revisão LGPD do envio a serviço externo (COMPLIANCE-BR) antes de qualquer chamada de rede.
