# Dependências e cadeia de suprimentos (LAN-20)

> Inventário de todo código de terceiros que o Vox carrega ou usa para construir e publicar.
> **Fonte de verdade:** este arquivo. `tests/dependencias-inventory.test.js` quebra o CI quando o código passa a carregar algo que não está aqui.
> **Rotina mensal:** [`deps-mensal.yml`](../.github/workflows/deps-mensal.yml), no dia 1 de cada mês.
> Revisado em 2026-11-09.

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
| `cloudflare/wrangler-action@v3` | `deploy-shell-b.yml` | móvel (major) | sem SHA | **De terceiro** e com acesso ao token da Cloudflare: fixar por SHA de commit antes do G3. |

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
3. Uma URL externa nova em `import()`, `loadScript()`, CSP, workflow ou contêiner precisa de uma linha nesta página no mesmo PR, senão o teste quebra.
