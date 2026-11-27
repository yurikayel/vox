# Inventário dos E2E Python (PM-117)

> **Status:** canônico (primeiro passo do [PM-117](../ROADMAP.md)) · **Medido em:** 2026-11-27, `develop` em `4b34f321`, Windows, Python 3.12, Chromium do Playwright · **Teste que guarda esta lista:** `tests/e2e-inventario.test.js`
> Contexto: o [HARDENING](../HARDENING.md#ci) registra o E2E Python como dívida (fora do `ci.yml`). Aqui está o que existe, onde roda hoje e em que estado está.

## Onde cada um roda hoje

- **Em PR (`ci.yml`): nenhum.** O job `e2e-mesh` roda `node scripts/mesh-e2e.mjs` (dois Chromium trocando post assinado), que não é Python e fica fora desta lista.
- **Toda noite (`nightly-audit.yml`, job `E2E full nightly`):** `npm run test:e2e`, que roda `python -m unittest discover -s e2e -p "test_*.py"`. Cobre todos os `test_*.py` abaixo, com `VOX_E2E_WAIT_MS=90000` e limite de 20 minutos. O nightly não bloqueia PR; só avisa.
- **Manual:** os dois scripts que não são teste (`capture_dungeon_ui.py` e `verify_mesa_guide_refs.py`) servem ao guia de capturas da Mesa e não rodam em CI.

## Arquivos

Colunas **PR** e **Noite** dizem se o arquivo roda no `ci.yml` e no nightly. O tempo é de uma execução local de cada arquivo, sozinho.

| Arquivo | Cobre | Testes | Tempo | Estado em 27/11 | PR | Noite |
|---|---|---|---|---|---|---|
| `e2e/test_vox_e2e.py` | Entrada, rotas, assistentes e malha de dois navegadores (rede de fora bloqueada) | 6 | 46 s | PASS | não | sim |
| `e2e/test_ficha_assistente_e2e.py` | F5 no meio do assistente de ficha não deixa rascunho nem ficha parcial | 2 | 9 s | PASS | não | sim |
| `e2e/test_hud_painel_e2e.py` | Painéis em meia tela do HUD com conteúdo alto, em 1280×840 e 390×844 | 2 | 7 s | PASS | não | sim |
| `e2e/test_mesa_ttrpg_e2e.py` | Mesa: mapa, dados e campanha (`#/dungeon`) | 10 | 34 s | PASS | não | sim |
| `e2e/test_mesa_sync_e2e.py` | Sincronização Mestre↔jogador e Zero-Spoiler (duas abas) | 6 (1 pulado) | 27 s | PASS | não | sim |
| `e2e/test_diorama_e2e.py` | Lente Diorama (flag de laboratório), Mestre e jogador com névoa; sem WebGL2 o 3D fica NOT RUN | 5 | 39 s | PASS | não | sim |
| `e2e/test_mesa_rede_e2e.py` | Mesa entre dois contextos, só pelo transporte de rede (sinalização local e `RTCDataChannel`) | 2 | 103 s | FAIL (1) | não | sim |
| `e2e/test_fairplay_e2e.py` | Rolagem Fairplay: selo "Verificada" igual em três abas | 6 | 244 s | FAIL (2 de 6) | não | sim |
| `e2e/capture_dungeon_ui.py` | Captura de telas `#/dungeon` para o guia de design (não é teste) | n/a | n/a | n/a | não | não |
| `e2e/verify_mesa_guide_refs.py` | Confere os PNG citados no guia de capturas (não é teste) | n/a | n/a | n/a | não | não |

Soma dos oito arquivos de teste: 39 testes, cerca de 8,5 minutos (2,7 min nos seis que passam e 5,8 min nos dois que falham, que esperam 90 s por falha).

## O que falhou

- **Erro observado:** em `test_fairplay_e2e.py` (`test_01`, `test_02b`) e `test_mesa_rede_e2e.py` (`test_02`), o seletor `.dungeon-fairplay-seal.is-verified` não aparece em 90 s (`element(s) not found`); o resto da tela monta normalmente.
- **Causa confirmada:** nenhuma ainda.
- **Causa provável:** o selo passou a conferir autor, fórmula e número exibido (`#644`) e a Crônica passou a ter regras de dono e visibilidade; o roteiro dos testes abre a rolagem por `fairplayDriver.openRoll` e `syncPeer.dispatchOp`, com dados que podem não conferir mais. Sem E2E no PR, a divergência passou sem aviso.
- Corrigir isso é item à parte: pelo [PM-111](../ROADMAP.md), conserto de E2E exige um teste `node:test` que falhe na base.

## Próximo passo do PM-117

1. Corrigir os dois arquivos vermelhos (cada correção com teste `node:test` que falhe na base).
2. Criar um job de PR com os seis que passam (cerca de 2,7 minutos) e `pip install playwright` + Chromium (o job `e2e-mesh` já instala o Chromium); só depois mover Fairplay e Mesa em rede.
3. Ao mover um arquivo para o PR, atualizar a coluna **PR** desta tabela no mesmo PR: o teste que guarda a lista confere as colunas com o `ci.yml` e com o nightly.
