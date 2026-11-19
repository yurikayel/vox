# Pacote anti-bus-factor (LAN-30)

> **Status:** canônico · **Owner:** mantenedor · **Revisado:** 2026-11-19

Objetivo: permitir que uma **segunda pessoa confiável** opere release, rollback e saiba **onde** ficam contas e segredos — **sem valores, tokens ou `.env` neste documento**.

Pré-requisitos de produto: ver [README — governança](../../README.md#-participação-licença-e-governança) e [backlog de lançamento público](../strategy/backlog-lancamento-publico-2026-11.md) (LAN-30, bus factor ≥ 2, piloto ainda fechado).

---

## 1. Release do PWA (GitHub Pages)

| Etapa | Ação |
|-------|------|
| Desenvolvimento | PRs de código para `develop`; `npm run validate` no SHA antes de pedir merge |
| Congelar linha | Branch atualizada com `origin/develop` |
| Promover | PR `develop` → `main`; título `release:`; corpo lista PRs + SW `CACHE_NAME` |
| CI | 15 checks verdes no SHA exato do PR (Cliente PWA 22/24, Relay 3.11–3.15, PM-99, PM-111 se `fix:`, CodeQL, secrets) |
| Metadados | `npm run release-metadata` → [`docs/release-metadata.json`](../release-metadata.json); `CACHE_NAME` só em [`client/sw.js`](../../client/sw.js) |
| Deploy | Push em `main` dispara [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) → artefato `_site/` |
| Pós-deploy | Avisar **hard refresh** (Ctrl+F5) — ver [`ops-pages-rollback.md`](./ops-pages-rollback.md) e [`client/DEV.md`](../../client/DEV.md) |

**Rollback:** [`ops-pages-rollback.md`](./ops-pages-rollback.md) · espelhos: [`ops-shell-mirrors.md`](./ops-shell-mirrors.md) · DR: [`ops-dr-drill-checklist.md`](./ops-dr-drill-checklist.md).

---

## 2. Mapa de contas e segredos (lugar e tipo apenas)

| Superfície | O que guarda | Onde configurar (sem valores) |
|------------|--------------|-------------------------------|
| **GitHub** | Repo, branch protection, Actions, Pages, dependabot | Settings do repositório; workflows em `.github/workflows/` |
| **GitHub Actions** | Segredos de deploy OAuth, tokens de automação | Repo → Settings → Secrets and variables → Actions |
| **Render** | Relay público (`vox-sentinel`), env do Python | Dashboard Render; template [`relay/render.yaml`](../../relay/render.yaml) |
| **Cloudflare** | (Futuro INF-01) Worker TURN | Conta Cloudflare; gatilho >50 ativos — [`gatilho-infra-50-ativos.md`](./gatilho-infra-50-ativos.md) |
| **OAuth no PWA** | `config/oauth.json` no artefato Pages | Gerado no CI por [`scripts/write-oauth-deploy-config.mjs`](../../scripts/write-oauth-deploy-config.mjs) |
| **App no aparelho** | Chaves DM, conta local, cofre | `localStorage` / IndexedDB; nunca commitar exportações de backup |

Risco de conta única: [THREAT-MODEL.md](../THREAT-MODEL.md) (T3). **Proibido** colar credenciais em issues, PRs, lobby ou docs versionados.

---

## 3. Relay e steward (não é o mesmo que release Pages)

| Doc | Uso |
|-----|-----|
| [`steward-relay-kit.md`](./steward-relay-kit.md) | Voluntário sobe relay + sinalização (Vox Memoria) |
| [`steward-relay-buddy.md`](./steward-relay-buddy.md) | Pareamento relay amigo |
| [`runbook-incidentes.md`](./runbook-incidentes.md) | Incidentes operacionais |
| [`turn-e-segundo-no.md`](./turn-e-segundo-no.md) | INF-01/02 quando gatilho 50 ativos disparar |

---

## 4. Validação mínima pós-release

1. `npm test` ou `npm run validate` no commit mergeado em `main`.
2. Relay: `GET /health` no endpoint documentado em [`docs/specs/relay-api.md`](../specs/relay-api.md).
3. PWA: abrir local `client/` + DevTools → Application → Service Workers → confirmar `CACHE_NAME` novo.
4. Smoke manual: feed, DM, criar comunidade (sem tráfego de piloto público).

---

## 5. O que ainda exige o mantenedor (humano)

- Revisão externa de cripto **LAN-18** / RFC 0002.
- Parecer jurídico e piloto **V-P09** (fechados por decisão).
- Edital **NLnet** e recrutamento de segunda pessoa ops.
- Dispensas CodeQL e decisões de infra até gatilho 50 ativos.

---

## 6. Checklist LAN-30 (segunda pessoa)

- [ ] Acesso **GitHub** (maintain ou admin) com 2FA.
- [ ] Acesso **Render** (ou steward designado) documentado fora do repo.
- [ ] Executou um release de teste em fork ou leu este doc + `CONTRIBUTING.md`.
- [ ] Sabe acionar rollback Pages sem pedir senhas por chat.
- [ ] Não abre piloto nem convites sem portões do backlog público.