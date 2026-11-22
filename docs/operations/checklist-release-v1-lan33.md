# Checklist de Release v1.0 e Política SemVer (LAN-33)

> **Status:** rascunho · **Owner:** mantenedor / release ops · **Revisado:** 2026-11-22  
> **Nota de prontidão:** protocolo alvo do portão **G3** (abertura pública, [`plano-lancamento-ondas.md`](../strategy/plano-lancamento-ondas.md)); passa a `canônico` quando todos os pré-requisitos do G3 (exceto este item) estiverem fechados e o ensaio pré-release de rollback estiver datado.

Referências operacionais diretas: [`pacote-anti-bus-factor.md`](./pacote-anti-bus-factor.md) · [`ops-pages-rollback.md`](./ops-pages-rollback.md) · [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) · [`ops-dr-drill-checklist.md`](./ops-dr-drill-checklist.md).

---

## 1. Política de Versionamento Semântico (`MAJOR.MINOR.PATCH`)

Até a conclusão das fases F0–F2 (piloto e beta), o repositório mantém a versão pré-pública em [`package.json`](../../package.json) (`0.x.y`) e identifica cortes internos pela linha do Service Worker. A partir do lançamento público (**G3**), o Vox adota **SemVer 2.0.0** iniciando em **`v1.0.0`**:

| Segmento | Quando incrementar | Exemplos no Vox |
|---|---|---|
| **`MAJOR`** (`X.0.0`) | Mudança incompatível de protocolo, manifesto ou formato persistido sem migração transparente | Quebra de schema de cofre/identidade ou alteração incompatível de endpoint público documentado |
| **`MINOR`** (`1.Y.0`) | Nova funcionalidade compatível com a linha atual ou evolução aditiva de UI/protocolo | Novo módulo ou fluxo no PWA mantendo leitura/assinatura de eventos anteriores |
| **`PATCH`** (`1.0.Z`) | Correção de bug, patch de segurança (`pilot-hotfix` / `fix:`) ou ajuste operacional compatível | Correção em cliente, relay ou SW sem mudança de contrato |

---

## 2. Checklist de corte da release `v1.0.0`

Executar em ordem estrita no PR `develop` → `main` ([`backlog-lancamento-publico-2026-11.md`](../strategy/backlog-lancamento-publico-2026-11.md), `LAN-33`):

### 2.1 Pré-requisitos do portão G3 e congelamento (`develop` → `main`)
- [ ] Confirmar no [`ROADMAP.md`](../ROADMAP.md) que todos os itens do portão **G3** (exceto `LAN-33`) estão concluídos ou formalmente dispensados.
- [ ] Sincronizar `develop` com `origin/develop` e abrir janela de congelamento (aceitar apenas correções críticas `fix:` com revisão dupla `LAN-30`).
- [ ] Abrir PR `develop` → `main` com título `release: v1.0.0`, listando os PRs incluídos e o estado de `CACHE_NAME`.

### 2.2 Portões obrigatórios de qualidade e CI
- [ ] Rodar `npm run validate` localmente no SHA exato do PR (`lint`, `lint:relay`, `audit:complexity`, `audit:docs`, `audit:layers`, `npm test`).
- [ ] Confirmar **15/15 checks verdes** no [CI](../../.github/workflows/ci.yml) no SHA exato do PR, incluindo **`e2e-mesh`** (dois Chromium P2P), `Cliente PWA` (Node 22/24), `Relay & Signaling` (Python 3.11/3.12/3.15), `security-audit`, `red-on-base` e `pilot-freeze`.
- [ ] Confirmar workflow de **CodeQL** ([`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml)) verde e sem alertas críticos em aberto.
- [ ] Verificar higiene do workspace Git (`git status --short`): **zero** arquivos `docs/metrics/baseline-*` não rastreados ou recém-gerados incluídos indevidamente no commit/PR.

### 2.3 Paridade de cache do Service Worker (`CACHE_NAME`)
- [ ] Garantir que nenhuma documentação duplica string concreta de versão do SW: o valor canônico reside **exclusivamente** em [`client/sw.js`](../../client/sw.js) e é espelhado em [`docs/release-metadata.json`](../release-metadata.json).
- [ ] Se houver mudança em `client/**`, realizar o bump de `CACHE_NAME` em `client/sw.js`, conferir 100% de paridade entre `SHELL_ASSETS` e os arquivos reais em disco, e executar `npm run release-metadata` (ou `npm run release-line`).
- [ ] Confirmar passagem de [`tests/release-metadata-drift.test.js`](../../tests/release-metadata-drift.test.js) (`meta.cache_name === CACHE_NAME`).

### 2.4 Corte de `CHANGELOG.md`, `package.json` e tag `v1.0.0`
- [ ] Atualizar `"version": "1.0.0"` em [`package.json`](../../package.json).
- [ ] Converter a seção `[Não lançado]` de [`CHANGELOG.md`](../../CHANGELOG.md) na seção datada `[1.0.0] - AAAA-MM-DD`, registrando o resumo do lançamento e as métricas de desempenho em entrada (`LAN-23`).
- [ ] Após aprovação da 2ª pessoa (`LAN-30`) e merge do PR em `main`, criar e publicar a **tag Git anotada** no commit exato de `origin/main`:
  ```powershell
  git fetch origin main; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  git tag -a v1.0.0 origin/main -m "Release v1.0.0"; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  git push origin v1.0.0; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  ```
- [ ] Confirmar execução bem-sucedida de [`.github/workflows/release-binarios.yml`](../../.github/workflows/release-binarios.yml) (`Binários — build e release`), gerando `SHA256SUMS`, atestações e a GitHub Release da tag `v1.0.0`.

### 2.5 Verificação pós-deploy (GitHub Pages A + Espelho B)
- [ ] Confirmar conclusão `success` de [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) (Espelho A) e [`.github/workflows/deploy-shell-b.yml`](../../.github/workflows/deploy-shell-b.yml) (Espelho B) no mesmo `git_sha` de `main`.
- [ ] Conferir via HTTP que `{base_url}/sw.js` em **A** (`https://yurikayel.github.io/vox/`) e em **B** (`https://vox-9df.pages.dev/`) respondem HTTP 200 com o **mesmo** `CACHE_NAME` de `client/sw.js`, e atualizar a tabela T2 em [`ops-shell-mirrors.md`](./ops-shell-mirrors.md).
- [ ] Executar smoke no ar: carregamento do shell, `#/settings/network`, `GET /health` do relay e aviso de **hard refresh** (`Ctrl+F5`) aos usuários caso `CACHE_NAME` tenha mudado.

---

## 3. Ensaio obrigatório de rollback pré-release

O DoD do `LAN-33` exige **1 ensaio datado de rollback antes de cortar `v1.0.0`**, seguindo o fluxo completo de [`ops-pages-rollback.md`](./ops-pages-rollback.md):

- [ ] Simular commit/shell problemático em ambiente controlado ou janela de manutenção pré-G3 e executar rollback em **A** (re-run de deploy bom ou revert em `main`).
- [ ] Validar paridade **A ↔ B** (mesmo `git_sha` e mesmo `CACHE_NAME`) conforme [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) e verificar `sw.js` via HTTP.
- [ ] Registrar data, operador, SHA e resultado na tabela abaixo antes de autorizar a tag `v1.0.0`.

| Data | Operador(es) | Escopo / Espelhos testados | Resultado | Evidência (run / SHA) |
|---|---|---|---|---|
| — | *(0 ensaios realizados — obrigatório antes de cortar `v1.0.0` no G3)* | — | — | — |
