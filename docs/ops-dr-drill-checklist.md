# Drill DR — espelho shell (NET-02)

**Objetivo:** uma execução humana documentada — simular queda de **A** (Pages), operar via **B**, avisar comunidade, restaurar **A** com paridade SHA/`CACHE_NAME`.

**Refs:** [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) (tabela T2) · [`ops-pages-rollback.md`](./ops-pages-rollback.md)

| Campo | Valor |
|-------|--------|
| **Resultado do drill** | *(vazio até execução humana)* |
| **Data executada** | *(vazio)* |
| **Operador** | *(vazio)* |

---

## Passos (6)

| # | Ação | Feito | Notas |
|---|------|-------|-------|
| 1 | **Simular A down:** aviso interno (não ataque real); pausar workflow Pages *ou* comunicar “usar só B” sem depender de A | [ ] | |
| 2 | **Abrir B:** confirmar `base_url` de `shell-b` responde; `sw.js` → `CACHE_NAME` = linha A na tabela T2 | [ ] | |
| 3 | **Smoke em B:** PWA, `#/settings/network`, `#/c/demo-aprenda-vox-mirror` (steward opcional se relay existir) | [ ] | |
| 4 | **Notificar:** mensagem piloto com URL B + pedido hard refresh se necessário | [ ] | |
| 5 | **Restaurar A:** reativar deploy Pages; verificar `gh run` success + `sw.js` em A | [ ] | |
| 6 | **Paridade final:** mesmo `git_sha` / `CACHE_NAME` em A e B; atualizar tabela T2 e preencher **Resultado** / **Data** neste arquivo | [ ] | |

**DoD NET-02:** linha **Resultado** acima preenchida (pass/fail honesto) + tabela T2 atualizada — não ✓ só por existir este checklist.
