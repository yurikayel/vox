# PM-112 — spike mutação Tier A (nov/2026)

> **Status:** canônico (relatório de spike) · **Owner:** qualidade · **Revisado:** 2026-11-20

## Objetivo

Validar se **Stryker** (ou alternativa sem dependência nova) roda com `node:test` nos módulos **Tier A** ([§3.3 Tier A](../TESTES.md#33-tier-a-o-que-exige-mais-prova)) antes de virar catraca no CI.

## Experimento

| Abordagem | Resultado |
|-----------|-----------|
| **Stryker + `@stryker-mutator/nodejs-runner`** | Não está no `package.json`. Integração com `node --test` exige runner dedicado (`stryker.conf.json`). **Custo:** dependência nova (LAN-20) + tempo de CI. **Recomendação:** dispensável enquanto o protótipo AST sobre `espree` cobrir Tier A. |
| **Mutador AST mínimo sobre `espree` (implementado)** | Implementado em [`scripts/mutate-tier-a.mjs`](../../scripts/mutate-tier-a.mjs) (`npm run audit:mutate:tier-a`) com **zero dependência npm nova** (usa o `espree` já instalado pelo ESLint). Executa `node --test` por mutante via hook ESM (`module.register`) em sandbox temporário (`os.tmpdir()`), sem alterar o arquivo original no disco e verificando SHA-256 antes/depois. Suporta `--file`/`--test`, `--base <gitRef>` (diff Tier A via [`.github/CODEOWNERS`](../../.github/CODEOWNERS)), `--max`, `--timeout` e `--json`. |
| **Red-on-base (PM-111)** | Já cobre PRs `fix:` no diff de testes; complementa mutação para defeitos conhecidos. |

## Protótipo AST implementado (`scripts/mutate-tier-a.mjs`)

Operadores mutados via AST (`espree`, ESM puro, zero regex):
- Relacionais e igualdade (`BinaryExpression`): `===` ↔ `!==`, `==` ↔ `!=`, `<` ↔ `<=`, `>` ↔ `>=`.
- Lógicos (`LogicalExpression`): `&&` ↔ `||`.
- Condição de desvio (`IfStatement`): `if (cond)` → `if (!(cond))`.
- Literais booleanos (`Literal`): `true` ↔ `false`.

Classificação por mutante: `killed` (`exit !== 0`), `survived` (`exit === 0`) ou `timeout` (padrão 10s). O placar (`score`) é conservador: `killed / total * 100` (timeouts não inflam o placar). Suíte própria em [`tests/mutate-tier-a.test.js`](../../tests/mutate-tier-a.test.js).

## Resultados reais medidos (2026-11-20)

| Comando | Mutantes | Killed | Survived | Timeout | Score | Tempo |
|---------|----------|--------|----------|---------|-------|-------|
| `node scripts/mutate-tier-a.mjs --file client/js/sig-format.js --test tests/sig-format.test.js --max 10` | 10 | 10 | 0 | 0 | **100%** | 10,9s |
| `node scripts/mutate-tier-a.mjs --file client/js/sig-format.js --test tests/sig-format.test.js` (completo) | 11 | 11 | 0 | 0 | **100%** | 11,6s |
| `node scripts/mutate-tier-a.mjs --file client/js/inbox.js --test tests/inbox.test.js --max 25` | 25 | 20 | 5 | 0 | **80%** | 7,5s |

Sobreviventes reais identificados em `client/js/inbox.js` (`--max 25`):
- `client/js/inbox.js:107 [logical] || -> &&`
- `client/js/inbox.js:134 [logical] || -> &&`
- `client/js/inbox.js:168 [logical] || -> &&`
- `client/js/inbox.js:168 [boolean-literal] false -> true`
- `client/js/inbox.js:171 [boolean-literal] false -> true`

## Próximos passos (F2)

1. Rodar `npm run audit:mutate:tier-a -- --base origin/develop --max 20 --json` como job informativo em PRs que toquem Tier A antes de avaliar catraca bloqueante.
2. Usar os sobreviventes apontados em `client/js/inbox.js` como pauta de reforço de testes (fora do escopo deste spike).

## Decisão (spike)

**Protótipo AST próprio sobre `espree` validado sem dependência nova**; substitui a necessidade imediata de Stryker para o piloto Tier A. Segue como auditoria sob demanda (`npm run audit:mutate:tier-a`), ainda fora do gate bloqueante do `npm run validate` até calibração em PRs reais (F2).

## Fora de escopo

- Cobertura por porcentagem (PM-115).
- Mutação em `relay/` (Python `mutmut` separado).