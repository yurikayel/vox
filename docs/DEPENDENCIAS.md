# Dependências e cadeia de suprimentos (LAN-20)

> Inventário do código de terceiros que o Vox carrega ou usa para construir e publicar, e dos binários que o repositório distribui.
> **Fonte de verdade:** este arquivo. `tests/dependencias-inventory.test.js` quebra o CI quando o código passa a carregar algo que não está aqui.
> **Rotina mensal:** [`deps-mensal.yml`](../.github/workflows/deps-mensal.yml), no dia 1 de cada mês.
> Revisado em 2026-11-10 (PM-95: actions fixadas por SHA e Dependabot; seção 6, binários, desde 2026-11-09).

## Como ler

- **Fixo:** a versão não muda sozinha.
- **Móvel:** a tag aponta para versões novas com o tempo, como `@v5`, `:2-alpine` ou `:latest`.
- **SRI:** hash `sha384-…` do arquivo exato. A rotina mensal baixa a URL de novo e compara. Se o hash mudou, alguém revisa antes de aceitar.

## 1. Navegador (código que roda no aparelho da pessoa)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| **arweave**, vendorizado em `client/vendor/arweave-1.15.7.bundle.js` | `client/js/upload.js`, `client/js/wallet.js` (`ARWEAVE_BUNDLE_URL`); carrega só ao publicar no Arweave ou consultar o saldo da carteira | 1.15.7, fixa, dependências congeladas dentro | `sha384-OW68l9kk3+Mp45NcS58vH/fvXYo2zzlCBqk+EtgezkH3Yr/VmvfqofABTTUvVYV3` (81 738 bytes) | ✅ **Fechado (PM-11, 09/11/2026).** Servido pelo próprio site, sem CDN em tempo de execução. `tests/arweave-vendor.test.js` confere o hash, que o arquivo não importa nada de fora e que ele assina e verifica uma transação sem rede. O `.gitattributes` guarda os bytes exatos (`-text`). Para atualizar: baixar a versão nova da URL de origem, revisar o diff e trocar arquivo, nome e hash juntos. |
| Origem do bundle acima: `https://esm.sh/arweave@1.15.7/es2022/arweave.bundle.mjs` | não é carregado pelo app; só a rotina mensal baixa | 1.15.7 | `sha384-OW68l9kk3+Mp45NcS58vH/fvXYo2zzlCBqk+EtgezkH3Yr/VmvfqofABTTUvVYV3` | A rotina mensal confere se a origem ainda bate com a cópia vendorizada (mesmo hash com 3 User-Agents diferentes em 2026-11-09). Se mudar, a cópia do repositório continua valendo; só avisa que a origem foi reconstruída. |
| Google Identity Services `https://accounts.google.com/gsi/client` | `client/js/oauth-profile.js` | sem versão publicada | sem SRI: o Google muda o arquivo sem aviso | Risco aceito. Só carrega quando a pessoa toca em "Entrar com Google" **e** o `config/oauth.json` tem Client ID. Sem configuração, nunca carrega. |
| Facebook SDK `https://connect.facebook.net/pt_BR/sdk.js` | `client/js/oauth-profile.js` | sem versão publicada | sem SRI: a Meta muda o arquivo sem aviso | Risco aceito, com a mesma regra do Google: só com App ID configurado e só no toque. |
| secp256k1 / Schnorr BIP-340 | `client/js/nostr-event.js` | código próprio | n/a | Implementação própria em JS puro, sem dependência externa. Ainda sem revisão externa (LAN-18). |

**CSP** (`client/_headers` e `client/index.html`, que `tests/csp.test.js` mantém iguais): `script-src 'self' https://accounts.google.com https://connect.facebook.net`. O `https://esm.sh` saiu do `script-src` com o arweave vendorizado (PM-11).

## 2. Construção e testes (npm)

| Dependência | Onde | Versão | Integridade | Situação |
|---|---|---|---|---|
| @jsquash/avif | `package.json` (dev), usado só por `tools/media-bench/` (PM-70) | 2.1.1 no lock (fixa) | `sha512` no `package-lock.json` | Só desenvolvimento; não vai para o navegador. Apache-2.0. A transitiva `wasm-feature-detect` 1.10.0 não carrega no Chrome 152 (`import.source`); a bancada usa direto o codificador de thread única. Se for para o app (PM-71), entra vendorizado com hash. |
| eslint | `package.json` (dev) | 10.14.0 no lock | `sha512` no `package-lock.json` | Só desenvolvimento e CI; não vai para o navegador. |
| globals | `package.json` (dev) | 17.14.0 no lock | `sha512` no `package-lock.json` | Idem. |
| Transitivas do eslint (76 pacotes) | `package-lock.json` | fixas no lock | `sha512` no lock | `npm ci` respeita o lock; `npm audit --audit-level=high` roda em todo PR (`ci.yml`) e todo mês. |

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

Desde o PM-95 toda action é fixada pelo **SHA do commit**, com a versão em comentário (`uses: dono/action@<sha> # vX.Y.Z`). Uma tag movida não troca o código que roda com os tokens do repositório. O teste de inventário quebra se aparecer action por tag. O Dependabot ([`dependabot.yml`](../.github/dependabot.yml)) abre o PR que troca o SHA e o comentário juntos.

| Dependência | Versão | Onde | Situação |
|---|---|---|---|
| `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 | todos os workflows | Oficial do GitHub. |
| `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` | v7.1.0 | `ci.yml`, `deps-mensal.yml`, `nostr-smoke.yml` | Oficial do GitHub. |
| `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | v7.1.0 | `ci.yml`, `release-binarios.yml`, `windows-node-zero-smoke.yml` | Oficial do GitHub. |
| `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 | `ci.yml`, `nostr-smoke.yml`, `release-binarios.yml` | Oficial do GitHub. |
| `actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d` | v6.0.0 | `deploy-pages.yml` | Oficial do GitHub. |
| `actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9` | v5.0.0 | `deploy-pages.yml` | Oficial do GitHub. |
| `actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346` | v5.0.1 | `deploy-pages.yml` | Oficial do GitHub. |
| `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8` | v4.2.2 | `release-binarios.yml` | Oficial do GitHub. Gera a atestação de origem dos binários (PM-45). |
| `github/codeql-action/init@33d7b85da1a04171e211befe2c739303b9a4c066` | v4.39.3 | `codeql.yml` | Oficial do GitHub. SAST (PM-95). |
| `github/codeql-action/analyze@33d7b85da1a04171e211befe2c739303b9a4c066` | v4.39.3 | `codeql.yml` | Oficial do GitHub. SAST (PM-95). |
| `cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0` | v4.1.3 | `deploy-shell-b.yml` | **De terceiro** e com acesso ao token da Cloudflare: o SHA impede que uma tag movida troque o código. Desde a v4 instala o Wrangler v4 por padrão. |

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
4. Action nova entra fixada pelo SHA do commit da versão, com a versão em comentário (§5).
