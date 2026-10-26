# Espelhos read-only do shell PWA

**Objetivo:** ≥2 hosts estáticos servindo o mesmo `client/` (`vox-brasil`), sem canal 1→N.

| Mirror | Papel |
|--------|--------|
| **A** | GitHub Pages — workflow [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) em push `main` |
| **B** | Cloudflare Pages **ou** nginx coletivo (voluntário) |

## Integridade (release)

1. SHA publicado = commit do último deploy Pages bem-sucedido (ver tabela T2).
2. `CACHE_NAME` em [`client/sw.js`](../client/sw.js) **idêntico** entre espelhos da mesma release.
3. Diff `config/signaling.json` / `gateways.json` documentado por coletivo (fork de config ≠ espelho shell).
4. Smoke: PWA carrega, `#/settings/network`, opcional `#/c/demo-aprenda-vox-mirror`.

## Steward ≠ shell

Relay WSS/TURN/`POST /vox/mirror` vive na VPS — ver [`steward-seed-15min.md`](./steward-seed-15min.md).

---

## T2 — Registro executável (NET-01)

**Definition of Done (NET-01):** marcar ✓ **somente** quando, para cada linha `live`:

- `base_url` responde HTTP 200 no shell (`/` ou `/index.html`);
- `CACHE_NAME` lido de `{base_url}/sw.js` = valor da coluna;
- `git_sha` = `headSha` do último run **Deploy PWA — GitHub Pages** que publicou esse `CACHE_NAME` (espelho A) **ou** commit/tag documentado no deploy de B.

Escrever este doc **não** conta como ✓. Sem credenciais de B, a linha B permanece `planned`.

### Tabela de espelhos

| mirror_id | role | base_url | git_sha | CACHE_NAME | operator | read_only | status | DoD ✓ |
|-----------|------|----------|---------|------------|----------|-----------|--------|-------|
| `shell-a` | A (Pages) | https://yurikayel.github.io/vox/ | `c63125d84cb47a9c1a816868abee1b0c7271d156` | `vox-pwa-v6.83-steward-kit-v-i08` | yurikayel (CI GitHub Actions) | true | **live** | ✓ verificado 2026-10-25 — URL responde; `sw.js` live = CACHE_NAME acima; SHA = último deploy Pages (`gh run list --workflow=deploy-pages.yml`) |
| `shell-b` | B (alt) | *(vazio — preencher após go-live)* | *(mesmo SHA que A na release)* | `vox-pwa-v6.83-steward-kit-v-i08` *(obrigatório: copiar de `client/sw.js` da mesma release)* | *(voluntário — ver abaixo)* | true | **planned** | — |

**Verificação rápida (operador A ou auditor):**

```powershell
# CACHE_NAME publicado
(Invoke-WebRequest -Uri "https://yurikayel.github.io/vox/sw.js" -UseBasicParsing).Content -match 'CACHE_NAME = "([^"]+)"' | Out-Null; $matches[1]

# SHA do último deploy Pages
cd vox; gh run list --workflow=deploy-pages.yml --limit 1 --json headSha,conclusion
```

Rollback e incidentes em A: [`ops-pages-rollback.md`](./ops-pages-rollback.md). Drill DR (6 passos): [`ops-dr-drill-checklist.md`](./ops-dr-drill-checklist.md).

### Bloqueadores atuais — espelho B (`planned`)

| Bloqueador | Quem resolve |
|------------|----------------|
| URL pública + DNS/TLS | Voluntário espelho |
| Conta Cloudflare **ou** VPS/nginx com certificado | Voluntário espelho |
| `config/oauth.json` no artefato estático (secrets `VOX_*` no CI de A; B precisa env ou aviso de operador) | Voluntário + mantenedor (orientação OAuth em `client/DEV.md`, sem colar secrets no repo) |
| Registro desta tabela + smoke antes de convite piloto | Community-doc / voluntário |

---

## Voluntário — publicar espelho B (paridade com A)

Use **um** caminho. Em ambos: faça checkout do **mesmo** `git_sha` da linha A; **não** altere `CACHE_NAME` em `sw.js` salvo release coordenada com A.

### Opção 1 — Cloudflare Pages (recomendado)

1. Fork ou clone [github.com/yurikayel/vox](https://github.com/yurikayel/vox); anote `git rev-parse HEAD` após `git checkout <sha-da-release>`.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → Connect Git → repo `vox`, branch `main` (ou deploy manual a partir do SHA).
3. **Build settings:** Framework preset **None**; root directory `/`; build command:

   ```bash
   mkdir -p _site && cp -r client/* _site/ && cp docs/proposta-vox.html _site/ 2>/dev/null || true && node tools/write-oauth-deploy-config.mjs
   ```

   Build output directory: `_site`.

4. **Environment variables** (Production): `VOX_GOOGLE_CLIENT_ID`, `VOX_FACEBOOK_APP_ID` — mesmos valores que GitHub Actions secrets do repo (pedir ao mantenedor por canal seguro; **nunca** commitar).
5. Deploy; anote `base_url` (ex. `https://vox-shell-b.pages.dev/`).
6. Confirme paridade:

   ```powershell
   $b = "https://SUA-URL-B/"
   (Invoke-WebRequest -Uri ($b + "sw.js") -UseBasicParsing).Content -match 'CACHE_NAME = "([^"]+)"' | Out-Null; $matches[1]
   ```

7. Atualize a linha `shell-b` nesta tabela: `base_url`, `git_sha`, `operator`, `status: live`, DoD ✓ com data e comando usado.

### Opção 2 — nginx (coletivo / VPS)

1. `git clone https://github.com/yurikayel/vox.git && cd vox && git checkout <sha-da-release>`.
2. Montar site estático (ex. `/var/www/vox/`):

   ```bash
   mkdir -p _site && cp -r client/* _site/ && cp docs/proposta-vox.html _site/ 2>/dev/null || true
   export VOX_GOOGLE_CLIENT_ID="..." VOX_FACEBOOK_APP_ID="..."
   node tools/write-oauth-deploy-config.mjs
   rsync -a _site/ /var/www/vox/
   ```

3. nginx: `root /var/www/vox;` + `try_files $uri $uri/ /index.html;` para SPA; TLS (Let's Encrypt).
4. Smoke `sw.js` + `#/settings/network` como na opção 1; registrar tabela.

### Registro machine-readable (opcional)

Ver [`mirrors-registry.example.json`](./mirrors-registry.example.json) — copiar para registro do coletivo (não commitar URLs draft sem revisão).

*Playbook: T2 ops P0 · espelho B aguarda voluntário · rollback [#10](ops-pages-rollback.md).*
