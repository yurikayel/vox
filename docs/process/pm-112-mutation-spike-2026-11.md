# PM-112 — spike mutação Tier A (nov/2026)

> **Status:** canônico (relatório de spike) · **Owner:** qualidade · **Revisado:** 2026-11-20

## Objetivo

Validar se **Stryker** (ou alternativa) roda com `node:test` nos módulos **Tier A** ([§3.3 Tier A](../TESTES.md#33-tier-a-o-que-exige-mais-prova)) antes de virar catraca no CI.

## Experimento (planejado)

| Abordagem | Resultado esperado |
|-----------|-----------|
| **Stryker + runner para `node --test`** | Integração via runner dedicado (`stryker.conf.json`, patterns em `tests/*.test.js`). **Custo:** dependência nova + tempo de CI (minutos em `identity/`). **Recomendação:** piloto offline em worktree; não adicionar ao `npm run validate` até F2. |
| **Mutador mínimo via espree (ESLint)** | Viável para mutantes sintáticos locais (`===` → `!==`, remoção de guard clause). **Limitação:** não mede sobreviventes reais sem executar testes. Útil só como aviso em PR. |
| **Red-on-base (PM-111)** | Já cobre PRs `fix:` no diff de testes; complementa mutação para defeitos conhecidos. |

## Piloto empírico — worktree `feat/pm-112-stryker-pilot` (2026-11-20)

| Item | Valor |
|------|-------|
| **ESM (`"type": "module"`)** | Sem bloqueio — instrumentação e `import` nativos OK. |
| **Runner** | `@stryker-mutator/tap-runner` v10.1.1 com `node --test-reporter=tap` (o pacote `@stryker-mutator/nodejs-runner` **não existe** no npm; o caminho documentado antes era hipotético). |
| **Alvo** | `client/js/inbox.js` + `tests/inbox*.test.js` |
| **DevDeps** | `@stryker-mutator/core`, `@stryker-mutator/tap-runner` (somente dev; **fora** de `npm run validate`). |
| **Comando** | `npm run test:mutation:pm112` ou `npx stryker run` (config: `stryker.conf.json` na raiz). |
| **Duração** | ~14 s (149 mutantes, concurrency 2, `coverageAnalysis: "off"`). |
| **Mutantes** | 149 gerados · **88 mortos** · 44 sobreviventes · 17 sem cobertura · 0 erros |
| **Mutation score** | **59,06%** total · **66,67%** covered |
| **Relatório** | `reports/mutation/mutation-report.json` (evidência anexada neste PR; regenerar com `npm run test:mutation:pm112`). |
| **Observação** | `tests/inbox-backup.test.js` roda no glob mas **não importa** `inbox.js` (0 cobertura no alvo). Granularidade do tap-runner é **por arquivo de teste**, não por caso `test()` dentro do arquivo. |

### Amostra de mutantes mortos

- Guard clauses em `normalizeRelayHttpBase` (`!raw`, branches `wss:`/`ws:`).
- Persistência `localStorage` em `saveRelayHttpUrl` / cascata buddy.
- Fluxos `fetch` mockados em `pushSealed`, `pullMine`, `deleteSealed`.

### Sobreviventes relevantes (não bloqueiam o piloto)

- Literais de chave `localStorage` (`RELAY_HTTP_STORAGE_KEY` vazio).
- Mutantes de regex “equivalentes” nos testes atuais.
- Ramos de erro HTTP raramente exercidos (`pushSealed` com resposta não-OK).

## Pilot plan (F2)

1. Manter piloto local: `stryker.conf.json` + `npm run test:mutation:pm112`.
2. Critério F2: mutation score covered ≥ threshold acordado no Tier A; opcional `coverageAnalysis: "perTest"` quando migrar para runner `node:test` nativo (PR upstream Stryker #6020 ainda aberto).
3. **Não** wire no `ci.yml` nem em `npm run validate` neste PR.

## Decisão (spike)

**Piloto Stryker verde em ESM + `node:test` via tap-runner.** Adiar catraca PM-112 no CI até F2 (threshold + tempo de pipeline). Manter Tier A mapeado por CODEOWNERS + PM-111 nos `fix:`.

## Fora de escopo

- Cobertura por porcentagem (PM-115).
- Mutação em `relay/` (Python `mutmut` separado).