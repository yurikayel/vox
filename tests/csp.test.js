import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function metaCsp() {
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, "index.html precisa da meta CSP (LAN-16)");
  return m[1];
}

function directive(csp, name) {
  return csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || "";
}

test("csp - LAN-16: index.html não tem <script> inline (só src) e a CSP não usa hash nem nonce", () => {
  const csp = metaCsp();
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
  assert.deepEqual(inline.map((m) => m[0]), []);
  for (const src of ["js/boot-color-mode.js", "js/boot-short-url.js", "js/boot-sw.js", "js/app.js"]) {
    assert.ok(html.includes(`src="${src}"`), src);
    assert.ok(fs.existsSync(path.join(root, src)), src);
  }
  assert.ok(!/'(sha256|nonce)-/.test(csp));
});

test("csp - script-src não permite unsafe-inline nem unsafe-eval; object-src none", () => {
  const csp = metaCsp();
  const scriptSrc = directive(csp, "script-src");
  assert.ok(scriptSrc);
  assert.ok(!scriptSrc.includes("'unsafe-inline'"));
  assert.ok(!scriptSrc.includes("'unsafe-eval'"));
  assert.equal(directive(csp, "object-src"), "object-src 'none'");
  assert.equal(directive(csp, "base-uri"), "base-uri 'self'");
});

test("csp - nenhum template do cliente usa handler inline (onclick=, onerror=…)", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith(".js")) {
        const src = fs.readFileSync(full, "utf8");
        const m = src.match(/<[a-z][^>`]*\son(click|error|load|change|submit|input|mouseover|focus|blur)="/i);
        if (m) offenders.push(`${path.relative(root, full)}: on${m[1]}=`);
      }
    }
  };
  walk(path.join(root, "js"));
  assert.deepEqual(offenders, []);
});

test("csp - _headers do Cloudflare Pages repete a CSP e acrescenta frame-ancestors e nosniff", () => {
  const headers = fs.readFileSync(path.join(root, "_headers"), "utf8");
  assert.ok(headers.includes(metaCsp()), "_headers deve conter a mesma CSP da meta");
  assert.ok(headers.includes("frame-ancestors 'self'"));
  assert.ok(headers.includes("X-Content-Type-Options: nosniff"));
  assert.ok(headers.includes("Referrer-Policy: strict-origin-when-cross-origin"));
});
