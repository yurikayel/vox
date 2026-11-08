import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as ff from "../client/js/feature-flags.js";

const okJson = (body) => async () => ({ ok: true, json: async () => body });

test("feature-flags - padrão: tudo ligado", () => {
  ff.applyFlags({});
  for (const k of Object.keys(ff.FLAG_DEFAULTS)) assert.equal(ff.isFeatureEnabled(k), true);
});

test("feature-flags - sanitizeFlags ignora chaves desconhecidas e valores não booleanos", () => {
  const s = ff.sanitizeFlags({ flags: { feira: false, pixZaps: "false", hacker: false }, notice: "x".repeat(400) });
  assert.equal(s.flags.feira, false);
  assert.equal(s.flags.pixZaps, true);
  assert.equal("hacker" in s.flags, false);
  assert.equal(s.notice.length, 280);
});

test("feature-flags - loadRemoteFlags aplica o JSON remoto e assertFeatureEnabled lança", async () => {
  await ff.loadRemoteFlags({ fetchFn: okJson({ flags: { arweaveUpload: false }, notice: "Manutenção" }) });
  assert.equal(ff.isFeatureEnabled("arweaveUpload"), false);
  assert.equal(ff.getFlags().notice, "Manutenção");
  assert.throws(() => ff.assertFeatureEnabled("arweaveUpload"), (e) => e instanceof ff.FeatureDisabledError && /pausado/.test(e.message));
  ff.applyFlags({});
});

test("feature-flags - falha de rede mantém o último estado salvo", async () => {
  await ff.loadRemoteFlags({ fetchFn: okJson({ flags: { feira: false } }) });
  ff.applyFlags({});
  await ff.loadRemoteFlags({ fetchFn: async () => { throw new Error("offline"); } });
  assert.equal(ff.isFeatureEnabled("feira"), false);
  await ff.loadRemoteFlags({ fetchFn: okJson({ flags: {} }) });
  assert.equal(ff.isFeatureEnabled("feira"), true);
});

test("feature-flags - upload.postData respeita o kill-switch antes de tocar na carteira", async () => {
  const upload = await import("../client/js/upload.js");
  ff.applyFlags({ flags: { arweaveUpload: false } });
  await assert.rejects(() => upload.postData({ a: 1 }, []), (e) => e.name === "FeatureDisabledError");
  ff.applyFlags({});
});

test("feature-flags - config/flags.json publicado está todo ligado e o SW não o guarda em cache", () => {
  const cfg = JSON.parse(readFileSync(new URL("../client/config/flags.json", import.meta.url), "utf8"));
  for (const k of Object.keys(ff.FLAG_DEFAULTS)) assert.equal(cfg.flags[k], true, k);
  const sw = readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");
  assert.ok(sw.includes('endsWith("/config/flags.json")'));
});
