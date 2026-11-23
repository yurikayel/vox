import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultScene } from "../client/js/dungeon/vtt-scene-schema.js";
import { createFogState } from "../client/js/dungeon/vtt-tactics-schema.js";
import { renderInitiativePanel, renderTacticalToolbar } from "../client/js/dungeon/screen-table-tactics.js";

function minimalMesaState(overrides = {}) {
  const scene = createDefaultScene();
  return {
    activeTool: "select",
    initiative: { active: false, round: 1, turnIndex: 0, entries: [] },
    selectedTokenId: "",
    viewerRole: "gm",
    scene,
    ...overrides,
  };
}

test("screen-table-tactics: renderTacticalToolbar landmarks GM vs jogador", () => {
  const scene = createDefaultScene();
  scene.activeFloorZ = 0;
  const floor = { ...scene.floors[0], fog: createFogState({ enabled: true }) };
  const gmHtml = renderTacticalToolbar({ activeTool: "aoe-cone" }, scene, floor, true);
  assert.ok(gmHtml.includes('aria-label="Ferramentas do mapa"'));
  assert.ok(gmHtml.includes('data-dungeon="select-tool"') && gmHtml.includes('aria-pressed="true"'));
  assert.ok(gmHtml.includes('data-dungeon="toggle-fog"') && gmHtml.includes("Névoa: ON"));
  assert.ok(gmHtml.includes('aria-label="Andares da cena"') && gmHtml.includes('data-dungeon="add-floor"'));

  const plHtml = renderTacticalToolbar({ activeTool: "select" }, scene, floor, false);
  assert.ok(plHtml.includes('aria-label="Ferramentas do mapa"'));
  assert.ok(!plHtml.includes('data-dungeon="toggle-fog"'));
  assert.ok(!plHtml.includes('data-dungeon="fog-reveal"'));
  assert.ok(!plHtml.includes('data-dungeon="add-floor"'));
});

test("screen-table-tactics: renderInitiativePanel landmarks, turno e Zero-Spoiler", () => {
  const scene = createDefaultScene();
  scene.sceneId = "sc-cripta";
  const state = minimalMesaState({
    initiative: {
      active: true,
      round: 4,
      turnIndex: 0,
      entries: [
        { id: "i-pl", tokenId: "tok-lyra", name: "Lyra", roll: 16, hidden: false },
        { id: "i-gm", tokenId: "tok-sentinela", name: "Sentinela", roll: 18, hidden: false },
      ],
    },
    selectedTokenId: "tok-lyra",
  });

  const gmPanel = renderInitiativePanel(state, scene, true);
  assert.ok(gmPanel.includes('aria-label="Rastreador de Iniciativa"'));
  assert.ok(gmPanel.includes("Rodada 4") && gmPanel.includes("◀ TURNO"));
  assert.ok(gmPanel.includes('data-dungeon="next-turn"'));
  assert.ok(gmPanel.includes('data-dungeon="toggle-condition"'));

  const plPanel = renderInitiativePanel(state, scene, false);
  assert.ok(plPanel.includes('aria-label="Rastreador de Iniciativa"'));
  assert.ok(plPanel.includes("Lyra"));
  assert.ok(!plPanel.includes("Sentinela"));
  assert.ok(!plPanel.includes('data-dungeon="next-turn"'));
  assert.ok(!plPanel.includes('data-dungeon="toggle-condition"'));
});