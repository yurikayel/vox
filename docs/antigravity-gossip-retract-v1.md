# Gossip retratação v1 — spec kickoff (Antigravity)

**Tarefa Vox #4** · spec apenas (sem implementação completa neste PR)  
**Branch de spec:** `feat/gossip-retract-spec`  
**Branch de implementação prevista:** `feat/gossip-retract-v1`  
**Baseline:** `main` @ v6.4 (`4d8a2eb`) — 147 testes  
**Relacionado:** DEV **§21.4** (editar/apagar local + lacuna gossip), checklist lobby *GOSSIP_UPDATE / GOSSIP_DELETE*

---

## 1. Problema

Hoje, editar ou apagar um post assinado (`post-ownership.js` + `app.js`) persiste só no **IndexedDB local** (`cache-node.js`). O autor pode chamar `peers.broadcastGossip(signed)` na **criação**, mas **não** na edição/exclusão (DEV §21.4).

Pares que já receberam `{ type: "GOSSIP", item }` mantêm a cópia antiga para sempre: `handleGossipMessage` em `peers.js` ignora qualquer mensagem cujo `item.id` já exista (`if (existing) return`), sem comparar `editedAt` nem estado de tombstone.

**Objetivo v1:** propagar **retratação** (update assinado e delete/tombstone) na malha `vox-local-v0`, com regras de **last-write-wins** por `(id, editedAt)` e verificação criptográfica inalterada (`localAccount.verifyPayload`).

**Fora de escopo v1 (Cursor / sprint seguinte):** badge **Editado**, UI pós-delete no feed (`render.js`), limites do compositor.

---

## 2. Estado atual (touchpoints)

| Módulo | Comportamento relevante |
|--------|-------------------------|
| `local-account.js` | `signPayload` / `verifyPayload`; canonical JSON sem `sig`/`pubKey`; `editedAt` já entra no payload assinado na edição local. |
| `post-ownership.js` | `canMutateLocalPost(post, routeId)` — só autor com `sig` e `author === routeId`. |
| `cache-node.js` | `saveLocalPost` (upsert por `id`, campo `editedAt`), `getLocalPost`, `deleteLocalPost` (remove registro). |
| `peers.js` | `GOSSIP` + `item`; dedupe **só por id**; `broadcastGossip(item)`; `onGossipPost` para refresh de rotas. |
| `app.js` | Edição: `saveLocalPost` sem gossip; delete: `deleteLocalPost` sem gossip. |

Referência DEV: **§21.4 Editar / apagar posts locais** (persistência local, gap gossip).

---

## 3. Extensão do wire protocol (`vox-local-v0`)

Envelope de transporte (inalterado): mensagens JSON no `BroadcastChannel` (`vox-peer-v0`) e WebRTC DataChannel, com `fromPeer` opcional.

### 3.1 Tipos de mensagem

| `type` | Uso | Payload principal |
|--------|-----|-------------------|
| `GOSSIP` | **Create / upsert inicial** (compat) | `item` — post completo assinado |
| `GOSSIP_UPDATE` | **Retratação de conteúdo** | `item` — post completo assinado (mesmo `id`, `ts` original, novo `editedAt`, nova `sig`) |
| `GOSSIP_DELETE` | **Retratação de remoção** | `tombstone` — objeto assinado (ver §4.2) |

**Regra:** clientes v6.4 que não implementam UPDATE/DELETE continuam válidos; ignoram tipos desconhecidos sem quebrar o mesh.

### 3.2 Semântica de recepção (normativa)

Para qualquer evento que altere o store `local-posts`:

1. Verificar assinatura ECDSA P-256 (`verifyPayload` no `item` ou no corpo do tombstone).
2. Verificar que `author` do evento == `author` do post existente **ou** que não há post e o evento é create (só `GOSSIP` create).
3. Para UPDATE/DELETE: recusar se `author` ≠ autor do registro local (impersonação).
4. Aplicar **LWW (last-write-wins)** com chave lógica `(id)` e desempate **`editedAt` monotônico** (maior `editedAt` vence; empate → maior `sig` lexicographic ou descartar duplicata idêntica).
5. Após apply: `dispatchGossipPost` / novo hook `dispatchGossipRetract` conforme §5; retransmitir mesh (mesma lógica de fan-out que `handleGossipMessage`).

---

## 4. Payloads assinados

### 4.1 `GOSSIP_UPDATE` — `item`

Mesmo shape de post já persistido em `saveLocalPost`, obrigatório:

