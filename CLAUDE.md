# CLAUDE.md — Vox (Perfil Canônico v3.2)

Leia e siga, nesta ordem:
1. [AGENTS.md](./AGENTS.md) — escopo do repositório, mutex de arquivos e modo revisor.
2. [docs/HARDENING.md](./docs/HARDENING.md) — limites de código (função, aninhamento, complexidade, parâmetros, arquivo), o que o CI bloqueia de fato e a dívida medida.
3. [docs/process/qualidade-e-evidencia.md](./docs/process/qualidade-e-evidencia.md) — evidência de testes (PASS / FAIL / NOT RUN / BLOCKED), proibição de falso verde, papéis e auditoria só-leitura.
4. [docs/process/documentacao.md](./docs/process/documentacao.md) — documentação no código (cabeçalho e JSDoc em todo export) e documentação técnica atrelada a cada mudança; `npm run audit:docs` reprova o que faltar.

Antes de pedir merge em `main`: `npm run validate`.
