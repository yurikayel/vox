# Testes — como rodar, escrever e o que o CI checa

> **Status:** canônico · **Owner:** mantenedor / qualidade · **Revisado:** 2026-11-08
> Contagem atual de testes: **só** em [release-metadata.json](./release-metadata.json) (`test_js`, `test_python`).

## 1. Rodar

```bash
npm test                 # tudo: cliente + relay
npm run test:client      # node --test tests/*.test.js
npm run test:relay       # python -m unittest discover -s relay -p "test_*.py"
node --test tests/civic-post.test.js                   # um arquivo
node --test --test-name-pattern="dm badge" tests/       # por nome
python -m unittest relay.test_server                   # um módulo do relay (na raiz)
```

Requisitos: Node 22+ (o CI roda 22 e 24) e Python 3.11+ (o CI roda 3.11 e 3.12). Não há dependência de runtime para testar; `npm install` só traz o ESLint.

## 2. Cliente (`tests/*.test.js`, `node:test`)

- **Um arquivo por módulo ou fluxo**, com o nome do módulo: `tests/<modulo>.test.js`.
- **Ambiente de navegador simulado:** comece com `import "../tests/setup.js";`. Ele define mocks globais (`window`, `localStorage`, `BroadcastChannel`, `navigator`, `location`) para que os ES modules de `client/js/` carreguem em Node. IndexedDB é exercitado pelos próprios módulos (`idb-store.test.js`).
- **Importe o módulo real** com `await import("../client/js/…")`. Prefira testar funções puras exportadas (ex.: `sumUnreadDms` em `render/shell.js`, o classificador em `civic-post.js`).
- **Testes de integridade** leem arquivos do repo com `fs`: `entrypoint-integrity.test.js` (imports do entrypoint resolvem) e testes que conferem `SHELL_ASSETS` do `sw.js` (ex.: `voxels.test.js`). Módulo novo no shell = registrar em `SHELL_ASSETS` + bump de `CACHE_NAME`. `release-metadata-drift.test.js` falha se o `cache_name` de `docs/release-metadata.json` não bater com o `CACHE_NAME` do `sw.js` (REV-03): ao subir a versão do SW, rode `npm run release-line`.
- **Esqueleto:**

```js
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const { minhaFuncao } = await import("../client/js/meu-modulo.js");

test("meu-modulo — caso feliz", () => {
  assert.equal(minhaFuncao("x"), "y");
});
```

## 3. Relay (`relay/test_*.py`, `unittest`)

Stdlib pura. `test_server.py` sobe o handler HTTP em memória e exercita as rotas descritas em [relay-api.md](./specs/relay-api.md). Os testes usam diretórios temporários via `VOX_RELAY_*_DIR`, nunca o `.cache/` real.

## 4. O que o CI checa (`.github/workflows/ci.yml`)

| Job | O que faz | Bloqueia merge? |
|---|---|---|
| `test-client` (Node 22, 24) | `npm audit --audit-level=high` (LAN-20) · `node --check` em todo `client/js` e no `sw.js` · `npm run audit:complexity` (grava `docs/metrics/baseline-*.json` como artefato) · ESLint · `npm run test:client` | Sim, exceto ESLint (só aviso) |
| `test-relay` (Python 3.11, 3.12) | `py_compile` · `npm run test:relay` · ruff + `lint:relay` | Sim, exceto ruff (só aviso) |
| `security-audit` | Grep por chaves privadas (`BEGIN … PRIVATE KEY`) | Sim |
| `pilot-freeze` (só PR) | Com `PILOT_FREEZE=1` ou `.github/pilot-freeze.flag`, falha PRs que tocam `client/js/**`, salvo label `pilot-hotfix` | Sim, quando ativo |
| `windows-node-zero-smoke.yml` | PyInstaller + smoke do Node Zero no Windows | Sim |
| `nostr-smoke.yml` (semanal) | Publica e lê um evento efêmero em cada relay Nostr do pool (REV-19) | Não (agenda) |

## 5. Complexidade

`npm run audit:complexity` (ESLint, `scripts/complexity-audit.mjs`) aplica os limites de [HARDENING.md](./HARDENING.md) e escreve um baseline datado em `docs/metrics/`. Meta: **zero violações** ([ADR-007](./adr/007-zero-complexity-monolith-decomposition.md)). `mock.js` fica de fora.

## 6. Release line

`npm run release-line` roda a suíte inteira, conta os testes e grava `docs/release-metadata.json` (SHA, contagens, `CACHE_NAME`), além da tabela e do badge no README. Rode ao fechar um lote, nunca à mão.
