# Dependências e cadeia de suprimentos (LAN-20)

> Inventário do código de terceiros que o Vox carrega ou usa para construir e publicar, e dos binários que o repositório distribui.
> **Fonte de verdade:** este arquivo. `tests/dependencias-inventory.test.js` quebra o CI quando o código passa a carregar algo que não está aqui.
> **Rotina mensal:** [`deps-mensal.yml`](../.github/workflows/deps-mensal.yml), no dia 1 de cada mês.
> Revisado em 2026-11-09 (seção 6, binários, acrescentada no mesmo dia).

## Como ler

- **Fixo:** a versão não muda sozinha.
- **Móvel:** a tag aponta para versões novas com o tempo, como `@v5`, `:2-alpine` ou `:latest`.
- **SRI:** hash `sha384-…` do arquivo exato. A rotina mensal baixa a URL de novo e compara. Se o hash mudou, alguém revisa antes de aceitar.

## 1. Navegador (código que roda no aparelho da pessoa)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| **arweave** via `https://esm.sh/arweave@1.15.7` | `client/js/upload.js`, `client/js/wallet.js`; carrega só ao publicar no Arweave ou abrir a carteira | 1.15.7, fixa | **sem SRI** | 🚧 **Risco aberto.** O `import()` dinâmico não aceita `integrity`. Além disso, o arquivo de entrada do esm.sh puxa `arconnect@^0.4.2`, `base64-js@^1.5.1` e `bignumber.js@^9.0.2` com `^` (versões flutuantes) e muda conforme o User-Agent. Correção proposta: vendorizar o bundle da linha abaixo em `client/vendor/` e importar do próprio site. Falta testar o bundle no app antes de trocar. |
| arweave, bundle autocontido (candidato a vendorizar) `https://esm.sh/arweave@1.15.7/es2022/arweave.bundle.mjs` | ainda não usado | 1.15.7, fixa, dependências congeladas dentro | `sha384-OW68l9kk3+Mp45NcS58vH/fvXYo2zzlCBqk+EtgezkH3Yr/VmvfqofABTTUvVYV3` (81 738 bytes) | Mesmo hash com 3 User-Agents diferentes em 2026-11-09. Não importa nenhum outro arquivo. |
| Google Identity Services `https://accounts.google.com/gsi/client` | `client/js/oauth-profile.js` | sem versão publicada | sem SRI: o Google muda o arquivo sem aviso | Risco aceito. Só carrega quando a pessoa toca em "Entrar com Google" **e** o `config/oauth.json` tem Client ID. Sem configuração, nunca carrega. |
| Facebook SDK `https://connect.facebook.net/pt_BR/sdk.js` | `client/js/oauth-profile.js` | sem versão publicada | sem SRI: a Meta muda o arquivo sem aviso | Risco aceito, com a mesma regra do Google: só com App ID configurado e só no toque. |
| secp256k1 / Schnorr BIP-340 | `client/js/nostr-event.js` | código próprio | n/a | Implementação própria em JS puro, sem dependência externa. Ainda sem revisão externa (LAN-18). |

**CSP** (`client/_headers` e `client/index.html`, que `tests/csp.test.js` mantém iguais): `script-src 'self' https://esm.sh https://accounts.google.com https://connect.facebook.net`. Com o arweave vendorizado, o `https://esm.sh` pode sair do `script-src`.

## 2. Construção e testes (npm)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| eslint | `package.json` (dev) | 9.39.5 no lock | `sha512` no `package-lock.json` | Só desenvolvimento e CI; não vai para o navegador. |
| globals | `package.json` (dev) | 16.5.0 no lock | `sha512` no `package-lock.json` | Idem. |
| Transitivas do eslint (85 pacotes) | `package-lock.json` | fixas no lock | `sha512` no lock | `npm ci` respeita o lock; `npm audit --audit-level=high` roda em todo PR (`ci.yml`) e todo mês. |

## 3. Relay e sinalização (Python)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| Biblioteca padrão do Python | `relay/` | 3.11 e 3.12 no CI | n/a | `relay/requirements.txt` não lista nenhum pacote pip. |
| `pyinstaller` | `windows-node-zero-smoke.yml`, `release-binarios.yml` (só CI) | 6.22.3, fixa | sem hash (`--require-hashes` não usado) | Gera o `VoxPopuli.exe` do teste de fumaça; não é o binário de `client/downloads/` (ver §6). |
| `ruff` | `ci.yml`, job do relay (só CI) | `0.17.4` | sem hash | Lint obrigatório desde 09/11/2026: pyflakes e complexidade (`ruff.toml`); estilo e tamanho de função só informados |

## 4. Imagens de contêiner

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| `python:3.12-alpine` | `relay/Dockerfile` | móvel, patch do 3.12 | sem digest | Recomendado fixar por digest (`@sha256:…`) antes do G3. |
| `caddy:2-alpine` | `relay/deploy/docker-compose.yml` | móvel, Caddy 2.x | sem digest | Idem; kit de steward. |
| `coturn/coturn:latest` | `relay/deploy/docker-compose.yml` | **móvel, `latest`** | sem digest | Trocar `latest` por uma versão fixa. O TURN é opcional no kit. |

