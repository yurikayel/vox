# Rollback — GitHub Pages e Service Worker (`CACHE_NAME`)

**Escopo:** espelho **A** (Pages). Espelho **B** segue a mesma regra de paridade de `CACHE_NAME`; chaveamento de tráfego: [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) + [`ops-dr-drill-checklist.md`](./ops-dr-drill-checklist.md).

---

## Como o Pages publica

| Item | Valor |
|------|--------|
| Workflow | [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml) — nome **Deploy PWA — GitHub Pages** |
| Gatilho | Push em `main` quando mudam `client/**`, `docs/**`, `tools/write-oauth-deploy-config.mjs`, ou o próprio workflow; também `workflow_dispatch` |
| Artefato | `_site/` = cópia de `client/*` + `docs/proposta-vox.html` (se existir) + `config/oauth.json` gerado por [`tools/write-oauth-deploy-config.mjs`](../tools/write-oauth-deploy-config.mjs) |
| URL canônica A | https://yurikayel.github.io/vox/ |

---

## Como o SW invalida cache

- Valor canônico: `const CACHE_NAME = "..."` no topo de [`client/sw.js`](../client/sw.js).
- No `install`, o SW abre `CACHE_NAME` e pré-cacheia o shell; no `activate`, caches com nome **diferente** são apagados.
- Usuários que já visitaram o app podem continuar num SW/cache antigo até **hard refresh** (Ctrl+F5) ou limpar dados do site — não basta redeploy se o browser não buscar o novo `sw.js`.

**Comunicação pós-release:** avisar “hard refresh” ou “limpar cache do site” quando `CACHE_NAME` mudou (ver `client/DEV.md`).

---

## Cenários de incidente

| Sintoma | Causa provável |
|---------|----------------|
| Shell quebrado / JS antigo em produção | Deploy ruim em `main`; usuários presos em SW anterior |
| “App branco” após deploy | `sw.js` ou asset mismatch; erro em asset crítico |
| Só A inacessível | GitHub/Pages ou DNS; **não** confundir com relay steward |
| A e B com `CACHE_NAME` diferentes | DR incompleto — prioridade P0 antes de feature |

---

## Rollback (espelho A)

Ordem recomendada — do mais rápido ao mais estrutural:

### 1. Reexecutar deploy anterior (preferido se o commit bom já está em `main`)

1. GitHub → **Actions** → **Deploy PWA — GitHub Pages**.
2. Localize o último run **success** cujo `headSha` servia o shell estável.
3. Se o problema é **commit errado no tip de `main`**: reverta o commit problemático em `main` (novo commit de revert) — isso dispara deploy automático se tocou `client/**`.
4. Se `main` já está correto mas o deploy falhou: **Re-run all jobs** no run good **ou** `workflow_dispatch` após confirmar SHA.

Confirme:

```powershell
gh run list --workflow=deploy-pages.yml --limit 3
(Invoke-WebRequest -Uri "https://yurikayel.github.io/vox/sw.js" -UseBasicParsing).Content.Substring(0,120)
```

### 2. Comunicação imediata (usuários presos em SW)

- Canal piloto / README: pedir **hard refresh** ou limpar “dados do site” para `yurikayel.github.io`.
- Se o deploy bom **não** mudou `CACHE_NAME`, hard refresh ainda pode ser necessário para puxar HTML/JS corrigido.
- Se A continua down: divulgar URL **B** (quando `shell-b` estiver `live`) — ver checklist DR.

### 3. Quando **reverter commit** vs **só bump `CACHE_NAME`**

| Situação | Ação |
|----------|------|
| Bug em lógica JS/CSS/HTML no `client/` | **Revert** (ou fix forward) em `main` → deploy Pages; se usuários ainda cacheiam shell ruim, **bump `CACHE_NAME`** num follow-up commit para forçar novo cache |
| Deploy correto mas usuários em SW velho após fix já publicado | **Bump `CACHE_NAME`** em `sw.js` + merge `main` (sem mudar lógica) + comunicar hard refresh |
| Só docs/oauth gerado errado | Fix workflow/secrets ou revert; bump `CACHE_NAME` se `sw.js` ou assets do shell mudaram na mesma release |
| Espelho B desatualizado | Republicar B no **mesmo** `git_sha` e `CACHE_NAME` que A — não rollback isolado em B com nome de cache diferente |

**Regra:** na mesma release, **A e B** devem expor o **mesmo** `CACHE_NAME`. Rollback em A sem republicar B recria mismatch (sinal de falha em [`ops-shell-mirrors.md`](./ops-shell-mirrors.md)).

### 4. Se A permanece indisponível

- Executar ou acionar [`ops-dr-drill-checklist.md`](./ops-dr-drill-checklist.md) (simulação real ou incidente).
- Registrar data e operador na checklist — não marcar drill ✓ sem execução humana.

---

## Pós-incidente

- [ ] `git_sha` e `CACHE_NAME` na tabela T2 de [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) batem com verificação HTTP.
- [ ] `npm test` verde no SHA publicado.
- [ ] Nota curta no canal da comunidade: causa, ação, se houve bump de `CACHE_NAME`.

*Método #10 — rollback Pages + SW · pareado com T2 / NET-02.*
