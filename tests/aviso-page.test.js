import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const page = await import("../client/aviso/aviso-page.js");
const { encodeAvisoFragment } = await import("../client/aviso/aviso-link.js");
const { canonicalString } = await import("../client/js/sig-format.js");
const { bytesToB64Url, computeRouteId, verifyPayload } = await import("../client/js/signed-verify.js");

const NOW = Date.UTC(2026, 10, 11, 12);
const DAY = 24 * 60 * 60 * 1000;

async function newSigner() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const pubKey = { kty, crv, x, y };
  const author = await computeRouteId(pubKey);
  return async (extra = {}) => {
    const body = { type: "topic", id: "a1", communityId: "c1", avisoKind: "informe", title: "Mutirão de limpeza", body: "Sábado.", authorDisplay: "Ana Lúcia", authorAvatar: "", ts: NOW, author, pubKey, ...extra };
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonicalString(body)));
    return { ...body, sig: bytesToB64Url(sig) };
  };
}

const memoryStore = () => {
  const map = new Map();
  return page.trustStore({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) });
};

const frag = (aviso) => `#${encodeAvisoFragment(aviso)}`;

test("signed-verify — assinatura confere e adulteração cai", async () => {
  const sign = await newSigner();
  const aviso = await sign();
  assert.equal(await verifyPayload(aviso), true);
  assert.equal(await verifyPayload({ ...aviso, title: "Mutirão cancelado" }), false);
  assert.equal(await verifyPayload({ ...aviso, author: "vx_outro" }), false);
  assert.equal(await computeRouteId({}), "");
});

test("aviso-page — primeira vez amarelo, depois verde", async () => {
  const sign = await newSigner();
  const store = memoryStore();
  const first = await page.evaluateAviso(frag(await sign()), store, NOW);
  assert.equal(first.state, "amarelo");
  assert.match(first.person, /^[0-9A-Z]{3}-[0-9A-Z]{3}$/);
  const again = await page.evaluateAviso(frag(await sign({ id: "a2" })), store, NOW);
  assert.equal(again.state, "verde");
});

test("aviso-page — chave nova no mesmo grupo ou com o mesmo nome fica vermelha até confirmar", async () => {
  const store = memoryStore();
  await page.evaluateAviso(frag(await (await newSigner())()), store, NOW);
  const impostor = await newSigner();
  const sameGroup = await impostor();
  assert.equal((await page.evaluateAviso(frag(sameGroup), store, NOW)).state, "chave-nova");
  const sameName = await impostor({ communityId: "c-clone", authorDisplay: " ana lucia " });
  assert.equal((await page.evaluateAviso(frag(sameName), store, NOW)).state, "chave-nova");
  page.rememberKey(store, sameGroup);
  assert.equal((await page.evaluateAviso(frag(sameGroup), store, NOW)).state, "verde");
});

test("aviso-page — adulterado, lixo e vencido", async () => {
  const sign = await newSigner();
  const store = memoryStore();
  const aviso = await sign();
  assert.equal((await page.evaluateAviso(frag({ ...aviso, body: "Pix para…" }), store, NOW)).state, "invalido");
  assert.equal((await page.evaluateAviso("#v=1&a=%%%", store, NOW)).state, "invalido");
  assert.equal((await page.evaluateAviso("", store, NOW)).state, "invalido");
  assert.equal((await page.evaluateAviso(frag(aviso), store, NOW + 8 * DAY)).state, "encerrado");
  assert.deepEqual(store.read(), { groups: {}, names: {} });
});

test("aviso-page — memória quebrada ou bloqueada não derruba a página", async () => {
  const broken = page.trustStore({ getItem: () => "{lixo", setItem: () => { throw new Error("cheio"); } });
  const result = await page.evaluateAviso(frag(await (await newSigner())()), broken, NOW);
  assert.equal(result.state, "amarelo");
  assert.equal(page.trustStore(null).read().groups.c1, undefined);
});

test("aviso-page — textos e resposta pronta para o WhatsApp", () => {
  const text = page.describeState({ state: "verde", aviso: { authorDisplay: "Ana" }, person: "ABC-123" }).text;
  assert.equal(text, "Assinado por Ana. Código ABC-123.");
  assert.equal(page.describeState({ state: "???" }).title, "Não confie");
  assert.equal(page.replyHref("🙋 Vou", "A7F3"), `https://wa.me/?text=${encodeURIComponent("🙋 Vou — A7F3")}`);
});
