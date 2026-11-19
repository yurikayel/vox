# PM-112 — spike mutação Tier A (nov/2026)

> **Status:** canônico (relatório de spike) · **Owner:** qualidade · **Revisado:** 2026-11-19

## Objetivo

Validar se **Stryker** (ou alternativa) roda com `node:test` nos módulos **Tier A** ([§3.3 Tier A](../TESTES.md#33-tier-a-o-que-exige-mais-prova)) antes de virar catraca no CI.

## Experimento

| Abordagem | Resultado |
|-----------|-----------|
| **Stryker + `@stryker-mutator/nodejs-runner`** | Não está no `package.json`. Integração com `node --test` exige runner dedicado (config `stryker.conf.json`, patterns em `tests/*.test.js`). **Custo:** dependência nova + tempo de CI (minutos em `identity/`). **Recomendação:** piloto offline em worktree; não adicionar ao `npm run validate` até F2. |
| **Mutador mínimo via espree (ESLint)** | Viável para mutantes sintáticos locais (`===` → `!==`, remoção de guard clause). **Limitação:** não mede sobreviventes reais sem executar testes. Útil só como aviso em PR. |
| **Red-on-base (PM-111)** | Já cobre PRs `fix:` no diff de testes; complementa mutação para defeitos conhecidos. |

## Pilot plan (F2)

1. Branch isolada: `npx @stryker-mutator/cli init` com `testRunner: "nodejs"` apontando para um arquivo Tier A (`client/js/inbox.js`) e testes `tests/inbox*.test.js`.
2. Critério: ≥1 mutante morto e relatório `mutation-report.json` anexado ao PR.
3. Se Stryker falhar com ESM puro: documentar bloqueio e manter PM-111 + adversarial como barreira.

## Decisão (spike)

**Adiar catraca PM-112 no CI** até piloto Stryker verde em worktree (dez/2026). Manter Tier A mapeado por CODEOWNERS + PM-111 nos `fix:`.

## Fora de escopo

- Cobertura por porcentagem (PM-115).
- Mutação em `relay/` (Python `mutmut` separado).