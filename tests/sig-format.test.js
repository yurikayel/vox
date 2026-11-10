import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import { SIGV2_FROM, canonicalString, signingVersion, withSigv } from "../client/js/sig-format.js";
import { renderPhotoTagBarHtml } from "../client/js/render/photo-tag-pins.js";

const TAGS = [{ targetId: "vx_alvo", label: "Alvo", x: 10, y: 20 }];

async function signedAt(when, payload) {
  const realNow = Date.now;
  Date.now = () => when;
  try {
    return await localAccount.signPayload(payload);
  } finally {
    Date.now = realNow;
  }
}

test("PM-85: v1 deixa as chaves internas fora; v2 cobre tudo em qualquer profundidade", () => {
  const a = { title: "x", photoTags: TAGS };
  const b = { title: "x", photoTags: [{ ...TAGS[0], targetId: "vx_outro" }] };
  assert.equal(canonicalString(a), canonicalString(b), "v1: a troca do marcado não muda o texto assinado");
  assert.notEqual(canonicalString({ ...a, sigv: 2 }), canonicalString({ ...b, sigv: 2 }));
  const shuffled = { sigv: 2, photoTags: [{ y: 20, x: 10, label: "Alvo", targetId: "vx_alvo" }], title: "x" };
  assert.equal(canonicalString({ ...a, sigv: 2 }), canonicalString(shuffled), "v2 não depende da ordem das chaves");
  assert.equal(canonicalString({ ...a, sig: "s", pubKey: {} }), canonicalString(a), "sig e pubKey ficam de fora");
});

test("PM-85: convivência — assina v1 até SIGV2_FROM e v2 depois", () => {
  assert.equal(signingVersion(SIGV2_FROM - 1), 1);
  assert.equal(signingVersion(SIGV2_FROM), 2);
  assert.deepEqual(withSigv({ a: 1, sigv: 2 }, 1), { a: 1 });
  assert.deepEqual(withSigv({ a: 1 }, 2), { a: 1, sigv: 2 });
});

test("PM-85: post v2 protege as marcas da foto; v1 segue verificando", async () => {
  const v2 = await signedAt(SIGV2_FROM + 1000, { title: "foto", photoTags: TAGS, ts: SIGV2_FROM });
  assert.equal(v2.sigv, 2);
  assert.equal(await localAccount.verifyPayload(v2), true);
  const retagged = { ...v2, photoTags: [{ ...TAGS[0], targetId: "vx_outro" }] };
  assert.equal(await localAccount.verifyPayload(retagged), false, "trocar o marcado quebra a v2");
  const { sigv: _drop, ...downgraded } = v2;
  assert.equal(await localAccount.verifyPayload(downgraded), false, "tirar o sigv não vira v1 válido");
  assert.equal(await localAccount.verifyPayload({ ...v2, sigv: 3 }), false, "versão desconhecida não verifica");

  const v1 = await signedAt(SIGV2_FROM - 1000, { title: "foto", photoTags: TAGS, ts: 1 });
  assert.equal(v1.sigv, undefined);
  assert.equal(await localAccount.verifyPayload(v1), true);
});

test("PM-85: marca de post alheio v1 aparece como não verificada", () => {
  const post = { id: "p1", photoTags: TAGS };
  assert.match(renderPhotoTagBarHtml(post), /não verificadas/);
  assert.doesNotMatch(renderPhotoTagBarHtml({ ...post, sigv: 2 }), /não verificadas/);
  assert.doesNotMatch(renderPhotoTagBarHtml(post, { isOwn: true }), /não verificadas/);
});
