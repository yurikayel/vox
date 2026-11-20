import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createNoteDoc } from "../client/js/dungeon/vtt-schema.js";
import { projectStateForPlayer } from "../client/js/dungeon/vtt-reducer.js";
import { noteToMarkdown } from "../client/js/dungeon/obsidian-bridge.js";
import { buildLevelUpPlan } from "../client/js/dungeon/vtt-levelup.js";
import { createCharacterSheetDoc } from "../client/js/rpg-sheet-and-lore.js";

test("E4: nota gm_only não aparece na projeção do jogador", () => {
  const camp = createCampaign({
    notesById: {
      segredo: createNoteDoc({ id: "segredo", visibility: "gm_only", publicMarkdown: "público", gmSecretMarkdown: "só gm" }),
    },
  });
  const view = projectStateForPlayer(camp, "player", "vx_p1");
  assert.equal(view.notesById.segredo, undefined);
});

test("E4: handout md não inclui bloco %% de nota exportada sem segredos", () => {
  const note = createNoteDoc({ title: "Pista", publicMarkdown: "texto", gmSecretMarkdown: "oculto" });
  const md = noteToMarkdown(note, { includeGmSecrets: false });
  assert.ok(!md.includes("%%"));
  assert.ok(!md.includes("oculto"));
});

test("E4: level-up falha ao tentar descer nível", () => {
  const sheet = createCharacterSheetDoc({});
  sheet.attributes_lww.level = 5;
  const plan = buildLevelUpPlan(sheet, 4, "libre");
  assert.equal(plan.ok, false);
});