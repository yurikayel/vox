# Code hardening — Vox

**Fonte única** dos limites de complexidade do Vox (AGENTS.md, CONTRIBUTING e DEV apontam para cá). Auditoria: `npm run audit:complexity` ([ADR-007](./adr/007-zero-complexity-monolith-decomposition.md)).

## Thresholds

| Métrica | Limite | Ação |
|---------|--------|------|
| LLOC por função | ≤ 30 | Extract method |
| Nesting | ≤ 4 | Early return / flatten |
| Complexidade cognitiva (ESLint `complexity`) | ≤ 15 | Decompor ramificações |
| LCOM | < 20 | Coesão por módulo |
| CBO | ≤ LCOM | Preferir composição |
| DIT | < 2 | Evitar hierarquias profundas |
| Entity CBO (domínio) | ≤ 25 | |
| Controller CBO (app/screens) | ≤ 32 | |

## Como medir

```bash
npm run audit:complexity   # JSON + Markdown em docs/metrics/
npm run lint               # ESLint (client/js)
npm run lint:relay         # Ruff (relay/)
npm test                   # Regressão obrigatória
```

## Política de refactor

- PRs de hardening **não** aumentam CC/LLOC nos módulos tocados.
- Comportamento idêntico: testes verdes antes de merge.
- Comentários: explicar *por quê* (protocolo, LGPD, gossip), não narrar o óbvio.
- JSDoc em **exports públicos** (`@param`, `@returns`).

## Waivers

Exceções temporárias — revisar a cada release.

| Arquivo | Função | Motivo | Revisão |
|---------|--------|--------|---------|
| `mock.js` | (várias) | Dados demo legado | 2026-Q4 |
| `render/topic.js`, `app/screens-*.js` | funções grandes | Split feito; flatten incremental pós-baseline | 2026-Q4 |

## CI

- `audit:complexity` gera artefato (baseline).
- **Desde 09/11/2026, `npm run lint` quebra o CI** em `client/`: função com mais de 30 linhas (sem comentários e linhas em branco), aninhamento > 4, complexidade > 15, `==` e variável não usada são **erro**.
- **Aviso (dívida medida em 09/11):** `max-params` > 5 no `client/` (18 funções) e os mesmos limites em `scripts/`/`tools/`. No Python, ruff com `PLR0915` (máx. 30 comandos por função) acusa 12 funções; ainda opcional no CI.
- Não afrouxe limite nem teste para ficar verde: quebre a função (extract method) ou registre waiver acima com motivo e data.
