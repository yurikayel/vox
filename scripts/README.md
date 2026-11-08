# scripts/

Scripts de **manutenção do repositório** (desenvolvimento, CI e release). Nada aqui é distribuído para quem usa o Vox.

| Script | Para quê | Como rodar |
|---|---|---|
| `release_line.py` | Gera `docs/release-metadata.json` (SHA, testes, `CACHE_NAME`) e atualiza a tabela do README | `npm run release-line` · `npm run release-metadata` |
| `complexity-audit.mjs` | Mede LLOC, aninhamento e complexidade cognitiva; grava `docs/metrics/baseline-AAAA-MM-DD.*` | `npm run audit:complexity` |
| `lint_relay.py` | Lint do relay Python | `npm run lint:relay` |
| `nostr-smoke.mjs` | Teste de fumaça dos relays Nostr e da sinalização (REV-19/REV-09) | `node scripts/nostr-smoke.mjs --signaling` · workflow `nostr-smoke.yml` |
| `write-oauth-deploy-config.mjs` | Gera `client/config/oauth.json` no deploy a partir de secrets | workflows `deploy-pages.yml` e `deploy-shell-b.yml` |
| `generate_brand_icons.py` | Deriva ícones PWA a partir dos logos em `docs/branding/` | `python scripts/generate_brand_icons.py` |
| `package_permaweb.py` | Valida e empacota o app shell para publicar no Arweave | `python scripts/package_permaweb.py` |
| `test.bat` | Atalho Windows para `npm test` (JS + Python) | `scripts\test.bat` |

Limites de complexidade valem também aqui: [docs/HARDENING.md](../docs/HARDENING.md).
