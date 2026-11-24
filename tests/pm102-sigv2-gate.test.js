import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { SIGV2_FROM, canonicalString, isSigVersionAllowed } from "../client/js/sig-format.js";
import { computeRouteId } from "../client/js/identity/local-account.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as hydrate from "../client/js/central-memory-hydrate.js";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function makeSigner() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const author = await computeRouteId(pubKey);
  return async (payload) => {
    const body = { ...payload, author };
    const encoded = new TextEncoder().encode(canonicalString(body));
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoded);
    return { ...body, pubKey, sig: b64url(sig) };
  };
}

test("PM-102: isSigVersionAllowed aceita v1 legado (< SIGV2_FROM) e recusa v1 novo (>= SIGV2_FROM)", () => {
  assert.equal(isSigVersionAllowed({ id: "old1", ts: SIGV2_FROM - 1 }), true);
  assert.equal(isSigVersionAllowed({ id: "old2", createdAt: SIGV2_FROM - 1 }), true);
  assert.equal(isSigVersionAllowed({ id: "old3", editedAt: SIGV2_FROM - 1 }), true);
  assert.equal(isSigVersionAllowed({ id: "no_ts" }), true, "item legado sem timestamp segue aceito");
  assert.equal(isSigVersionAllowed({ id: "flip", ts: SIGV2_FROM }), false);
  assert.equal(isSigVersionAllowed({ id: "new1", ts: SIGV2_FROM + 1 }), false);
  assert.equal(isSigVersionAllowed({ id: "new2", createdAt: SIGV2_FROM }), false);
  assert.equal(isSigVersionAllowed({ id: "new3", editedAt: SIGV2_FROM }), false);
});

test("PM-102: isSigVersionAllowed aceita sigv: 2 sempre e recusa qualquer sigv desconhecido", () => {
  assert.equal(isSigVersionAllowed({ id: "v2_new", sigv: 2, ts: SIGV2_FROM + 60_000 }), true);
  assert.equal(isSigVersionAllowed({ id: "v2_old", sigv: 2, ts: SIGV2_FROM - 1 }), true);
  assert.equal(isSigVersionAllowed({ id: "v2_no_ts", sigv: 2 }), true);

  for (const sigv of [1, 3, "2", null, 0, NaN, {}]) {
    assert.equal(isSigVersionAllowed({ id: "bad_sigv", sigv, ts: SIGV2_FROM - 1 }), false, `sigv=${String(sigv)}`);
  }
  assert.equal(isSigVersionAllowed(null), false);
  assert.equal(isSigVersionAllowed([]), false);
});

test("PM-102: isSigVersionAllowed respeita cutoverMs e graceMs opcionais", () => {
  assert.equal(isSigVersionAllowed({ id: "g1", ts: SIGV2_FROM + 500 }, { graceMs: 1000 }), true);
  assert.equal(isSigVersionAllowed({ id: "g2", ts: SIGV2_FROM + 1000 }, { graceMs: 1000 }), false);
  assert.equal(isSigVersionAllowed({ id: "c1", ts: 499 }, { cutoverMs: 500 }), true);
  assert.equal(isSigVersionAllowed({ id: "c2", ts: 500 }, { cutoverMs: 500 }), false);
});

test("PM-102: central-memory-hydrate rejeita post novo em v1 e aceita legado v1 e novo v2", async () => {
  const sign = await makeSigner();
  const legacyV1 = await sign({ id: "pm102_legacy_v1", type: "topic", communityId: "b", title: "Antigo", body: "ok", ts: SIGV2_FROM - 1 });
  const newV1 = await sign({ id: "pm102_new_v1", type: "topic", communityId: "b", title: "Novo v1", body: "recusar", ts: SIGV2_FROM });
  const newV2 = await sign({ id: "pm102_new_v2", type: "topic", communityId: "b", title: "Novo v2", body: "aceitar", sigv: 2, ts: SIGV2_FROM });

  const added = await hydrate.hydratePosts([legacyV1, newV1, newV2]);
  assert.equal(added, 2);
  assert.ok(await cacheNode.getLocalPost("pm102_legacy_v1"));
  assert.equal(await cacheNode.getLocalPost("pm102_new_v1"), null);
  assert.ok(await cacheNode.getLocalPost("pm102_new_v2"));
});
