# Triagem CodeQL — release PR #262 (`develop` → `main`)

Documento canônico para alertas do delta do release **#262** (novembro/2026). Dispensas no GitHub Security só com OK explícito do mantenedor e referência a este arquivo.

## Correções merged em `develop`

| Alerta / tema | Ação | PR / SHA |
|---------------|------|----------|
| **282** `js/clear-text-storage-of-sensitive-data` — `pass` em `vox-genesis-resume-v1` | Removido `pass` (e saneamento de legado) em `writeGenesisResume` / `readGenesisResume` | **#266** |
| **284** — `email` no mesmo rascunho | **B2:** não persistir `email`; pessoa re-digita após recarga | **#266** (commit `7e1c831`) |
| **283** `py/http-response-splitting` — CORS ecoando `Origin` | `request_guard.cors_allow_origin` só devolve entrada permitida | **#265** |
| **266–281** (17×) `py/path-injection` | `relay/safe_path.child_of` + validador sem regex | **#267** |
| **285–286** `py/polynomial-redos` | IDs validados por conjunto de caracteres, sem regex em entrada externa | **#267** |

## Falsos positivos (dispensa pendente de OK)

| ID | Regra | Motivo |
|----|-------|--------|
| **264**, **265** | `js/clear-text-storage-of-sensitive-data` | Fluxo rastreado persiste só `publicJwk` / `routeId` (dados públicos de rota), não credencial. |

## Evidência operacional

- **282/284:** `tests/onboarding-reload-keyboard.test.js` — asserções de ausência de `pass`/`email` no JSON de `sessionStorage`.
- **Path-injection:** `relay/test_safe_path.py` (17 testes).
- **CORS:** `relay/test_cors_origens.py`.

## Política

- Não dispensar alerta sem entrada neste doc + OK do usuário (lobby § Segurança).
- Release **#262** exige check agregado **CodeQL** verde no head do PR e CI 15/15 no mesmo SHA.