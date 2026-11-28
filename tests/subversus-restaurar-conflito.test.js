/**
 * @file SUB-31: restaurar um backup não troca, sem confirmação, uma campanha local mais nova; com
 * `overwrite: true` (botão de confirmar) a troca acontece.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { exportCampaignBackup, importCampaignFile } from "../client/js/dungeon/dungeon-persistence.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { packVoxRpg } from "../client/js/dungeon/vtt-portable.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const ID = "camp_restaurar";

async function cenario(lamportLocal, lamportBackup) {
  const store = createVttStore(createMemoryVttBackend());
  if (lamportLocal !== null) await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: lamportLocal }));
  const zip = await packVoxRpg(createCampaign({ id: ID, name: "Backup", lamport: lamportBackup }));
  const state = createDungeonSessionState({ viewerRole: "gm", campaignId: "", syncPeer: null });
  return { store, state, file: { name: `${ID}.voxrpg.zip`, bytes: zip } };
}

const lamportSalvo = async (store) => (await store.loadCampaign(ID)).lamport;

test("backup mais velho que a campanha local: recusa e mantém a local", async () => {
  const { store, state, file } = await cenario(10, 4);
  const res = await importCampaignFile(state, file, { store });
  assert.equal(res.ok, false);
  assert.equal(res.error, "local_mais_nova");
  assert.equal(await lamportSalvo(store), 10);
});

test("com overwrite: true a cópia do arquivo substitui a local", async () => {
  const { store, state, file } = await cenario(10, 4);
  const res = await importCampaignFile(state, file, { store, overwrite: true });
  assert.equal(res.ok, true);
  assert.equal(await lamportSalvo(store), 4);
});

test("backup com lamport igual ou maior, ou campanha que não existe no aparelho, importa como antes", async () => {
  for (const [local, backup] of [[4, 4], [4, 10], [null, 4]]) {
    const { store, state, file } = await cenario(local, backup);
    const res = await importCampaignFile(state, file, { store });
    assert.equal(res.ok, true, `local ${local} / backup ${backup}`);
    assert.equal(await lamportSalvo(store), backup);
  }
});

test("recusa pela tela: aviso, pacote pendente e botão de confirmar; confirmar troca e some o botão", async () => {
  const { store, state, file } = await cenario(10, 4);
  assert.doesNotMatch(renderCampScreen(state), /data-dungeon="confirm-restore"/);
  await importCampaignFile(state, file, { store });
  assert.match(state.campaignNotice, /mais recente/);
  assert.ok(state.pendingRestore);
  assert.match(renderCampScreen(state), /data-dungeon="confirm-restore"/);
  await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  assert.equal(await lamportSalvo(store), 4);
  assert.equal(state.pendingRestore, null);
  assert.doesNotMatch(renderCampScreen(state), /data-dungeon="confirm-restore"/);
});

test("confirmar sem restauração pendente não faz nada", async () => {
  const { store, state } = await cenario(10, 4);
  await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  assert.equal(await lamportSalvo(store), 10);
});

test("backup cifrado recusado também fica pendente sem guardar a senha", async () => {
  const { store, state } = await cenario(10, 10);
  const owner = createDungeonSessionState({ viewerRole: "gm", campaignId: ID, syncPeer: null });
  const enc = await exportCampaignBackup(owner, { format: "enc", passphrase: "senha-soberana-super-segura", store });
  await store.saveCampaign(createCampaign({ id: ID, name: "Local", lamport: 20 }));
  const res = await importCampaignFile(state, { name: enc.filename, bytes: enc.bytes }, { store, passphrase: "senha-soberana-super-segura" });
  assert.equal(res.error, "local_mais_nova");
  assert.equal(JSON.stringify(state.pendingRestore, (k, v) => (v instanceof Map || v instanceof Uint8Array ? undefined : v)).includes("senha-soberana"), false);
  await ACTION_HANDLERS["confirm-restore"](state, null, null, { store });
  assert.equal(await lamportSalvo(store), 10);
});
