# scripts/

Scripts de **manutenção do repositório** (desenvolvimento, CI e release). Nada aqui é distribuído para quem usa o Vox.

| Script | Para quê | Como rodar |
|---|---|---|
| `release_line.py` | Gera `docs/release-metadata.json` (SHA, testes, `CACHE_NAME`) e atualiza a tabela do README | `npm run release-line` · `npm run release-metadata` |
| `complexity-audit.mjs` | Mede LLOC, aninhamento e complexidade cognitiva; grava `docs/metrics/baseline-AAAA-MM-DD.*` | `npm run audit:complexity` |
| `layers-audit.mjs` (+ `layers-lib.mjs`) | Confere as camadas do cliente pela árvore sintática: `base` não importa `render`/`app`/`labs`, `render` não importa `app`/`labs`, só `app` carrega o laboratório; dívida antiga em `layers-debt.json` (catraca). Decisão: `docs/adr/035-camadas-e-contextos.md` | `npm run audit:layers` · `npm run audit:layers -- --prune` |
| `docs-audit.mjs` | Confere a documentação: cabeçalho e JSDoc nos exports, `@param`/`@returns`, links relativos e docs órfãos; dívida antiga em `docs-debt.json` (catraca). Norma: `docs/process/documentacao.md` | `npm run audit:docs` · `npm run audit:docs -- --prune` |
| `lint_relay.py` | Lint do relay Python | `npm run lint:relay` |
| `nostr-smoke.mjs` | Teste de fumaça dos relays Nostr e da sinalização (REV-19/REV-09) | `node scripts/nostr-smoke.mjs --signaling` · workflow `nostr-smoke.yml` |
| `mesh-e2e.mjs` | Dois Chromium trocam post assinado por WebSocket e Nostr (PM-99) | `node scripts/mesh-e2e.mjs` · job `e2e-mesh` em `ci.yml` |
| `nostr-ephemeral-relay.mjs` | Relay Nostr efêmero local (`kind 25050`) sem deps para o `mesh-e2e.mjs` | importado por `mesh-e2e.mjs` e `tests/nostr-ephemeral-relay.test.js` |
| `write-oauth-deploy-config.mjs` | Gera `client/config/oauth.json` no deploy a partir de secrets | workflows `deploy-pages.yml` e `deploy-shell-b.yml` |
| `generate_brand_icons.py` | Deriva ícones PWA a partir dos logos em `docs/branding/` | `python scripts/generate_brand_icons.py` |
| `package_permaweb.py` | Valida e empacota o app shell para publicar no Arweave | `python scripts/package_permaweb.py` |
| `test.bat` | Atalho Windows para `npm test` (JS + Python) | `scripts\test.bat` |

Limites de complexidade valem também aqui: [docs/HARDENING.md](../docs/HARDENING.md).
