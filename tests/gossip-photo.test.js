/**
 * PM-87 — foto publicada pelo composer: o post que vai pela malha bate com a assinatura, e quem recebe
 * guarda a imagem (em `_media`, fora da forma assinada) e a mostra no feed.
 */
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/local-account.js";
import * as mediaBlob from "../client/js/media-blob.js";
import * as peers from "../client/js/peers.js";
import { renderPostItem } from "../client/js/render/feed.js";
import { broadcastAndPersistInlineTopic } from "../client/js/inline-composer.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const OTHER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const HERO_IMG = /<img class="post-media post-media-hero-img" src="data:image\/png;base64,/;

/** Escuta o canal da malha como um aparelho vizinho; devolve as mensagens GOSSIP vistas. */
function tapMesh() {
  const seen = [];
  const tap = new BroadcastChannel("vox-peer-v0");
  tap.onmessage = ({ data }) => data?.type === "GOSSIP" && seen.push(JSON.parse(JSON.stringify(data)));
  return { seen, close: () => tap.close() };
}

/** Aparelho que recebe: sem o post e sem o blob. */
async function asFreshReceiver() {
  await cacheNode.clearLocalPosts();
  mediaBlob.defaultBlobStorage.clear();
}

async function publishPhoto(id) {
  const tap = tapMesh();
  const payload = { id, type: "topic", communityId: "geral", title: "Feira", body: "Sábado", image: PNG, imageAlt: "Feira" };
  await broadcastAndPersistInlineTopic(payload, "Feira", "Sábado", "geral");
  tap.close();
  return tap.seen;
}

test("PM-87: foto do composer chega ao vivo, verifica e aparece em quem recebe", async () => {
  localStorage.clear();
  await asFreshReceiver();
  peers.initPeerChannel();
  const sent = await publishPhoto("top_pm87_ok");
  assert.equal(sent.length, 1, "o composer manda um GOSSIP");
  const [msg] = sent;
  assert.equal(await localAccount.verifyPayload(msg.item), true, "o post da malha bate com a assinatura");
  assert.equal(msg.item.image, null);
  assert.equal(msg.item.mediaHash, msg.blob.hash, "o hash da mídia está no primeiro nível, coberto pela assinatura");
  assert.equal((await cacheNode.getLocalPost("top_pm87_ok")).image, PNG, "quem publicou continua vendo a foto");

  await asFreshReceiver();
  const relay = tapMesh();
  await peers.handleVoxMessage(msg, () => {}, "rtc");
  relay.close();
  const shown = await cacheNode.getLocalPost("top_pm87_ok");
  assert.equal(shown.image, PNG);
  assert.match(renderPostItem(shown), HERO_IMG, "o feed de quem recebe mostra a imagem, não o marcador");
  const wire = (await cacheNode.getWirePosts()).find((p) => p.id === "top_pm87_ok");
  assert.deepEqual(wire, msg.item, "quem recebe guarda e repassa exatamente a forma assinada");
  assert.equal(relay.seen[0]?.blob?.hash, msg.item.mediaHash, "o blob segue adiante com o post");
});

test("PM-87: blob trocado no caminho não entra nem segue adiante", async () => {
  localStorage.clear();
  await asFreshReceiver();
  peers.initPeerChannel();
  const [msg] = await publishPhoto("top_pm87_swap");
  const swapped = await mediaBlob.detachMedia({ image: OTHER });
  // `mediaRef` é aninhado (fora da assinatura, PM-85): trocá-lo não invalida o post, mas `mediaHash` manda.
  const forged = { ...msg, item: { ...msg.item, mediaRef: swapped.detachedPost.mediaRef }, blob: swapped.mediaBlob };
  assert.equal(await localAccount.verifyPayload(forged.item), true);

  await asFreshReceiver();
  const relay = tapMesh();
  await peers.handleVoxMessage(forged, () => {}, "rtc");
  relay.close();
  const shown = await cacheNode.getLocalPost("top_pm87_swap");
  assert.ok(shown, "o post assinado entra");
  assert.ok(!shown.image, "a imagem trocada não aparece");
  assert.equal(relay.seen[0]?.blob, null, "e não é repassada");
  assert.equal(mediaBlob.defaultBlobStorage.has(swapped.mediaBlob.hash), false);
});
