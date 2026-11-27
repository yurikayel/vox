/**
 * @file SUB-30: a exportação (`.voxrpg.zip` e `.voxrpg.enc`) leva só os blobs referenciados pela campanha
 * exportada (mapa de cada piso e avatar de cada token).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createAndSelectCampaign, exportCampaignBackup } from "../client/js/dungeon/dungeon-persistence.js";
import { dispatchCampaignOp } from "../client/js/dungeon/dungeon-sync-bridge.js";
import { getActiveScene, uploadSceneMapBlob } from "../client/js/dungeon/dungeon-scene-actions.js";
import { referencedBlobHashes, unpackEncryptedVoxRpg, unpackVoxRpg } from "../client/js/dungeon/vtt-portable.js";
import { createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";

const SENHA = "senha-soberana-super-segura";

async function duasCampanhas() {
  const store = createVttStore(createMemoryVttBackend());
  const a = { chronicle: [], rolls: [] };
  const b = { chronicle: [], rolls: [] };
  await createAndSelectCampaign(a, "Campanha A", { store });
  const mapaA = await uploadSceneMapBlob(a, { bytes: new Uint8Array([1, 1, 1]), mime: "image/png" }, { store });
  await createAndSelectCampaign(b, "Campanha B", { store });
  const mapaB = await uploadSceneMapBlob(b, { bytes: new Uint8Array([2, 2, 2]), mime: "image/png" }, { store });
  return { store, a, b, h1: mapaA.sha256, h2: mapaB.sha256 };
}

async function hashesDoZip(state, store) {
  const art = await exportCampaignBackup(state, { format: "zip", store });
  return [...(await unpackVoxRpg(art.bytes)).blobs.keys()];
}

test("zip da campanha A leva só o mapa dela", async () => {
  const { store, a, h1 } = await duasCampanhas();
  assert.deepEqual(await hashesDoZip(a, store), [h1]);
});

test("enc da campanha A leva só o mapa dela", async () => {
  const { store, a, h1 } = await duasCampanhas();
  const art = await exportCampaignBackup(a, { format: "enc", passphrase: SENHA, store });
  const { blobs } = await unpackEncryptedVoxRpg(new TextDecoder().decode(art.bytes), SENHA);
  assert.deepEqual([...blobs.keys()], [h1]);
});

test("arquivo solto no aparelho, sem piso nem token que o use, não entra", async () => {
  const { store, a, h1 } = await duasCampanhas();
  await store.putBlob(new Uint8Array([7, 7, 7]), "image/png");
  assert.deepEqual(await hashesDoZip(a, store), [h1]);
});

test("avatar de token da campanha entra junto com o mapa", async () => {
  const { store, a, h1 } = await duasCampanhas();
  const avatar = await store.putBlob(new Uint8Array([3, 3, 3]), "image/png");
  const scene = getActiveScene(a);
  await dispatchCampaignOp(a, "TOKEN_UPSERT", { sceneId: scene.sceneId, token: { name: "Retrato", avatarBlobHash: avatar.sha256 } }, { store });
  assert.deepEqual((await hashesDoZip(a, store)).sort(), [h1, avatar.sha256].sort());
});

test("hash referenciado que não está no aparelho é pulado sem erro", async () => {
  const store = createVttStore(createMemoryVttBackend());
  const achado = await store.putBlob(new Uint8Array([4]), "image/png");
  const mapa = await store.getBlobsMap(new Set([achado.sha256, "0".repeat(64)]));
  assert.deepEqual([...mapa.keys()], [achado.sha256]);
});

test("referencedBlobHashes ignora vazios e campanha sem cenas", () => {
  assert.equal(referencedBlobHashes(null).size, 0);
  const doc = { scenesById: { s: { floors: [{ mapBlobHash: "" }, { mapBlobHash: "m" }], tokens: [{ avatarBlobHash: "" }, { avatarBlobHash: "t" }] } } };
  assert.deepEqual([...referencedBlobHashes(doc)].sort(), ["m", "t"]);
});