- `id` — estável (igual ao create)
- `ts` — **inalterado** desde a publicação original (já garantido por `signPayload` na edição local)
- `editedAt` — **> 0**, estritamente maior que o `editedAt` conhecido localmente ao aplicar update
- `author`, `pubKey`, `sig` — autor ativo; nova assinatura sobre o corpo canônico incluindo `editedAt`
- Demais campos do tipo (`type`, `title`, `body`, `communityId`, …) como hoje

**Emissor (autor):** após `signPayload` + `saveLocalPost` local, chamar `broadcastGossipUpdate(item)` (novo export em `peers.js`).

### 4.2 `GOSSIP_DELETE` — `tombstone`

Objeto **minimal** assinado (não reutilizar delete físico do IndexedDB como formato de rede):

```json
{
  "kind": "post-tombstone",
  "id": "<post-id>",
  "author": "vx_…",
  "ts": "<original-post-ts>",
  "editedAt": "<delete-event-time>",
  "pubKey": { "...": "JWK P-256" },
  "sig": "<base64url>"
}
```

- `kind` constante `"post-tombstone"` para extensão futura (voto, listing, etc.).
- `editedAt` no tombstone = momento da retratação (mesmo campo LWW que updates).
- Assinatura: `signPayload(tombstone)` **ou** helper dedicado que inclua `kind` no canonical JSON.

**Receptor:** não apagar silenciosamente sem tombstone válido do autor original; aplicar tombstone marcando registro como removido **ou** removendo do store e mantendo tombstone em store auxiliar (ver §5.2).

---

## 5. `cache-node.js` — mudanças propostas

### 5.1 `applyGossipItem(item, { source })`

Extrair lógica compartilhada:

- Se não existe post: insert (como hoje) **desde que** verify OK.
- Se existe post:
  - Se `item.editedAt` ≤ `existing.editedAt` (e existing não tombstone): **no-op** (dedupe).
  - Se `item.editedAt` > `existing.editedAt`: **upsert** via `saveLocalPost(item)`.
- Retornar `{ applied: boolean, reason?: string }` para testes.

### 5.2 Tombstone local

**Opção recomendada v1:** registro tombstone no mesmo store `local-posts`:

```js
{
  id,
  type: "tombstone",
  tombstoneKind: "post",
  author,
  ts,           // ts original do post
  editedAt,     // ts da delete
  sig, pubKey,
  deleted: true
}
```

Feed/query (`getLocalPosts`, agregadores no feed híbrido) **filtram** `type === "tombstone"` ou `deleted === true`.

**Alternativa (não v1):** store separado `gossip-tombstones` — mais limpo, mais migração de schema.

### 5.3 `deleteLocalPost` vs retratação

- **Ação local do autor:** `deleteLocalPost` + emitir `GOSSIP_DELETE` (não depender só do delete físico para sync).
- **Par remoto:** recebe DELETE → grava tombstone (ou remove + cache tombstone em memória TTL — evitar ressuscitar por GOSSIP antigo atrasado).

### 5.4 Proteção contra GOSSIP create atrasado

Após tombstone ou update com `editedAt = T`:

- Ignorar `GOSSIP` create/update com mesmo `id` se `item.editedAt < T` ou (create sem `editedAt` e tombstone já aplicado).

---

## 6. `peers.js` — mudanças propostas

### 6.1 Handlers

```text
handleVoxMessage
  ├─ GOSSIP          → handleGossipCreate(item)   // refator de handleGossipMessage
  ├─ GOSSIP_UPDATE   → handleGossipUpdate(item)
  └─ GOSSIP_DELETE   → handleGossipDelete(tombstone)
```

### 6.2 Dedupe (substituir `if (existing) return`)

Pseudo:

```text
existing = getLocalPost(id)
if (!existing) → apply se verify
if (existing.type === 'tombstone') → ignore creates/updates mais antigos
if (incoming.editedAt <= existing.editedAt) → return (dedupe)
if (incoming.author !== existing.author) → return (reject)
verify → cacheNode.apply… → dispatchGossipPost / dispatchGossipTombstone → fan-out
```

### 6.3 Broadcast API

| Função | Quando |
|--------|--------|
| `broadcastGossip(item)` | create (inalterado) |
| `broadcastGossipUpdate(item)` | após edição local |
| `broadcastGossipDelete(tombstone)` | após delete local |

Fan-out: espelhar `broadcastGossip` (BroadcastChannel + `webrtcPeer.broadcastRtcMessage`).

### 6.4 Listeners

