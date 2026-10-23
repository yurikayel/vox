# Feira — listing assinado + UI gossip v1

**Compose:** assinado em `main` (`listing.js` + `app.js`).  
**UI pendente:** branch **`feat/listing-signed-gossip`** (Cursor).

## Escopo UI

- `mapOwnLocalFlags` + filtro tombstone na aba Classificados
- Badge **Verificada** (`validateSignedListingGossip` / `verifyPayload`)
- Menu dono: **Alterar status** (Disponível / Reservado / Vendido) → `GOSSIP_UPDATE`
- **Retirar da feira** → tombstone + `GOSSIP_DELETE` (mesmo fluxo que posts)
- i18n dedicado; toasts distinguem create vs update

## Fora do escopo v1

Editar título/preço/corpo após publicar; rota `#/listing/:id`; ranking por attestation.

## Antigravity (opcional)

`feat/listing-gossip-hardening` — allowlist de campos em `GOSSIP_UPDATE` para `type: listing`.

Ver brainstorm detalhado no log do spike feira UI (23/10).
