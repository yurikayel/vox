import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCampaign, createVttOp } from "../client/js/dungeon/vtt-schema.js";
import { createIdbVttBackend, createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import {
  bootstrapDungeonPersistence,
  createAndSelectCampaign,
  exportCampaignBackup,
  importCampaignFile,
  openSavedCampaign,
  persistSheetDeltaIfActive,
  recordFormulaRoll,
  recordSheetActionRoll,
} from "../client/js/dungeon/dungeon-persistence.js";
import { recordAbilityRoll } from "../client/js/dungeon/dungeon-sheet-rolls.js";
import { uploadSceneMapBlob } from "../client/js/dungeon/dungeon-scene-actions.js";
import { projectCharacterPools } from "../client/js/rpg-sheet-and-lore.js";

function makeDeterministicRng(seedValues) {
  let idx = 0;
  return () => {
    const val = seedValues[idx % seedValues.length];
    idx += 1;
    const out = new Uint8Array(32);
    out[0] = (val >>> 24) & 0xff;
    out[1] = (val >>> 16) & 0xff;
    out[2] = (val >>> 8) & 0xff;
    out[3] = val & 0xff;
    return out;
  };
}

test("vtt-store: persistência de campanha, requestPersistence na 1ª campanha, compactação e deduplicação de blobs", async () => {
  const backend = createMemoryVttBackend();
  let persistCalls = 0;
  const store = createVttStore(backend, {
    snapshotInterval: 3,
    requestPersistenceFn: async () => {
      persistCalls += 1;
      return { persisted: true, isSupported: true };
    },
    estimateStorageFn: async () => ({ quota: 1000, usage: 250, percentage: 25, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const c1 = createCampaign({ id: "camp-1", name: "Cripta de Ferro" });
  const c2 = createCampaign({ id: "camp-2", name: "Porto das Névoas" });
  await store.saveCampaign(c1);
  await store.saveCampaign(c2);
  assert.equal(persistCalls, 1);
  assert.equal((await store.listCampaigns()).length, 2);

  const op1 = createVttOp({ opId: "op-1", type: "CHRONICLE_APPEND", lamport: 1, payload: { text: "Turno 1" } });
  const r1 = await store.appendOp("camp-1", op1);
  const rDup = await store.appendOp("camp-1", op1);
  assert.equal(r1.snapshotted, false);
  assert.equal(rDup.duplicate, true);
  await store.appendOp("camp-1", createVttOp({ opId: "op-2", type: "CHRONICLE_APPEND", lamport: 2, payload: { text: "Turno 2" } }));
  const r3 = await store.appendOp("camp-1", createVttOp({ opId: "op-3", type: "CHRONICLE_APPEND", lamport: 3, payload: { text: "Turno 3" } }));
  assert.equal(r3.snapshotted, true);
  assert.equal((await backend.getOpsByCampaign("camp-1")).length, 0);
  const reloaded = await store.loadCampaign("camp-1");
  assert.equal(reloaded.chronicle.length, 3);

  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const b1 = await store.putBlob(bytes, "image/png");
  const b2 = await store.putBlob(bytes, "image/png");
  assert.equal(b1.deduplicated, false);
  assert.equal(b2.deduplicated, true);
  assert.deepEqual(await store.getBlob(b1.sha256), bytes);
  assert.equal((await store.getAllBlobsMap()).size, 1);

  const usage = await store.estimateUsage();
  assert.equal(usage.persisted, true);
  assert.equal(usage.percentage, 25);

  await store.deleteCampaign("camp-2");
  assert.equal(await store.loadCampaign("camp-2"), null);
  assert.throws(() => createIdbVttBackend(null), /IndexedDB indisponível/);
});

test("dungeon-persistence: ciclo completo criar campanha -> rolar ficha -> delta CRDT -> recarregar sessão", async () => {
  const store = createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 2048, usage: 128, percentage: 6.25, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const state = { chronicle: [], rolls: [], sheet: null, rollMode: "normal" };
  await createAndSelectCampaign(state, "Crônicas da Vila", { store });
  const rng = makeDeterministicRng([15, 18, 4]);
  const fRoll = await recordFormulaRoll(state, "/gmroll 1d20+@for # Iniciativa", { store, randomBytesFn: rng });
  assert.equal(fRoll.ok, true);
  assert.equal(fRoll.visibility, "gm");
  const abRoll = await recordAbilityRoll(state, "str", { store, randomBytesFn: rng });
  assert.equal(abRoll.ok, true);
  const actRoll = await recordSheetActionRoll(state, "act-ataque", { store, mode: "advantage", randomBytesFn: rng });
  assert.equal(actRoll.ok, true);
  assert.equal(Boolean(actRoll.damage?.ok), true);
  await persistSheetDeltaIfActive(state, "coins", -10, "Poção de vigília", store);

  const freshSession = { chronicle: [], rolls: [], sheet: null };
  await bootstrapDungeonPersistence(freshSession, store);
  assert.equal(freshSession.tableName, "Crônicas da Vila");
  assert.equal(freshSession.rolls.length, 4);
  const pools = projectCharacterPools(freshSession.sheet.pools_base, freshSession.sheet.delta_ledger).pools;
  assert.equal(pools.currency_gp, 40);
  const missing = await openSavedCampaign(freshSession, "nao-existe", store);
  assert.equal(missing, null);
});

test("dungeon-persistence: export/import .voxrpg.zip, .voxrpg.enc (Senha Soberana) e notas/fichas .md Obsidian", async () => {
  const srcStore = createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 1000, usage: 10, percentage: 1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const stateA = { chronicle: [], rolls: [] };
  await createAndSelectCampaign(stateA, "Santuário Portátil", { store: srcStore });
  await uploadSceneMapBlob(stateA, { bytes: new Uint8Array([9, 8, 7]), mime: "image/png" }, { store: srcStore });
  await recordFormulaRoll(stateA, "2d6+3 # Fogo", { store: srcStore });

  const zipArt = await exportCampaignBackup(stateA, { format: "zip", store: srcStore });
  const encArt = await exportCampaignBackup(stateA, { format: "enc", passphrase: "senha-soberana-super-segura", store: srcStore });
  const mdArt = await exportCampaignBackup(stateA, { format: "md", store: srcStore });
  assert.match(zipArt.filename, /\.voxrpg\.zip$/);
  assert.match(encArt.filename, /\.voxrpg\.enc$/);
  assert.match(mdArt.filename, /-cronica\.md$/);

  const dstStore = createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 1000, usage: 10, percentage: 1, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const stateB = { chronicle: [], rolls: [] };
  const impZip = await importCampaignFile(stateB, zipArt, { store: dstStore });
  assert.equal(impZip.kind, "voxrpg-zip");
  assert.equal(stateB.tableName, "Santuário Portátil");
  assert.equal((await dstStore.getAllBlobsMap()).size, 1);

  const stateC = { chronicle: [], rolls: [] };
  const impEnc = await importCampaignFile(stateC, encArt, { passphrase: "senha-soberana-super-segura", store: dstStore });
  assert.equal(impEnc.kind, "voxrpg-enc");
  assert.equal(stateC.rolls.length, 1);

  const sheetMd = "---\nvox_tipo: ficha\nnome: Kaelen\nclasse: Bardo\natributos:\n  for: 10\n  des: 16\n  con: 12\n  int: 14\n  sab: 12\n  car: 18\n---\n# Kaelen\n\nToca alaúde.\n\n%%Espião da guilda%%\n";
  const impSheet = await importCampaignFile(stateC, { name: "kaelen.md", bytes: sheetMd }, { store: dstStore });
  assert.equal(impSheet.kind, "sheet-md");
  assert.equal(stateC.sheet.name, "Kaelen");
  assert.equal(stateC.sheet.sheet_meta.notes_gm, "Espião da guilda");

  const noteMd = "---\ntags: [pista]\n---\n# Chave da Torre\n\nEncontrada com [[Kaelen]].\n\n%%Abre o porão%%\n";
  const impNote = await importCampaignFile(stateC, { name: "chave.md", bytes: noteMd }, { store: dstStore });
  assert.equal(impNote.kind, "note-md");
  assert.equal(stateC.notes.length, 1);
  assert.equal(stateC.notes[0].gmSecretMarkdown, "Abre o porão");
});
