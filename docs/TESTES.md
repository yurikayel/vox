# Testes — como rodar, escrever e o que o CI checa

> **Status:** canônico · **Owner:** mantenedor / qualidade · **Revisado:** 2026-11-17 (§4 com os 10 workflows; §3.3 Tier A pelo CODEOWNERS; §4 conferida com o `ci.yml`; §3.4 vermelho na base, PM-111)
> Contagem atual de testes: **só** em [release-metadata.json](./release-metadata.json) (`test_js`, `test_python`).
> **Como relatar e o que é proibido** (PASS / FAIL / NOT RUN / BLOCKED, falso verde, determinismo, auditoria): [process/qualidade-e-evidencia.md](./process/qualidade-e-evidencia.md). Verificação completa antes do merge: `npm run validate`.

## 1. Rodar

```bash
npm test                 # tudo: cliente + relay
npm run test:client      # node --test tests/*.test.js
npm run test:relay       # python -m unittest discover -s relay -p "test_*.py"
node --test tests/civic-post.test.js                   # um arquivo
node --test --test-name-pattern="dm badge" tests/       # por nome
python -m unittest relay.test_server                   # um módulo do relay (na raiz)
npm run test:e2e         # Chromium real, rede de fora bloqueada (fora do CI; ver §3.1)
```

Requisitos: Node 22+ (o CI roda 22 e 24) e Python 3.11+ (o CI roda 3.11 e 3.12). Não há dependência de runtime para testar; `npm install` só traz o ESLint.

## 2. Cliente (`tests/*.test.js`, `node:test`)

- **Um arquivo por módulo ou fluxo**, com o nome do módulo: `tests/<modulo>.test.js`.
- **Ambiente de navegador simulado:** comece com `import "../tests/setup.js";`. Ele define mocks globais (`window`, `localStorage`, `BroadcastChannel`, `navigator`, `location`) para que os ES modules de `client/js/` carreguem em Node. IndexedDB é exercitado pelos próprios módulos (`cache-node.test.js`).
- **Importe o módulo real** com `await import("../client/js/…")`. Prefira testar funções puras exportadas (ex.: `sumUnreadDms` em `render/shell.js`, o classificador em `civic-post.js`).
- **Testes de integridade** leem arquivos do repo com `fs`: `entrypoint-integrity.test.js` (imports do entrypoint resolvem) e testes que conferem `SHELL_ASSETS` do `sw.js` (ex.: `voxels.test.js`). Módulo novo no shell = registrar em `SHELL_ASSETS` + bump de `CACHE_NAME`. `release-metadata-drift.test.js` falha se o `cache_name` de `docs/release-metadata.json` não bater com o `CACHE_NAME` do `sw.js` (REV-03): ao subir a versão do SW, rode `npm run release-line`.
- **Esqueleto:**

```js
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const { minhaFuncao } = await import("../client/js/meu-modulo.js");

test("meu-modulo — caso feliz", () => {
  assert.equal(minhaFuncao("x"), "y");
});
```

## 3. Relay (`relay/test_*.py`, `unittest`)

Stdlib pura. `test_server.py` sobe o handler HTTP em memória e exercita as rotas descritas em [relay-api.md](./specs/relay-api.md). Os testes usam diretórios temporários via `VOX_RELAY_*_DIR`, nunca o `.cache/` real. `test_relay_limites_e_rotas.py` (limites de tamanho, entradas ruins, quadros WebSocket) troca as quatro pastas do relay por um diretório temporário em `setUpModule` e devolve as originais no fim; todo teste novo que mexa em pasta do relay faz o mesmo.

### 3.1 E2E no navegador (`e2e/test_*.py`)

`npm run test:e2e` abre Chromium real (Playwright para Python: `pip install playwright` e `python -m playwright install chromium`), com o cliente servido localmente e **toda rede de fora bloqueada**. Cobre entrada e recarga com IndexedDB, as rotas principais, os assistentes em etapas e dois navegadores na malha. **Mesa / VTT:** `e2e/test_vox_e2e.py` (fluxo demo campanha→mesa→ficha→mestre) e `e2e/test_mesa_ttrpg_e2e.py` (modo jogador E5, canvas, rolagem por fórmula, acampamento/calendário, mobile). Só mesa: `python -m unittest e2e.test_mesa_ttrpg_e2e -v`. Não roda no CI; a malha de dois navegadores do CI é `scripts/mesh-e2e.mjs`.

### 3.1.1 Login no navegador (`scripts/login-e2e.mjs`, LT-08)

