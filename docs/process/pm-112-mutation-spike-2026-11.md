# PM-112 — spike mutação Tier A (nov/2026)

> **Status:** canônico (relatório de spike) · **Owner:** qualidade · **Revisado:** 2026-11-20

## Objetivo

Validar se mutação executável com `node:test` nos módulos **Tier A** ([§3.3 Tier A](../TESTES.md#33-tier-a-o-que-exige-mais-prova)) pode virar catraca no CI — comparando **Stryker** (dependência dedicada) com **mutador AST próprio** (`espree`, zero dep nova).

## Experimento (planejado)

| Abordagem | Resultado |
|-----------|-----------|
| **Stryker + `tap-runner`** | Integração via `stryker.conf.json` + `@stryker-mutator/tap-runner` (executa `node:test` com `--test-reporter=tap`). **Custo:** devDeps novas (LAN-20) + minutos de pipeline se entrar no CI. Piloto offline: `npm run test:mutation:pm112`. |
| **Mutador AST mínimo sobre `espree` (implementado)** | [`scripts/mutate-tier-a.mjs`](../../scripts/mutate-tier-a.mjs) — `npm run audit:mutate:tier-a` — zero dependência npm nova; hook ESM em sandbox temporário. |
| **Red-on-base (PM-111)** | Já cobre PRs `fix:` no diff de testes; complementa mutação para defeitos conhecidos. |

## Protótipo AST (`scripts/mutate-tier-a.mjs`)

Operadores mutados via AST (`espree`, ESM puro):
- Relacionais e igualdade (`BinaryExpression`): `===` ↔ `!==`, etc.
- Lógicos (`LogicalExpression`): `&&` ↔ `||`.
- Condição de desvio (`IfStatement`): `if (cond)` → `if (!(cond))`.
- Literais booleanos (`Literal`): `true` ↔ `false`.

Classificação: `killed` / `survived` / `timeout`. Suíte em [`tests/mutate-tier-a.test.js`](../../tests/mutate-tier-a.test.js).

## Resultados AST medidos (2026-11-20, develop)

| Comando | Mutantes | Killed | Survived | Score | Tempo |
|---------|----------|--------|----------|-------|-------|
| `--file client/js/sig-format.js --test tests/sig-format.test.js --max 10` | 10 | 10 | 0 | **100%** | 10,9s |
| `--file client/js/sig-format.js` (completo) | 11 | 11 | 0 | **100%** | 11,6s |
| `--file client/js/inbox.js --test tests/inbox.test.js --max 25` | 25 | 20 | 5 | **80%** | 7,5s |

Sobreviventes em `inbox.js` (`--max 25`): linhas 107, 134, 168 (`logical` / `boolean-literal`).

## Piloto Stryker — worktree `feat/pm-112-stryker-pilot` (2026-11-20)

| Item | Valor |
|------|-------|
| **ESM (`"type": "module"`)** | Sem bloqueio — instrumentação e `import` nativos OK. |
| **Runner** | `@stryker-mutator/tap-runner` v10.1.1 (`@stryker-mutator/nodejs-runner` **não existe** no npm). |
| **Alvo** | `client/js/inbox.js` + `tests/inbox*.test.js` |
| **Comando** | `npm run test:mutation:pm112` / `npx stryker run` (`stryker.conf.json`). |
| **Duração** | ~14 s (149 mutantes, `coverageAnalysis: "off"`, concurrency 2). |
| **Mutantes** | 149 · **88 mortos** · 44 sobreviventes · 17 sem cobertura · 0 erros |
| **Mutation score** | **59,06%** total · **66,67%** covered |
| **Relatório** | `reports/mutation/mutation-report.json` (evidência deste PR). |
| **Nota** | Tap-runner agrupa por **arquivo de teste**; `inbox-backup.test.js` não importa `inbox.js`. |

Após merge de `develop`, testes de `inbox` reforçados (PR #361) devem elevar o score Stryker na próxima execução local.

## Próximos passos (F2)

1. **AST:** `npm run audit:mutate:tier-a -- --base origin/develop --max 20 --json` como job informativo em PRs Tier A.
2. **Stryker:** manter piloto local; avaliar `coverageAnalysis: perTest` quando o runner nativo `node:test` do Stryker estabilizar (upstream #6020).
3. **Nenhum** wire em `ci.yml` ou `npm run validate` neste lote.

## Decisão (spike)

- **Caminho preferido F2:** protótipo AST (`espree`) — zero dep nova, já com score 100% em `sig-format` e 80% amostral em `inbox`.
- **Stryker validado** em ESM + `node:test` via tap-runner; útil como referência de mutantes ricos e relatório HTML/JSON, mas **opcional** enquanto o AST cobrir o gate informativo.
- Catraca bloqueante PM-112 no CI permanece adiada até calibração em PRs reais.

## Fora de escopo

- Cobertura por porcentagem (PM-115).
- Mutação em `relay/` (Python `mutmut` separado).