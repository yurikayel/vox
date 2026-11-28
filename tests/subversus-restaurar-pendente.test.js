/**
 * @file SUB-31: a restauração recusada fica pendente só enquanto vale. Confirmar reconfere o aparelho (se a campanha
 * local avançou depois da recusa, recusa de novo), abrir ou excluir campanha e importar arquivo inválido descartam o
 * pacote pendente, e a recusa não grava blob nenhum (zip e cifrado).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { exportCampaignBackup, importCampaignFile } from "../client/js/dungeon/dungeon-persistence.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { packVoxRpg } from "../client/js/dungeon/vtt-portable.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const ID = "camp_pendente";
const SENHA = "senha-soberana-super-segura";

async function recusado(lamportBackup = 4, lamportLocal = 10) {
  const store = createVttStore(createMemoryVttBackend());
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: lamportLocal }));
  const zip = await packVoxRpg(createCampaign({ id: ID, name: "Backup", lamport: lamportBackup }));
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const res = await importCampaignFile(state, { name: `${ID}.voxrpg.zip`, bytes: zip }, { store });
  assert.equal(res.error, "local_mais_nova");
  assert.ok(state.pendingRestore, "ficou pendente");
  return { store, state };
}

const lamportSalvo = async (store) => (await store.loadCampaign(ID)).lamport;

test("o local avançou depois da recusa: confirmar recusa de novo e não grava o 4 por cima do 12", async () => {
  const { store, state } = await recusado(4, 10);
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: 12 }));
  const res = await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  assert.equal(res.ok, false);
  assert.equal(res.error, "local_mais_nova");
  assert.equal(await lamportSalvo(store), 12);
  assert.ok(state.pendingRestore, "segue pendente, agora com o 12 à vista");
});

test("depois da segunda recusa, confirmar com o local parado troca", async () => {
  const { store, state } = await recusado(4, 10);
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: 12 }));
  await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  const res = await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  assert.equal(res.ok, true);
  assert.equal(await lamportSalvo(store), 4);
  assert.equal(state.pendingRestore, null);
});

test("abrir outra campanha descarta a restauração pendente", async () => {
  const { store, state } = await recusado();
  await ACTION_HANDLERS["open-campaign"](state, { dataset: { campaignId: ID } }, null, { store });
  assert.equal(state.pendingRestore, null);
});

test("excluir campanha descarta a restauração pendente", async () => {
  const { store, state } = await recusado();
  await ACTION_HANDLERS["confirm-delete-campaign"](state, { dataset: { campaignId: ID } }, null, { store });
  assert.equal(state.pendingRestore, null);
});

test("importar arquivo inválido descarta a restauração pendente", async () => {
  const { store, state } = await recusado();
  await assert.rejects(importCampaignFile(state, { name: "lixo.voxrpg.zip", bytes: new Uint8Array([1, 2, 3, 4]) }, { store }));
  assert.equal(state.pendingRestore, null);
});

async function blobsDoBackup(bytes) {
  const tmp = createVttStore(createMemoryVttBackend());
  const { sha256 } = await tmp.putBlob(bytes, "image/png");
  return { sha256, blobs: new Map([[sha256, bytes]]) };
}

test("recusa de zip não grava os blobs do pacote", async () => {
  const store = createVttStore(createMemoryVttBackend());
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: 10 }));
  const { blobs } = await blobsDoBackup(new Uint8Array([9, 9, 9]));
  const zip = await packVoxRpg(createCampaign({ id: ID, name: "Backup", lamport: 4 }), blobs);
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const res = await importCampaignFile(state, { name: `${ID}.voxrpg.zip`, bytes: zip }, { store });
  assert.equal(res.error, "local_mais_nova");
  assert.equal((await store.getAllBlobsMap()).size, 0);
});

test("recusa de backup cifrado não grava os blobs do pacote", async () => {
  const origem = createVttStore(createMemoryVttBackend());
  const { sha256 } = await origem.putBlob(new Uint8Array([8, 8, 8]), "image/png");
  const doc = createCampaign({ id: ID, name: "Backup", lamport: 4 });
  doc.scenesById = { s: { floors: [{ mapBlobHash: sha256 }], tokens: [] } };
  await origem.saveCampaign(doc);
  const dono = createDungeonSessionState({ viewerRole: "gm", campaignId: ID, syncPeer: null });
  const enc = await exportCampaignBackup(dono, { format: "enc", passphrase: SENHA, store: origem });
  const store = createVttStore(createMemoryVttBackend());
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: 10 }));
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  const res = await importCampaignFile(state, { name: enc.filename, bytes: enc.bytes }, { store, passphrase: SENHA });
  assert.equal(res.error, "local_mais_nova");
  assert.equal((await store.getAllBlobsMap()).size, 0);
});