Chromium real contra um servidor estático em loopback, com toda rede de fora abortada e toda tentativa anotada. Cria só com nome e apaga; cria com e-mail + senha + frase, confere o kit (link, código `VOX1:`, arquivo `.txt`), apaga e volta **num aparelho novo** por link, código, arquivo e frase; recusa senha errada, texto sem kit, frase com palavra trocada e e-mail + senha sem cofre (cai na malha: aviso, sem conta). A senha não pode aparecer em nenhuma tentativa de rede nem no storage. Manual do mantenedor (não roda no CI): `npm install --no-save playwright-core` e depois `node scripts/login-e2e.mjs` (`CHROMIUM_EXECUTABLE_PATH` aponta para um Chrome já instalado). Guardiões, QR e malha com dois aparelhos ficam nos testes de fluxo; ver [plano-testes-login.md](./process/plano-testes-login.md) §5.

### 3.2 Cobertura: métrica com catraca

Desde 22/11/2026 (decisão do mantenedor) a cobertura é medida e tem piso que só sobe; a meta é **90%** no cliente e no relay.

- `npm run coverage:js` (`scripts/coverage.mjs`): roda `node:test` com `--experimental-test-coverage` e conta só **linhas de código** de `client/js` e `client/aviso` (linhas em branco e de comentário ficam fora, medidas pelos tokens do espree; JSDoc novo não infla o número). Arquivo de produção que nenhum teste carrega entra com 0%. `--lcov <arquivo>` reaproveita um lcov pronto.
- `npm run coverage:py` (`scripts/py_coverage.py`, Python 3.12+, só biblioteca padrão): roda a descoberta do `test:relay` com `sys.monitoring` e conta instruções do AST (docstrings fora) em `relay/*.py`.
- Pisos em `scripts/coverage-floor.json`; `--raise` sobe o piso para o valor medido e nunca desce. Linha de base em 22/11: cliente 78,8%, relay 91,9%. Em 23/11, depois dos lotes T1–T7: cliente 95,3%, relay 91,9% (pisos atuais; meta 90%).

A métrica não muda a regra do teste: todo teste confere algo observável (retorno, DOM, chamada, estado). Proibido teste vazio, excluir arquivo da medição ou comentário `c8 ignore`/`istanbul ignore` para subir o número. A varredura de 2026-11-16 (99 arquivos `coverage-*`) foi triada: os defeitos reais viraram correções com teste próprio (`tests/achados-cobertura.test.js`).

### 3.3 Tier A: o que exige mais prova

O Tier A dos testes são as linhas de `client/js/` do [`.github/CODEOWNERS`](../.github/CODEOWNERS): identidade (`identity/`), cofre (`vault/`), formato de assinatura (`sig-format.js`), DM cifrada (`crypto-dm.js`) e caixa de entrada (`inbox.js`). Não há outro mapa de risco. `tests/codeowners-paths.test.js` reprova linha que aponta para caminho que não existe mais, para a marca de sensível não sumir quando um arquivo muda de pasta. A identidade está congelada desde 17/11/2026: nessas pastas, só correção de bug ou mudança de lugar sem mudança de comportamento.

### 3.4 Vermelho na base: o teste prova o defeito? (PM-111)

O job `red-on-base` do CI (só em PR) roda `scripts/red-on-base.mjs`: monta o código da base do PR num diretório temporário, põe por cima a pasta `tests/` do PR e os `relay/test_*.py` alterados, e roda só os testes novos ou alterados (`tests/*.test.js` e `relay/test_*.py`).

- **PR `fix:`** (título em Conventional Commits): ao menos um desses testes precisa falhar **por asserção** na base (`AssertionError` no Node, `failures` no `unittest`). Se nenhum falha assim, o teste não prova o defeito que o PR diz corrigir, e o job reprova. PR `fix:` sem teste novo ou alterado também reprova.
- **Falha por import, sintaxe, tipo ou função que não existe na base é inconclusiva** e não conta: o teste pode estar só chamando código novo, sem conferir o defeito.
- **Qualquer outro PR** (`feat:`, `docs:`, `refactor:`…): o resultado só aparece no resumo do job.
- **Rótulo `red-on-base:skip`:** para PR `fix:` sem defeito de código para provar (CI, documentação, configuração). O resumo registra que foi pulado.

Rodar localmente: `node scripts/red-on-base.mjs origin/develop` com `PR_TITLE="fix: …"`. Os testes do próprio script (`tests/red-on-base.test.js`) usam um repositório git de mentira com um PR que prova o defeito e outro que só chama função nova.

## 4. O que o CI checa (`.github/workflows/ci.yml`)

