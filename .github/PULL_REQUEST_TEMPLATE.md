## Summary

<!-- O que muda e por quê -->

## Checklist

- [ ] `npm test` verde (contagem atual em `docs/release-metadata.json`)
- [ ] Se mudou o shell do PWA: bump de `CACHE_NAME` em `client/sw.js`
- [ ] Se mudou comportamento visível: `CHANGELOG.md` (seção *Não lançado*) e doc afetado atualizados
- [ ] Se piloto V-P09 com **PILOT_FREEZE** ativo: este PR é **docs/hotfix** (`pilot-hotfix`) e não expande escopo do cliente
