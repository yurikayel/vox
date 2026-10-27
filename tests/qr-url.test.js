import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as qr from "../client/js/qr-url.js";
import * as share from "../client/js/share.js";
import * as render from "../client/js/render.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

globalThis.window = globalThis.window || globalThis;
globalThis.window.location = {
  origin: "https://yurikayel.github.io",
  pathname: "/vox/",
};

function finderCell(dx, dy) {
  return dx === 0 || dx === 6 || dy === 0 || dy === 6
    || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
}

function assertFinder(modules, x0, y0) {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const got = modules[y0 + dy][x0 + dx] ? 1 : 0;
      const want = finderCell(dx, dy) ? 1 : 0;
      assert.equal(got, want, `finder ${x0},${y0} at ${dx},${dy}`);
    }
  }
}

test("qr-url - roundtrip topic URL to modules", () => {
  const url = "https://yurikayel.github.io/vox/#/t/top_mutirao";
  assert.match(url, /#\/t\//);
  const encoded = qr.encodeVoxUrl(url);
  assert.ok(encoded.size >= 25);
  assert.equal(encoded.modules.length, encoded.size);
  assert.equal(encoded.modules[0].length, encoded.size);
  assertFinder(encoded.modules, 0, 0);
  assertFinder(encoded.modules, encoded.size - 7, 0);
  assertFinder(encoded.modules, 0, encoded.size - 7);
  assert.equal(qr.decodeQrModules(encoded.modules), url);
});

test("qr-url - roundtrip connect URL to modules", () => {
  const url = share.connectShareUrl("vx_abcdefghijklmnopqr");
  assert.match(url, /#\/connect\//);
  const encoded = qr.encodeVoxUrl(url);
  assert.equal(qr.decodeQrModules(encoded.modules), url);
});

test("qr-url - SVG has modules and honest copy names camera/PWA/Wi-Fi Direct", () => {
  const encoded = qr.encodeVoxUrl("https://yurikayel.github.io/vox/#/t/abc");
  const svg = qr.modulesToSvg(encoded.modules);
  assert.match(svg, /<svg /);
  assert.match(svg, /<rect /);
  assert.match(qr.QR_URL_HONEST_COPY, /c[aâ]mera/i);
  assert.match(qr.QR_URL_HONEST_COPY, /PWA/);
  assert.match(qr.QR_URL_HONEST_COPY, /Wi-Fi Direct/);
  assert.match(qr.QR_URL_HONEST_COPY, /mutir[aã]o/i);
  assert.match(qr.QR_URL_HONEST_COPY, /panfleto/i);
});

test("qr-url - rejects Pix payload and non-share hashes", () => {
  assert.equal(qr.isVoxShareUrl("00020126br.gov.bcb.pix"), false);
  assert.throws(() => qr.encodeVoxUrl("00020126br.gov.bcb.pix"));
  assert.throws(() => qr.encodeVoxUrl("https://yurikayel.github.io/vox/#/wallet"));
});

test("qr-url - own profile and share sheets expose QR deste link", () => {
  const main = { innerHTML: "" };
  render.renderProfile(main, "vx_me", [], true, "", { displayName: "Eu", activeTab: "posts" });
  assert.ok(main.innerHTML.includes("QR deste link"));
  assert.ok(main.innerHTML.includes('id="btn-qr-connect-link"'));
  assert.ok(main.innerHTML.includes('data-qr-share="connect"'));

  const more = fs.readFileSync(path.join(root, "js/render/post-more-menu.js"), "utf8");
  assert.ok(more.includes("QR deste link"));
  const posse = fs.readFileSync(path.join(root, "js/posse-dispatch.js"), "utf8");
  assert.ok(posse.includes("QR deste link"));
  const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  assert.ok(app.includes("attachQrUrlHandlers"));
});

test("qr-url - encoder is vanilla and not brcode/Pix", () => {
  const src = fs.readFileSync(path.join(root, "js/qr-url.js"), "utf8");
  assert.ok(!src.includes("brcode"));
  assert.ok(!src.includes("buildPixPayload"));
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(sw, /vox-pwa-v6\.87-qr-url/);
  assert.ok(sw.includes('"./js/qr-url.js"'));
  assert.ok(sw.includes('"./js/qr-url-gf.js"'));
  assert.ok(sw.includes('"./js/qr-url-codec.js"'));
  assert.ok(sw.includes('"./js/qr-url-layout.js"'));
});
