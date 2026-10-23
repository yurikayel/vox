# Auditoria copy honestidade (pós-gossip retract)

**Fonte:** spike Cursor 23/10 · **P0 aplicado** em `render.js` (feed hashtag).

## P0 — feito

| Local | Antes | Depois |
|-------|--------|--------|
| `render.js` contagem tag | `N posts neste aparelho` | `N posts no seu índice` |
| `render.js` empty tag | `… neste aparelho` | `… no seu índice ainda` |

## P1 — backlog

| Área | Ação sugerida |
|------|----------------|
| `app.js` toasts edit/delete | Mencionar propagação na malha (alinhar `i18n-pt-br.js`) |
| `i18n-pt-br.js` | Trocar “Local imediato” por “efeito imediato aqui” |
| `render.js` DM/Pix/conta | “neste navegador” vs posts na malha |
| `mock.js` tour | Harmonizar narrativa `#localfirst` (P2) |

## OK (manter)

- `gossip-retract-ui.js` — “Editado na rede” / tombstone
- `i18n-pt-br.js` hints compositor (já malha)
- `app.js` — “Só é possível editar/apagar posts seus.” (ownership)
