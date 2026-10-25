# Code hardening — Vox

Métricas alinhadas ao perfil global em `~/.gemini/config/AGENTS.md`.

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
- `lint` em warn até baseline limpo; depois fail on error (ver `docs/metrics/`).
