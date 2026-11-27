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

Rodada semanal: `.github/workflows/mutation-weekly.yml` (domingo 04:30 UTC, ou `workflow_dispatch`) roda `npm run audit:mutate:tier-a -- --base <árvore vazia do git>`, isto é, o Tier A inteiro e não só o diff do PR. O score e os sobreviventes saem no resumo do job; é informativo, sem piso e fora dos checks obrigatórios.

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

### 4.1 Quais E2E rodam onde (PM-117)

Hoje **só `scripts/mesh-e2e.mjs` roda em PR**; os E2E Python (`npm run test:e2e`) rodam na agenda diária (`nightly-audit.yml`), então um defeito achado por eles só aparece no dia seguinte. Os de apoio e os manuais não rodam em workflow nenhum. A tabela sai de `npm run audit:e2e` e um teste a confere com os workflows: se um E2E mudar de lugar ou aparecer, a tabela precisa mudar junto. O gatilho é o do workflow que chama o E2E; `if:` de job não é lido.

| Arquivo | Onde roda |
|---|---|
| `e2e/capture_dungeon_ui.py` | manual (nenhum workflow) |
| `e2e/test_diorama_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_fairplay_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_ficha_assistente_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_hud_painel_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_mesa_rede_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_mesa_sync_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_mesa_ttrpg_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/test_vox_e2e.py` | nightly (nightly-audit.yml) |
| `e2e/verify_mesa_guide_refs.py` | manual (nenhum workflow) |
| `scripts/login-e2e.mjs` | manual (nenhum workflow) |
| `scripts/mesh-e2e.mjs` | PR (ci.yml) |
| `scripts/offline-e2e.mjs` | manual (nenhum workflow) |

