import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_FORMULA_LENGTH, MAX_TERMS, parseDiceCommand } from "../client/js/dungeon/dice-engine.js";
import { markdownToNote, markdownToSheet, parseSimpleYaml, sheetToMarkdown } from "../client/js/dungeon/obsidian-bridge.js";
import { decodeZipStore, encodeZipStore, unpackVoxRpg } from "../client/js/dungeon/vtt-portable.js";
import { projectStateForPlayer, reduceCampaign } from "../client/js/dungeon/vtt-reducer.js";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { createAndSelectCampaign, importCampaignFile } from "../client/js/dungeon/dungeon-persistence.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView, wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { appendPoolDeltaOp, projectCharacterPools } from "../client/js/rpg-sheet-and-lore.js";
import { sha256Hex } from "../client/js/rpg-crypto-table.js";
import { waitUntil } from "./helpers/wait-until.js";

function makeStore(snapshotInterval = 50) {
  return createVttStore(createMemoryVttBackend(), {
    snapshotInterval,
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 10000, usage: 100, percentage: 1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

test("adversarial E1: Obsidian YAML inline arrays, quoted *&, hp_atual ferido e tipo: ficha sem atributos", async () => {
  const parsed = parseSimpleYaml('nome: "A *Grande* Cripta & Taverna"\ntags: [pista, cripta, "ato-1"]');
  assert.equal(parsed.nome, "A *Grande* Cripta & Taverna");
  assert.deepEqual(parsed.tags, ["pista", "cripta", "ato-1"]);
  assert.throws(() => parseSimpleYaml("bad: !!js/function alert"), /não suportado/);
  assert.throws(() => parseSimpleYaml("ref: *alias"), /não suportado/);
  assert.throws(() => parseSimpleYaml("tags: [[nested]]"), /aninhada/);

  const base = createCampaign({ name: "Teste" });
  const wounded = appendPoolDeltaOp(base.sheetsById.lyra, { op_id: "dmg-1", lamport_clock: 1, target_pool: "hp_current", delta: -10, reason: "Lança" });
  const md = sheetToMarkdown(wounded);
  assert.match(md, /hp_atual: 14/);
  const reimported = markdownToSheet(md);
  assert.equal(projectCharacterPools(reimported.pools_base, reimported.delta_ledger).pools.hp_current, 14);

  const note = markdownToNote("---\ntags: [pista, sigilo]\n---\n# Chave\n\nTexto público.\n\n%%Segredo do mestre%%\n");
  assert.deepEqual(note.tags, ["pista", "sigilo"]);
  const store = makeStore();
  const state = createDungeonSessionState();
  await createAndSelectCampaign(state, "Mesa Minimal", { store });
  const res = await importCampaignFile(state, { name: "npc.md", bytes: "---\ntipo: npc\nnome: Guarda\n---\n# Guarda\n" }, { store });
  assert.equal(res.kind, "sheet-md");
  assert.equal(state.sheet.name, "Guarda");
});

test("adversarial E1: Zero-Spoiler fail-closed no redutor e zero vazamento de %%segredos%% na Ficha vs Escudo", async () => {
  let camp = createCampaign({ id: "camp-sec", name: "Segredos" });
  camp = reduceCampaign(camp, createVttOp({ opId: "o1", type: "NOTE_UPSERT", lamport: 1, payload: { note: { id: "n1", title: "Altar", publicMarkdown: "Runas frias.", gmSecretMarkdown: "SEGREDO_MESTRE_XYZ", tags: ["pista"] } } }));
  camp = reduceCampaign(camp, createVttOp({ opId: "o2", type: "ROLL_RECORDED", lamport: 2, actor: "gm", payload: { speaker: "GM", rollResult: { formula: "1d20", total: 19, visibility: "gm", rolls: [{ sides: 20, value: 19, kept: true }] } } }));

  for (const badRole of [undefined, null, "", "player", "spectator", "admin"]) {
    const projected = projectStateForPlayer(camp, badRole, "jogador-1");
    assert.equal(projected.notesById.n1.gmSecretMarkdown, "");
    assert.equal(projected.rolls.length, 0);
  }
  assert.equal(projectStateForPlayer(camp, "gm").notesById.n1.gmSecretMarkdown, "SEGREDO_MESTRE_XYZ");

  const store = makeStore();
  const state = createDungeonSessionState();
  await createAndSelectCampaign(state, "Mesa Segredos", { store });
  await importCampaignFile(state, { name: "pista.md", bytes: "---\ntags: [pista]\n---\n# Pista\n\nTexto visível com [[Altar]].\n\n%%SEGREDO_MESTRE_XYZ%%\n" }, { store });
  const sheetHtml = renderDungeonView({ screen: "ficha", state });
  const dmHtml = renderDungeonView({ screen: "mestre", state });
  assert.ok(sheetHtml.includes("Texto visível"));
  assert.ok(!sheetHtml.includes("SEGREDO_MESTRE_XYZ"), "ficha pública jamais pode exibir segredo GM");
  assert.ok(dmHtml.includes("SEGREDO_MESTRE_XYZ"), "escudo local do mestre deve mostrar segredo GM");
});

test("adversarial E1: ZIP rejeita omissão de campaign.json, arquivo contrabandeado, duplicata e cdOffset fora da faixa", async () => {
  const enc = new TextEncoder();
  const campJson = enc.encode(JSON.stringify(createCampaign({ id: "z1", name: "Z" })));
  const campHash = await sha256Hex(campJson);

  const omittedManifest = encodeZipStore([
    { name: "manifest.json", data: enc.encode(JSON.stringify({ format: "voxrpg-zip-v1", files: {} })) },
    { name: "campaign.json", data: campJson },
  ]);
  await assert.rejects(() => unpackVoxRpg(omittedManifest), /não declara o hash de campaign\.json/);

  const smuggled = encodeZipStore([
    { name: "manifest.json", data: enc.encode(JSON.stringify({ format: "voxrpg-zip-v1", files: { "campaign.json": campHash } })) },
    { name: "campaign.json", data: campJson },
    { name: "notas/extra.md", data: enc.encode("contrabando") },
  ]);
  await assert.rejects(() => unpackVoxRpg(smuggled), /não declarado no manifesto/);

  const duplicated = encodeZipStore([
    { name: "a.txt", data: enc.encode("1") },
    { name: "a.txt", data: enc.encode("2") },
  ]);
  assert.throws(() => decodeZipStore(duplicated), /Entrada duplicada/);

  const corruptCd = encodeZipStore([{ name: "a.txt", data: enc.encode("ok") }]);
  new DataView(corruptCd.buffer).setUint32(corruptCd.length - 6, 999999, true);
  assert.throws(() => decodeZipStore(corruptCd), /Offset do diretório central inválido/);

  assert.throws(() => parseDiceCommand("1d20+".repeat(40)), new RegExp(String(MAX_FORMULA_LENGTH)));
  assert.throws(() => parseDiceCommand(Array.from({ length: MAX_TERMS + 2 }, () => "1").join("+")), new RegExp(String(MAX_TERMS)));
});

test("adversarial E1: fila de escrita elimina perda em appendOp concorrente + persistência de turnos, PV, ações e exclusão", async () => {
  const store = makeStore(3);
  await store.saveCampaign(createCampaign({ id: "race-1", name: "Corrida" }));
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.appendOp("race-1", createVttOp({ opId: `op-${i}`, type: "CHRONICLE_APPEND", lamport: i + 1, payload: { text: `T${i}` } })),
    ),
  );
  const loaded = await store.loadCampaign("race-1");
  assert.equal(loaded.chronicle.length, 10);

  const state = createDungeonSessionState();
  const listeners = {};
  const inputs = {
    "#dungeon-action-input": { value: "Examinar a fenda e beber poção", focus: () => {} },
    "#dungeon-action-label": { value: "Arco Longo" },
    "#dungeon-action-formula": { value: "1d20+@des+@prof" },
    "#dungeon-action-damage": { value: "1d8+@des" },
  };
  const host = { dataset: {}, innerHTML: "", addEventListener: (t, fn) => { listeners[t] = fn; }, querySelector: (s) => inputs[s] || null };
  wireDungeonView(host, { screen: "mesa", state, store });
  await waitUntil(() => state.persistenceReady);
  await listeners.submit({ target: { dataset: { dungeon: "action-form" }, querySelector: (s) => inputs[s] }, preventDefault: () => {} });
  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "roll-d20" } }) } });
  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "hp-minus" } }) } });
  await listeners.submit({ target: { dataset: { dungeon: "add-action-form" }, querySelector: (s) => inputs[s] }, preventDefault: () => {} });

  const reloaded = await store.loadCampaign("race-1");
  assert.ok(reloaded.chronicle.some((e) => e.text.includes("Examinar a fenda")));
  assert.ok(reloaded.rolls.length >= 1);
  assert.ok(reloaded.sheetsById.lyra.sheet_meta.clickable_actions.some((a) => a.label === "Arco Longo"));

  listeners.click({ target: { closest: () => ({ dataset: { dungeon: "arm-delete-campaign", campaignId: "race-1" } }) } });
  assert.equal(state.pendingDeleteId, "race-1");
  await listeners.click({ target: { closest: () => ({ dataset: { dungeon: "confirm-delete-campaign", campaignId: "race-1" } }) } });
  assert.equal(await store.loadCampaign("race-1"), null);
});
