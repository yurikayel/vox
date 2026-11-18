import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { shortId } from "../client/js/short-id.js";
import { WELCOME_ROUTE_ID } from "../client/js/vox-welcome-profile.js";

test("short-id — vazio, conta oficial e ids vx_", () => {
  assert.equal(shortId(""), "—");
  assert.equal(shortId(WELCOME_ROUTE_ID), "vox");
  assert.equal(shortId("vx_abc"), "vx_abc");
  assert.equal(shortId("vx_abcdef12"), "vx_abcdef");
});

test("short-id — 0x, did: e formatos longos", () => {
  assert.equal(shortId("0xdeadbeef0"), "0xdeadbe");
  assert.equal(shortId("did:example:alice"), "did:example:");
  assert.equal(shortId("conta_anonima_longa_demais"), "conta_anon…");
  assert.equal(shortId("curto_ok"), "curto_ok");
});