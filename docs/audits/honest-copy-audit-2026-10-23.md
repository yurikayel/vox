# Auditoria copy honestidade (pós-gossip retract)

> **Status:** auditoria (retrato de 2026-10-23, revisto em 2026-11-20) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-20

**Fonte:** spike Cursor 23/10 · **Revisão:** 26/10/2026 (grep mutex client)

## Escopo grep (client i18n/copy — arquivos obrigatórios)

| Arquivo | Papel |
|---------|--------|
| `client/js/i18n-pt-br.js` | Microcopy central pt-BR |
| `client/js/gossip-retract-ui.js` | Pills / tombstone gossip |
| `client/js/app/init.js` | Toasts editar/apagar post |
| `client/js/render.js` + `client/js/render/*.js` | UI render (feed, DM, Pix, status, …) |
| `client/js/mock.js` | Tour / demo offline |

**Proibidos na UI (grep):** `100% P2P` (celular/4G), `imunidade` (total/regulatória), `ranking de nós`.  
**26/10:** nenhuma ocorrência nos arquivos acima (matches de `100%` restantes são CSS width ou Pix offline técnico em `brcode.js` / `oauth-modals.js`, fora do mutex).

## P0 — feito (23/10)

| Local | Antes | Depois |
|-------|--------|--------|
| `render.js` contagem tag | `N posts neste aparelho` | `N posts no seu índice` |
| `render.js` empty tag | `… neste aparelho` | `… no seu índice ainda` |

## P1 — aplicado (26/10)

| Área | Mudança |
|------|---------|
| `i18n-pt-br.js` | “Local imediato” → “efeito imediato aqui”; toasts `localMutateUpdatedToast` / `localMutateDeletedToast` com malha |
| `app/init.js` | Toasts pós edit/delete usam i18n (propagação gossip) |
| `render/dm.js` | DM: “neste navegador” (dados não vão à malha como posts) |
| `render/profile.js` | Pix lookup: índice local vs posts na malha |

## P2 — backlog

| Área | Ação sugerida |
|------|----------------|
| `render/feed.js` | Varredura fina de composer/mídia (ex. badge lo-fi) × `FEATURES.md` |

## P2 — parcial (20/11/2026, DOC-04 · Voxpedia)

| Área | Mudança |
|------|---------|
| `render/voxpedia.js` | Arweave: gravação pausada (`arweaveUpload: false`); carteira = leitura/chaves. Comunidades: criação na malha sem exigir carteira para Arweave. Privacidade: entrada sem Google/Meta; OAuth só no Perfil. Moderação: sem “permanece no permaweb” como promessa automática. |
| `tests/voxpedia.test.js` | Assert copy Arweave pausado. |

| `render/ajuda-teste.js`, `render/feed.js` (20/11, PR ajuda) | Ajuda teste: malha vs permaweb; Arweave pausado; carteira honesta. Feed: barra “Escudo” sem “100% cronológico” inflado. |
| `tests/ajuda-teste.test.js` | Assert `arweaveUpload: false`. |

| `render/status.js`, `render/network.js` (20/11) | “Neste aparelho” mantido para telemetria local; nota explícita leitura ≠ gravação Arweave (`arweaveUpload: false`). |
| `voxpedia.js` labs | Webxdc em `labs/parado/`, Mesa como lab. |
| `mock.js`, `shell.js` demo, `network.js` tour (20/11) | Tour fictício na malha; sem promessa de permaweb automático. |
| `render/profile.js` avançado | Carteira opcional; `arweaveUpload: false`; preservação pela malha. |
| `render/community.js` métricas | “Na malha” / “Via gateway” (não “Permaweb”). |
| `render/topic.js` badges | “Na malha” / “Via gateway” (não “Guardado”). |

**Falta (DOC-04):** varredura fina `render/feed.js` (composer/mídia). |

## OK (manter)

- `gossip-retract-ui.js` — “Editado na rede” / tombstone
- `i18n-pt-br.js` hints compositor (malha / pares online)
- `app/init.js` — “Só é possível editar/apagar posts seus.” (ownership)
- `render/community.js` — painel vizinhos: estimativa local (comentário sem ranking)
