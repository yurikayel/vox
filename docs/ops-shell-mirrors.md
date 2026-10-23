# Espelhos read-only do shell PWA

**Objetivo:** ≥2 hosts estáticos servindo o mesmo `client/` (`vox-brasil`), sem canal 1→N.

| Mirror | Papel |
|--------|--------|
| **A** | GitHub Pages — `deploy-pages.yml` em push `main` |
| **B** | Cloudflare Pages / Gitea Pages / nginx coletivo |

## Integridade (release)

1. SHA publicado no README = `git rev-parse HEAD`
2. `CACHE_NAME` em `sw.js` igual entre espelhos da mesma release
3. Diff `config/signaling.json` / `gateways.json` documentado por coletivo
4. Smoke: PWA + `#/settings/network`

## Steward ≠ shell

Relay WSS/TURN/`POST /vox/mirror` vive na VPS — ver [`steward-seed-15min.md`](./steward-seed-15min.md).

## Registro sugerido (por espelho)

`mirror_id`, `base_url`, `git_sha`, `cache_name`, `operator`, `read_only: true`

*Playbook: spike segundo espelho shell (23/10).*