## 5. GitHub Actions (CI e deploy)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| `actions/checkout@v5` | todos os workflows | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/setup-node@v5` | `ci.yml`, `deps-mensal.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/setup-python@v6` | `ci.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/upload-artifact@v4` | `ci.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/configure-pages@v5` | `deploy-pages.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/upload-pages-artifact@v3` | `deploy-pages.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/deploy-pages@v4` | `deploy-pages.yml` | móvel (major) | sem SHA | Oficial do GitHub. |
| `actions/attest-build-provenance@v2` | `release-binarios.yml` | móvel (major) | sem SHA | Oficial do GitHub. Gera a atestação de origem dos binários (PM-45). |
| `cloudflare/wrangler-action@v3` | `deploy-shell-b.yml` | móvel (major) | sem SHA | **De terceiro** e com acesso ao token da Cloudflare: fixar por SHA de commit antes do G3. |

## 6. Binários no repositório

`Vox.exe`, `VoxPopuli.exe`, `vox.apk` e `vox-populi.apk` **não ficam mais no git** (PM-45). O workflow [`release-binarios.yml`](../.github/workflows/release-binarios.yml) compila os quatro num runner do GitHub a cada tag `v*`, publica na [GitHub Release](https://github.com/yurikayel/vox/releases/latest) com `SHA256SUMS` e gera uma atestação de origem. A página de download aponta para `releases/latest/download/…`. Para conferir um arquivo baixado:

```
gh attestation verify Vox.exe --repo yurikayel/vox
```

Os APKs do CI são assinados com uma chave de debug criada na hora, como já fazia o `android/build.ps1` local: atualizar exige desinstalar antes. Uma chave fixa guardada em secret do repositório fica para o PM-39.

Ficam no git só as DLLs do SDK do WebView2, que o build do `Vox.exe` precisa. O teste confere que **cada binário** que restar tem linha aqui **com o SHA-256 atual**, e que nenhum `.exe` ou `.apk` volta para `client/` ou `android/`.

| Arquivo | Bytes | SHA-256 | O que é | Situação |
|---|---|---|---|---|
| `packaging/desktop-windows-native/lib/Microsoft.Web.WebView2.Core.dll` | 649 800 | `8219a3135436c147f8eb02fb831e99596103eebc18b6d7b794ca93f4c67018a2` | SDK WebView2 da Microsoft (terceiro), vendorizado para o build C# | Versão não anotada; conferir com o pacote NuGet `Microsoft.Web.WebView2` oficial |
| `packaging/desktop-windows-native/lib/Microsoft.Web.WebView2.WinForms.dll` | 39 016 | `c48f8d729dc531288d2c53a6241effe7922ed1b947850b2442008a945c098c48` | SDK WebView2 da Microsoft (terceiro) | Idem |
| `packaging/desktop-windows-native/lib/WebView2Loader.dll` | 161 864 | `eb5335edeaa6f2122c044e82aab2351dc8c9b4e0fe5e578c71922fb61be285e7` | SDK WebView2 da Microsoft (terceiro) | Idem; mesmo arquivo de `runtimes/win-x64/native/` |
| `packaging/desktop-windows-native/lib/runtimes/win-x64/native/WebView2Loader.dll` | 161 864 | `eb5335edeaa6f2122c044e82aab2351dc8c9b4e0fe5e578c71922fb61be285e7` | SDK WebView2 da Microsoft (terceiro) | Idem |

✅ **T2, binários (PM-45):** a atestação prova que cada arquivo saiu deste workflow, a partir de um commit público. O build ainda não é reproduzível bit a bit (o PyInstaller grava data, e a chave dos APKs muda a cada build). Falta assinar os `.exe` do Windows (PM-46).

## Rotina mensal

O workflow [`deps-mensal.yml`](../.github/workflows/deps-mensal.yml) roda no dia 1 de cada mês e também pode ser disparado à mão. Ele:

1. roda `npm audit --audit-level=high`, que falha com vulnerabilidade alta;
2. roda o teste de inventário, que falha se o código carrega algo que não está nesta página;
3. baixa cada URL com `sha384-` desta página e compara o hash (`scripts/deps-check-cdn.mjs`), que falha se o hash mudou;
4. coloca `npm outdated` no resumo da execução, só para informar.

Quando o job falhar, quem revisa:

- olha o resumo da execução;
- se a mudança for legítima, atualiza a versão e o hash aqui, num PR com a data;
- se não reconhecer a mudança, abre um incidente seguindo o [runbook](./operations/runbook-incidentes.md).

## Como adicionar uma dependência

1. Prefira **não** adicionar.
2. Se for inevitável, prefira vendorizar em `client/vendor/` com o hash anotado aqui.
3. Uma URL externa nova em `import()`, `loadScript()`, CSP, workflow (`uses:` ou `pip install`), contêiner ou um binário novo (ou recompilado) precisa de uma linha nesta página no mesmo PR, senão o teste quebra.
