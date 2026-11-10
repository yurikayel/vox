import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import * as mediaBlob from "../client/js/media-blob.js";
import * as realUpload from "../client/js/upload.js";
import { uploadTopicToPermaweb } from "../client/js/topic-permaweb.js";

const PHOTO_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 5, 6]);
const PHOTO_DATA_URL = `data:image/webp;base64,${Buffer.from(PHOTO_BYTES).toString("base64")}`;

/** Carteira, aviso de permanência e upload falsos; registra o que seria enviado ao Arweave. */
function fakeDeps() {
  const calls = { binary: [], data: [] };
  const upload = {
    FREE_TIER_MAX_BYTES: realUpload.FREE_TIER_MAX_BYTES,
    buildTags: realUpload.buildTags,
    postBinary: async (bytes, tags) => {
      calls.binary.push({ bytes, tags });
      return { success: true, id: "media_tx_1", via: "turbo" };
    },
    postData: async (data, tags) => {
      calls.data.push({ data, tags });
      return { success: true, id: "topic_tx_1", via: "turbo" };
    },
  };
  const wallet = { hasWallet: () => true };
  const permanence = { confirmPermanentPublish: async () => true, MESH_ONLY_RESULT: { success: false } };
  return { deps: { upload, wallet, permanence }, calls };
}

const tag = (tags, name) => tags.find((t) => t.name === name)?.value;

test("PM-88: foto do composer sobe ao Arweave com os bytes e o MIME do blob de detachMedia", async () => {
  const { mediaBlob: blob } = await mediaBlob.detachMedia({ id: "t1", image: PHOTO_DATA_URL });
  const { deps, calls } = fakeDeps();

  const res = await uploadTopicToPermaweb(
    { topicId: "t1", commSlug: "geral", title: "Foto", body: "", blob, aspectRatio: "1:1" },
    deps,
  );

  assert.equal(res.success, true);
  assert.equal(calls.binary.length, 1, "a mídia tem de ser enviada");
  assert.deepEqual([...calls.binary[0].bytes], [...PHOTO_BYTES]);
  const contentTypes = calls.binary[0].tags.filter((t) => t.name === "Content-Type").map((t) => t.value);
  assert.deepEqual(contentTypes, ["image/webp"], "uma só Content-Type, a do blob (gateway serve pela primeira)");
  assert.equal(tag(calls.binary[0].tags, "Blob-Hash"), blob.hash);
  assert.equal(tag(calls.binary[0].tags, "Aspect-Ratio"), "1:1");
  assert.equal(tag(calls.data[0].tags, "Media-Tx"), "media_tx_1", "o tópico aponta para a mídia");
  assert.equal(calls.data[0].data.mediaTx, "media_tx_1");
});

test("PM-88: post só de texto não tenta subir mídia e não leva Media-Tx", async () => {
  const { deps, calls } = fakeDeps();
  await uploadTopicToPermaweb({ topicId: "t2", commSlug: "geral", title: "Texto", body: "oi", blob: null }, deps);
  assert.equal(calls.binary.length, 0);
  assert.equal(tag(calls.data[0].tags, "Media-Tx"), undefined);
});

test("PM-88: sem carteira, nada vai ao Arweave", async () => {
  const { deps, calls } = fakeDeps();
  deps.wallet = { hasWallet: () => false };
  const { mediaBlob: blob } = await mediaBlob.detachMedia({ id: "t3", image: PHOTO_DATA_URL });
  const res = await uploadTopicToPermaweb({ topicId: "t3", commSlug: "geral", title: "x", body: "", blob }, deps);
  assert.equal(res, null);
  assert.equal(calls.binary.length + calls.data.length, 0);
});