- Manter `onGossipPost(item, source)` para creates **e** updates aplicados (feed refresh).
- Opcional v1: `onGossipTombstone({ id, author, editedAt }, source)` para UI Cursor remover card sem reload completo.

---

## 7. `app.js` — ganchos (implementação v1)

| Fluxo | Após persistência local | Ação rede |
|-------|-------------------------|-----------|
| `openPostEditModal` submit | `saveLocalPost(signed)` | `broadcastGossipUpdate(signed)` |
| `handleDeletePost` | tombstone local + ou delete + tombstone record | `broadcastGossipDelete(tombstone)` |

Ordem: **local first**, depois broadcast (mesmo padrão das creates).

---

## 8. Plano de testes

Arquivo sugerido: `tests/gossip-retract.test.js` (Node + mock IndexedDB como `post-edit-delete.test.js`).

| # | Caso | Assert |
|---|------|--------|
| T1 | UPDATE com `editedAt` maior substitui corpo | `getLocalPost` title/body/sig novos |
| T2 | UPDATE com `editedAt` menor ou igual | no-op, registro intacto |
| T3 | UPDATE de autor diferente | rejeitado |
| T4 | UPDATE com assinatura inválida | rejeitado |
| T5 | DELETE tombstone válido remove/oculta post | feed query não lista id |
| T6 | DELETE com `editedAt` < update local | no-op delete |
| T7 | GOSSIP create atrasado após tombstone | ignorado |
| T8 | `handleVoxMessage` roteia `GOSSIP_UPDATE` / `GOSSIP_DELETE` | mocks de cache-node |
| T9 | Fan-out: update não reenviado infinitamente | dedupe same `editedAt`+`sig` |
| T10 | Regressão: GOSSIP create legado ainda funciona | peers.test.js compat |

**Meta:** suíte ≥ **157** testes (+10) ou documentar contagem exata no PR de impl.

---

## 9. Critérios de aceite (implementação `feat/gossip-retract-v1`)

1. **Protocolo:** Peers v6.4+ implementam `GOSSIP_UPDATE` e `GOSSIP_DELETE` conforme §3–4.
2. **Autoridade:** Só o `author` original pode update/delete retratado; verificação via `verifyPayload`.
3. **LWW:** Conflitos resolvidos por `id` + `editedAt`; duplicatas de mesma versão não causam churn no mesh.
4. **Persistência:** Estado local coerente após restart (tombstone ou filtro equivalente no IndexedDB).
5. **Autor UX:** Editar/apagar no próprio aparelho dispara broadcast correspondente.
6. **Par UX:** Receber update altera conteúdo no IndexedDB; receive delete oculta post (UI badge fica para branch Cursor).
7. **Compat:** Clientes antigos ignoram novos tipos; creates `GOSSIP` permanecem.
8. **Testes:** T1–T10 verdes; `test.bat` / CI sem regressão.
9. **Docs:** DEV §21.4 atualizado (remover nota “não há GOSSIP_DELETE”); bump SW cache no PR de impl.
10. **Não-regressão:** `post-edit-delete.test.js` e `peers.test.js` verdes.

---

## 10. Sequência de entrega sugerida

1. **Este PR (`feat/gossip-retract-spec`):** apenas este documento + referência no README ou DEV (link).
2. **`feat/gossip-retract-v1`:** `cache-node` apply + tombstone → `peers` handlers/broadcast → `app.js` hooks → testes.
3. **Cursor:** badge Editado / card removido no feed (`onGossipTombstone` ou poll `getLocalPost`).

---

## 11. Riscos e decisões abertas

| Item | Decisão v1 sugerida |
|------|---------------------|
| Tombstone no mesmo store vs store novo | Mesmo store, `type: "tombstone"` |
| Replies para post tombstoned | Manter replies no DB; UI pode mostrar “thread removida” (Cursor) |
| Tipos além de `topic` | v1 só posts com `canMutateLocalPost`; estender listing/vote em v2 |
| Retransmissão de tombstone | Sim, mesh igual create (TTL social, não blockchain) |

---

## 12. Referências no repo

- `client/DEV.md` — §11.2 (gossip), §21.4 (edit/delete local)
- `client/js/peers.js` — `handleGossipMessage`, `broadcastGossip`
- `client/js/cache-node.js` — `saveLocalPost`, `deleteLocalPost`, `editedAt`
- `client/js/post-ownership.js` — mutabilidade
- `tests/post-edit-delete.test.js` — baseline edição local
- Lobby `politica/lobby.md` — item Antigravity gossip retract

---

*Kickoff Antigravity — spec only. Implementação completa na branch `feat/gossip-retract-v1`.*
