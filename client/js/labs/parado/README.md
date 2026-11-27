# `labs/parado/` — módulos escritos e não plugados

Dos módulos desta pasta, 18 têm testes, mas **nenhuma tela os carrega**. Ficam fora do precache do Service Worker
(`UNPLUGGED_MODULES` em `client/sw.js`); o teste `tests/shell-reachability.test.js` (PM-04) reprova quem os puser de volta.
O `kit-genesis` (3 arquivos) já está plugado: `app/compose-community-kit.js` o carrega sob demanda. A decisão módulo a
módulo está em [triagem-labs-parado-rev02.md](../../../../docs/strategy/triagem-labs-parado-rev02.md).

Estão em `labs/` desde 17/11/2026 ([ADR-035](../../../../docs/adr/035-camadas-e-contextos.md)): pela regra de camadas, só
`app` e o próprio laboratório podem importá-los, então nada do app passa a depender deles sem uma decisão.

**Plugar um módulo** = tirá-lo daqui (para a pasta do assunto), tirá-lo de `UNPLUGGED_MODULES` e ligá-lo numa tela,
num PR próprio. Vários são a base de features candidatas do
[brainstorm de autossustento](../../../../docs/brainstorms/brainstorm-autossustento-10-features-2026-11.md); a lista
com o que cada um faz está em [FEATURES.md](../../../../docs/FEATURES.md).

| Grupo | Módulos |
|---|---|
| Malha e transferência | `airgap-webrtc`, `chunked-transfer`, `seeder-guardian`, `settings-guardian` |
| Saúde do nó | `node-health-api`, `node-health-evaluator`, `node-health-model`, `node-health-state`, `node-health-ux`, `node-health-badge` |
| Confiança e identidade | `civic-credential`, `identity-link`, `testimonials` |
| Debate | `polis`, `bridging-rank` |
| Organização | `kit-genesis` |
| Mini-apps (webxdc) | `webxdc-crdt`, `webxdc-host`, `webxdc-loader` |
