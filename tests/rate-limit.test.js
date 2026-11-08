import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../client/js/rate-limit.js";

test("LAN-14: teto por chave na janela, por autor", () => {
  let t = 0;
  const rl = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), false);
  assert.equal(rl.allow("b"), true, "outro autor não é afetado");
  t = 1000;
  assert.equal(rl.allow("a"), true, "janela deslizou");
  assert.equal(rl.allow(""), false);
});