| Job | O que faz | Bloqueia merge? |
|---|---|---|
| `test-client` (Node 22, 24) | `npm audit --audit-level=high` (LAN-20) · `node --check` em todo `client/js` e no `sw.js` · `npm run audit:complexity` (grava `docs/metrics/baseline-*.json` como artefato) · `npm run audit:docs` e `npm run audit:layers` (catracas) · `npm run lint` (ESLint em `client/js`, `sw.js` e `workers/`; **não** cobre `tests/`) · `npm run test:client` (Node 22) ou `npm run coverage:js` (Node 24, com catraca de cobertura, §3.2) | Sim |
| `test-relay` (Python 3.11, 3.12, 3.15) | `py_compile` · `npm run test:relay` (3.11 e 3.15) ou `npm run coverage:py` (3.12, com catraca, §3.2) · `lint:relay` (ruff: pyflakes e complexidade acima de 15) · ruff de estilo e tamanho de função | Sim, exceto o ruff de estilo (só informa) |
| `e2e-mesh` (PM-99) | Dois Chromium sem tela (`playwright-core` instalado sem `package.json`) trocam um post assinado por WebSocket e por Nostr (`scripts/mesh-e2e.mjs`); limite de 10 min | Sim |
| `red-on-base` (só PR, PM-111) | Roda os testes novos ou alterados contra o código da base (§3.4); resultado no resumo do job | Sim em PR `fix:` (salvo rótulo `red-on-base:skip`); nos outros só informa |
| `security-audit` | Grep por chaves privadas (`BEGIN … PRIVATE KEY`) | Sim |
| `pilot-freeze` (só PR) | Com `PILOT_FREEZE=1` ou `.github/pilot-freeze.flag`, falha PRs que tocam `client/js/**`, salvo label `pilot-hotfix` | Sim, quando ativo |
| `codeql.yml` (PR e push em `main`/`develop`, e semanal) | Análise estática do GitHub CodeQL | Conforme o ruleset do repositório |
| `vox-populi-windows-smoke.yml` | PyInstaller + smoke do Vox Populi no Windows | Sim |
| `nostr-smoke.yml` (semanal) | Publica e lê um evento efêmero em cada relay Nostr do pool (REV-19) | Não (agenda) |
| `deps-mensal.yml` (dia 1 de cada mês, 09:00 UTC; também manual) | `npm audit` · teste de inventário · hash de CDN contra [DEPENDENCIAS.md](./DEPENDENCIAS.md) (`scripts/deps-check-cdn.mjs`) · `npm outdated` no resumo (LAN-20); falha agendada abre issue `alerta-automatico` (PM-61). **Ainda sem execução registrada:** `gh run list --workflow deps-mensal.yml` não devolve nenhuma em 17/11, então o fluxo não foi observado de ponta a ponta | Não (agenda) |
| `sentinel-keepalive.yml` (a cada 14 min; também manual) | `curl` em `/health` de cada nó sentinela (segredos `SENTINEL_NODE_1…3`; sem segredo, usa `vox-sentinel.onrender.com`); falha gera alerta | Não (agenda) |
| `deploy-pages.yml` (push em `main` que toque `client/**`, `docs/**` ou o script de OAuth; também manual) | Monta `_site` com `client/*` e publica no GitHub Pages | Não (deploy) |
| `deploy-shell-b.yml` (mesmo gatilho do Pages; manual exige digitar `DEPLOY`) | Publica `client/` no Cloudflare Pages (shell B); sem os segredos `CLOUDFLARE_*` só avisa e não publica | Não (deploy) |
| `deploy-relay-hf.yml` (push em `main` que toque `relay/**`; também manual) | Sincroniza `relay/` no Space do Hugging Face; sem `HF_TOKEN`/`HF_SPACE` só avisa e não publica | Não (deploy) |
| `release-binarios.yml` (PR que toque `android/**` ou `packaging/*-windows*/**`; tag `v*`; manual) | No Windows: PyInstaller (`VoxPopuli.exe`), `Vox.exe` (csc + WebView2) e APKs, com `SHA256SUMS` e atestado (atestado e Release num job `publicar` separado, com `contents: write`, que não roda em PR); roda nos PRs como build de prova | Não listado no `ci.yml`; **a confirmar** se o ruleset o exige |

## 5. Complexidade

`npm run audit:complexity` (ESLint, `scripts/complexity-audit.mjs`) aplica os limites de [HARDENING.md](./HARDENING.md) e escreve um baseline datado em `docs/metrics/`. Meta: **zero violações** ([ADR-007](./adr/007-zero-complexity-monolith-decomposition.md)). `mock.js` fica de fora.

## 6. Release line

`npm run release-line` roda a suíte inteira, conta os testes e grava `docs/release-metadata.json` (SHA, contagens, `CACHE_NAME`), além da tabela e do badge no README. Rode ao fechar um lote, nunca à mão.
