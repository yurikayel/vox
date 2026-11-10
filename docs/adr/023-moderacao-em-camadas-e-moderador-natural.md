# ADR-023: Moderação em camadas — comunidade, moderador natural assimétrico e vínculo assinado

**Status:** accepted · vínculo assinado implementado (PM-82, SW v7.54); moderador natural a implementar (PM-83) · **Revisado:** 2026-11-10 · **Relacionados:** [ADR-020](./020-postura-de-operacao-do-piloto-g1.md) (uma denúncia arquiva), PM-69, PM-81, [spec moderador-natural-v0](../specs/moderador-natural-v0.md), [GOVERNANCE](../../GOVERNANCE.md), [THREAT-MODEL T19](../THREAT-MODEL.md)

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
