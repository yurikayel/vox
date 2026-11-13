# Voluntariado no piloto: três trabalhos

> **Status:** canônico (decisão do mantenedor) · **Owner:** mantenedor · **Revisado:** 2026-11-09
> Relacionados: [ADR-020](../adr/020-postura-de-operacao-do-piloto-g1.md) (voluntários só em baixo risco), [replicação por grau](../specs/replicacao-por-grau-v0.md).

Para começar, três trabalhos que qualquer pessoa entende em uma frase, faz sem treino, pode repetir muitas vezes e que **não precisam passar pelo mantenedor para valer**.

| # | Trabalho | O que a pessoa faz | Para que serve | Quem confere | Estado |
|---|---|---|---|---|---|
| 1 | **Testar no seu celular** (5 min) | Segue um roteiro guiado: abrir, publicar, ver o post chegar em outro aparelho, desligar e religar a internet. Cada passo: "funcionou" ou "não funcionou" | Descobrir onde o Vox quebra (iPhone, Android fraco, navegadores): REV-14 | O app registra os passos, modelo e navegador, sem dado pessoal | A fazer |
| 2 | **Deixar o Vox ligado na tomada** | À noite, celular carregando no Wi-Fi com o Vox aberto no modo guardião | Numa rede sem servidor, post só chega se houver aparelho ligado | O app conta os dados que entregou de fato | A fazer (REV-15) |
| 3 | **Apontar o que não bate** | Em qualquer tela, toca em "Algo errado aqui?" e escolhe "não funcionou", "não entendi" ou "não faz o que diz" | Bugs, pontos confusos e textos que exageram (DOC-04); matéria-prima da retrospectiva (PIL-03) | A contagem por tela | ✅ No ar (rodapé de todas as telas) |

## Como o trabalho 3 funciona hoje

- Módulos: `client/js/app-feedback.js` (lógica) e `client/js/app/feedback-flow.js` (modal); botão `[data-app-feedback]` no rodapé.
- Guarda **só o nome da tela** (sem endereços nem IDs da rota), o tipo, a versão do app (nome do cache do Service Worker) e uma nota opcional de até 280 caracteres.
- Fica **só no aparelho**. No G1 não há envio automático: a pessoa toca em "Compartilhar apontamentos" e cola no grupo do piloto (Web Share ou área de transferência). O texto já vem com o resumo por tela.
- As opções são sobre o **app**, não sobre posts ou pessoas; o modal lembra que denúncia é pelo menu ⋯ do post.

## Recompensa (por enquanto)

Nome no crédito da versão, para quem quiser, e um contador pessoal. Insígnias e ofícios ficam para depois do piloto.

## O que evitar

Ranking público, sequência que pune quem falha, dinheiro ou token, prêmio por convite, gamificar engajamento em post político ou denúncia.

## Ordem de construção

1. Apontar o que não bate (feito).
2. Testar no seu celular (dá para estrear num mutirão do piloto).
3. Deixar ligado (o mais caro e o que mais muda a rede).