**Estado em 27/11 (texto à mão, fora da tabela gerada; envelhece):** `test_fairplay_e2e.py` (`test_01` e `test_02b`, 2 de 6) e `test_mesa_rede_e2e.py` (`test_02`, 1 de 2) falham em `develop` porque o seletor `.dungeon-fairplay-seal.is-verified` não aparece em 90 s. Erro observado: o tempo esgota no seletor. Causa confirmada no [PR #698](https://github.com/yurikayel/vox/pull/698): o auxiliar do E2E montava o registro da rolagem à mão, sem os campos que a comparação do selo passou a olhar desde o #644; o app estava certo e o defeito era do teste. O terceiro vermelho é `test_vox_e2e.py` (`test_03`, 1 de 6): o botão `failover` passou a ficar atrás da flag `vox.lab.mesa-rede` desde o [#679](https://github.com/yurikayel/vox/pull/679) e o E2E clica sem a flag (detalhe na §4.2). Os três vermelhos são determinísticos (3 de 3), não flake. Cada falha vermelha leva até 90 s (`VOX_E2E_WAIT_MS=90000`), o que pesa no limite de 20 min da agenda.

**Próximos passos do PM-117:** (1) corrigir os três vermelhos, cada um com um `node:test` que falhe na base; (2) um job de PR com os E2E Python que passam, estáveis (uns 2,7 min, mais Playwright e Chromium); (3) só depois incluir fairplay e mesa em rede nesse job. Até lá, a nightly é o único gate dos E2E Python.

### 4.2 O que cada E2E cobre, quanto leva e em que estado está (PM-117)

Medido em 27/11/2026, na máquina do mantenedor (Windows, Python 3.12 com Playwright, Chromium 151), no commit `dee5df21`. Tempo = mediana de 3 execuções em série, em segundos de parede, com o comando da coluna. Cada módulo Python roda com `python -m unittest e2e.<módulo> -v`. Tabela escrita à mão; `tests/e2e-inventory.test.js` confere que ela lista os mesmos arquivos da §4.1. Os números envelhecem: remeça ao mudar o teste.

| Arquivo | Cobre | Tempo (mediana de 3) | Estado |
| --- | --- | --- | --- |
| `e2e/capture_dungeon_ui.py` | captura de telas da Dungeon | NOT RUN: não é teste, só gera imagens | n/a |
| `e2e/test_diorama_e2e.py` | diorama: o mestre vê e clica tudo, o jogador não clica fora da área revelada, gestos, o estado não carrega nada dentro da névoa (5 testes) | 60,5 s (`python -m unittest e2e.test_diorama_e2e -v`) | estável (3 de 3 verdes) |
| `e2e/test_fairplay_e2e.py` | selo verificado em três abas, valor errado não verifica, flag desligada não cria ops, mestre aprova e recusa entrada, aba fechada antes do commit (6 testes) | 124,4 s (`python -m unittest e2e.test_fairplay_e2e -v`) | vermelho determinístico (3 de 3, não é flake): `test_01` e `test_02b`; causa no [#698](https://github.com/yurikayel/vox/pull/698) (aberto) |
| `e2e/test_ficha_assistente_e2e.py` | F5 no meio do modo guiado descarta o rascunho; modo rápido cria ficha só com o nome (2 testes) | 10,6 s (`python -m unittest e2e.test_ficha_assistente_e2e -v`) | estável (3 de 3 verdes) |
| `e2e/test_hud_painel_e2e.py` | painel alto em 1280×840 e em 390×844 (2 testes) | 8,0 s (`python -m unittest e2e.test_hud_painel_e2e -v`) | estável (3 de 3 verdes) |
| `e2e/test_mesa_rede_e2e.py` | dois contextos conectam e o token chega ao jogador por RTC; rolagem verificada pela rede (2 testes) | 48,5 s (`python -m unittest e2e.test_mesa_rede_e2e -v`) | vermelho determinístico (3 de 3, não é flake): `test_02`; causa no [#698](https://github.com/yurikayel/vox/pull/698) (aberto) |
| `e2e/test_mesa_sync_e2e.py` | criar campanha, entrar com snapshot, mover o próprio token, não mover o do mestre, camada do mestre nunca chega ao jogador, rolagem pública nas duas crônicas (6 testes) | 25,2 s (`python -m unittest e2e.test_mesa_sync_e2e -v`) | estável (3 de 3 verdes) |
| `e2e/test_mesa_ttrpg_e2e.py` | fluxos da Mesa TTRPG, testes 07 a 15 (10 testes) | 47,0 s (`python -m unittest e2e.test_mesa_ttrpg_e2e -v`; execuções de 34,1 a 53,3 s) | em observação: verde em 3 de 3, tempo varia ±20 s |
| `e2e/test_vox_e2e.py` | onboarding e recarga do IndexedDB, rotas cívicas e tema, telas de demonstração honestas, viewport móvel, malha WebRTC entre dois pares, assistentes e quadros abertos (6 testes) | 53,2 s (`python -m unittest e2e.test_vox_e2e -v`) | vermelho determinístico (3 de 3, não é flake): `test_03` (erro, não falha). Erro observado: o tempo esgota (30 s) esperando `button[data-dungeon='failover']`. Causa confirmada: o [#679](https://github.com/yurikayel/vox/pull/679) (`2fc50042`) pôs o botão atrás da flag `vox.lab.mesa-rede` (`client/js/dungeon/screen-camp.js`) e o E2E clica sem ligá-la; a nightly em `main` (`fdaf2e81`) passou 39 de 39. O conserto do E2E fica fora deste PR |
| `e2e/verify_mesa_guide_refs.py` | confere referências do guia da Mesa | NOT RUN: não é teste, é verificação de referências | n/a |
| `scripts/login-e2e.mjs` | LT-08: login de ponta a ponta | BLOCKED: `playwright` não está instalado para o Node nesta máquina (`node scripts/login-e2e.mjs` sai com código 1 em 0,1 s) | não medido |
| `scripts/mesh-e2e.mjs` | PM-113: smokes da malha, mais rodadas P2P por WebSocket e Nostr | BLOCKED: mesmo motivo (`node scripts/mesh-e2e.mjs`); a §4.1 diz que roda no PR (`ci.yml`) | não medido aqui |
| `scripts/offline-e2e.mjs` | S30: smoke do PWA offline | BLOCKED: mesmo motivo (`node scripts/offline-e2e.mjs`) | não medido |

## 5. Complexidade

`npm run audit:complexity` (ESLint, `scripts/complexity-audit.mjs`) aplica os limites de [HARDENING.md](./HARDENING.md) e escreve um baseline datado em `docs/metrics/`. Meta: **zero violações** ([ADR-007](./adr/007-zero-complexity-monolith-decomposition.md)). `mock.js` fica de fora.

## 6. Release line

`npm run release-line` roda a suíte inteira, conta os testes e grava `docs/release-metadata.json` (SHA, contagens, `CACHE_NAME`), além da tabela e do badge no README. Rode ao fechar um lote, nunca à mão.
