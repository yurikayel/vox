# Sincronização ao conectar por inventário (v0)

> **Status:** implementado no PM-80 · **Owner:** mantenedor · **Revisado:** 2026-11-10
> Relacionados: [mochila de DMs](./mochila-dm-v0.md) (PM-79 usa o mesmo aperto de mão), [replicação por grau](./replicacao-por-grau-v0.md), `client/js/peer-sync.js`, `client/js/peers.js`.

## Problema

Até o PM-80, cada conexão WebRTC nova fazia os dois aparelhos mandarem **às cegas** até 256 cartões de perfil, 64 remoções e 128 posts, tivesse o outro lado esses dados ou não. Medido com 128 posts assinados de ~600 caracteres e 100 cartões: **≈ 157 KB por sentido**. Umas 20 conexões no dia (quedas e reconexões da sinalização contam) esgotam o teto de 5 MB do 4G sem trazer nada novo.

Princípio: nesta rede, CPU sobra; o que falta é tempo online e bytes. Gastar um pouco de CPU (hashes) para mandar só o que falta.

## Protocolo

1. Ao abrir o canal, cada lado manda `SYNC_INV` com um `nonce` aleatório da conexão e três listas, do mesmo recorte que o envio completo usava:
   - `posts`: `[hash(id), versão]`, versão = `editedAt || ts`;
   - `dels` (remoções): `[hash(id), versão]`;
   - `cards`: `[hash(routeId), hash(conteúdo)]` (o `updatedAt` do cartão é carimbado localmente em cada aparelho e não serve para comparar).
   `hash` = primeiros 64 bits do SHA-256 em base64url (11 caracteres).
2. Quem recebe compara com **tudo** o que tem e responde `SYNC_WANT` com `ackOf: nonce` e os hashes que quer:
   - post que não tem, ou cuja versão local é mais velha, e sem remoção igual ou mais nova;
   - remoção mais nova que a local;
   - cartão ausente ou com conteúdo diferente (quem recebe decide se aplica, pela regra de sempre).
3. Quem recebe o pedido manda os itens como `GOSSIP`, `GOSSIP_DELETE` e `PROFILE_CARD` de sempre, que passam pelas mesmas verificações de assinatura, moderação e versão. Só serve o que estava no próprio recorte (a mesma exposição do envio completo).

**Compatibilidade:** cliente antigo ignora `SYNC_INV` e nunca responde. Se não chegar `SYNC_WANT` com o `nonce` daquela conexão em **8 s**, vai o envio completo de antes. O `nonce` só circula naquela conexão, então outro par não consegue cancelar o prazo de uma conexão alheia.

**Limites de validação:** `v: 1`; até 128 / 64 / 256 entradas; hash com 11 caracteres base64url; versão numérica ≥ 0 (ou hash, nos cartões). Mensagens `SYNC_*` só valem pelo canal WebRTC (não pela aba vizinha) e não são repassadas.

## Tamanho

| Situação | Antes | Depois |
|---|---|---|
| Aparelhos já sincronizados (128 posts, 100 cartões) | ≈ 157 KB por sentido | ≈ 7 KB de inventário + ≈ 0,1 KB de pedido |
| Faltam k itens | ≈ 157 KB | ≈ 7 KB + os k itens |

Os hashes ficam em memória (até 20 mil), para não refazer a cada conexão.

**Forma assinada.** Os itens servidos saem de `cacheNode.getWirePosts()` e `getAllTombstones()`, na forma exata em que foram assinados. Até a correção de 10/11 (`post-wire.js`), o banco guardava o post com campos padrão misturados, e quem recebia descartava tudo o que vinha por esta sincronização.

## Próximos passos

- A mochila de DMs (PM-79) entra neste aperto de mão como uma quarta lista (envelopes cegos oferecidos), em vez de mensagens soltas.
- Medir no piloto os bytes por conexão (antes e depois) no painel de rede.
