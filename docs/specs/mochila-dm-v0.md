# Mochila de DMs (v0): caixa de saída e repasse cego entre aparelhos

> **Status:** parcial (spec aceita; passo 0 implementado no PM-78, passos 1 e 2 não implementados, PM-79) · **Owner:** mantenedor · **Revisado:** 2026-11-10
> Relacionados: [ADR-020 §2.1](../adr/020-postura-de-operacao-do-piloto-g1.md) (denúncia por DM), [replicação por grau](./replicacao-por-grau-v0.md), [relay-api.md](./relay-api.md) (inbox), `client/js/app/dm-wire.js`, `client/js/crypto-dm.js`.

## Problema

Uma DM (e a denúncia do PM-69, que é uma DM) sai por três caminhos, nesta ordem: WebRTC direto, caixa postal do relay (`/inbox`) e, se os dois falham, `pending-retry`. Até o PM-78, **nada reenviava** a mensagem `pending-retry`: ela ficava salva no aparelho de quem mandou e só chegava se a pessoa mandasse de novo. No piloto sem relay, isso quer dizer que a mensagem só chega se o destinatário estiver conectado **no instante** do envio.

A mochila é o caso comum de "usuário como infraestrutura": duas pessoas que ficam online em horas diferentes, e um terceiro aparelho que estava ligado nas duas horas leva a mensagem. A mochila "física" (alguém leva a mensagem andando pela cidade e repassa por pareamento presencial) é o caso raro.

## Passo 0: caixa de saída com reenvio (PM-78, implementado)

- Toda mensagem cifrada que sai como `pending-retry` (texto, reação, recibo de leitura, denúncia) entra na **caixa de saída** do aparelho (`client/js/dm-outbox.js`, chave `vox-dm-outbox-v1` no `localStorage`).
- Com o app aberto, o aparelho repassa a caixa a cada 20 s, ao voltar a internet (`online`) e ao abrir o app:
  - se o destinatário está conectado por WebRTC, entrega direto (status `delivered`);
  - senão, tenta a caixa postal do relay com espera crescente (1, 2, 4… até 30 min entre tentativas), para não martelar um relay fora do ar (status `queued-relay`).
- **Prazo de 7 dias** (o mesmo da denúncia, `REPORT_MAX_AGE_MS`). Depois disso, a mensagem sai da caixa e aparece no fio como **"Não entregue"**.
- **Limites:** até 100 envelopes e até 2 MB somados na caixa; quando passa, sai o mais antigo (que aparece como "Não entregue").
- No fio: "⏳ Aguardando" enquanto está na caixa; "✓✓ Direta" ou "✓ Caixa postal" quando sai.
- **Não há envio em segundo plano.** Com o app fechado, nada é reenviado; o texto da interface diz isso.

## Passo 1: envelope cego (PM-79, não implementado)

- Hoje o envelope é `{v:1, id, from, to, ts, ephPub, iv, ct}`, com `from` e `to` em claro.
- O envelope **v2** leva `from` e `to` para dentro da parte cifrada: por fora só `{v:2, id, ts, ephPub, iv, ct}`. Quem lê v1 continua lendo as mensagens antigas.
- Quem recebe um envelope da mochila **tenta abri-lo** com a própria chave (ECDH + AES-GCM, ≈ 1 ms por tentativa); o que abre é seu. Com no máximo 200 envelopes por aparelho, isso é barato e não deixa metadado de destinatário para quem carrega.

## Passo 2: repasse entre aparelhos (PM-79, não implementado)

Decisão (10/11/2026): **qualquer aparelho conectado carrega, com pouco espaço.**

| Regra | Valor |
|---|---|
| Quem carrega | Qualquer aparelho Vox conectado; desligável nas configurações de rede (quem desliga não carrega, mas ainda pede que levem as suas) |
| Espaço | 50 envelopes; 200 no modo guardião (trabalho voluntário "deixar ligado") |
| Cópias | Cada mensagem vai para até 3 aparelhos |
| Tamanho | Até 4 KB por envelope: **só texto e cartão de contexto, sem mídia** (quem carrega não lê nem modera o que leva; ADR-020) |
| Prazo | 7 dias |
| Contra inundação | No máximo 20 envelopes por aparelho conectado por dia; fila circular |
| Recibo | Quem recebeu espalha `H(id)`; quem carrega apaga a cópia |
| Dados móveis | Só na troca ao conectar; no máximo 256 KB por dia no 4G (dentro do teto de 5 MB) |

**O que continua visível:** quem carrega vê que o aparelho conectado a ele mandou uma mensagem, mas não vê para quem nem o que diz. O `from` de dentro do envelope continua sem prova de quem enviou; a denúncia contorna isso com a assinatura da conta (PM-69).

**Texto na interface:** "Entregue a N aparelhos que vão repassar. Chega quando um deles encontrar a pessoa. Quem leva vê que você mandou uma mensagem, mas não vê para quem nem o que diz."

**Denúncia:** "carregada" conta como enviada no fluxo do PM-69; o arquivamento só acontece quando a denúncia chega ao aparelho de quem modera.

**Onde entra no código:** o aperto de mão por inventário do PM-80 ([sync-inventario-v0](./sync-inventario-v0.md), `peer-sync.js`) ganha uma lista de envelopes oferecidos; `client/js/dm-mochila.js` (fila, cotas, prazo, escolha de quem carrega, tentativa de abrir); `crypto-dm.js` (v2); `dm-wire.js` (quarto caminho). Os tipos `MOCHILA_PUT` e `MOCHILA_OFFER` precisam entrar no `peers.js`, que já passa do limite de tamanho: os tratadores ficam no módulo novo, e uma extração real do `peers.js` compensa as linhas.

## Métrica do piloto

Quantas DMs e denúncias chegaram pela caixa de saída e pela mochila, e com que atraso (mediana), contado no aparelho de quem mandou.
