## Summary

<!-- O que muda e por quê -->

## Evidência de testes

<!-- Uma linha por verificação. PASS exige comando, código de saída e total; FAIL exige o trecho do log e a causa.
     Ver docs/process/qualidade-e-evidencia.md -->

| Verificação | Comando | Status | Evidência |
|---|---|---|---|
| Suíte | `npm test` | PASS / FAIL / NOT RUN / BLOCKED | ex.: exit 0, 855 JS + 89 Python |
| Lint, complexidade e documentação | `npm run validate` | | |

## Checklist

- [ ] Nenhum teste foi removido, pulado (`skip`) ou afrouxado para ficar verde; nenhum limite de lint foi relaxado
- [ ] Função nova respeita `docs/HARDENING.md` (≤ 30 linhas, aninhamento ≤ 4, complexidade ≤ 15, ≤ 5 parâmetros); quebra feita com semântica, sem `_part1()`/`_part2()`
- [ ] Se mudou o shell do PWA: bump de `CACHE_NAME` em `client/sw.js`
- [ ] Se mudou comportamento visível: `CHANGELOG.md` (seção *Não lançado*) e doc afetado atualizados
- [ ] Documentação conforme `docs/process/documentacao.md`: cabeçalho e JSDoc completo (`@param`, `@returns`, `@throws`) em todo export novo ou mudado; spec, FEATURES, ROADMAP, ADR e THREAT-MODEL quando a seção 3 pede; `npm run audit:docs` verde
- [ ] Nenhum segredo, token ou caminho da máquina pessoal no diff
- [ ] Se piloto V-P09 com **PILOT_FREEZE** ativo: este PR é **docs/hotfix** (`pilot-hotfix`) e não expande escopo do cliente
