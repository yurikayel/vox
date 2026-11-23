/**
 * LAN-20 — verificação automatizada de cadeia de suprimentos para arquivos
 * vendorizados em `client/vendor/`, hashes SRI em `docs/DEPENDENCIAS.md` e
 * invariante local-first (zero `<script>`/`<link>` externos sem SRI) em `client/index.html`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY = readFileSync(join(ROOT, "docs", "DEPENDENCIAS.md"), "utf8");
const INDEX_HTML = readFileSync(join(ROOT, "client", "index.html"), "utf8");

function walkFiles(dirRel) {
  const fullDir = join(ROOT, dirRel);
  if (!existsSync(fullDir)) return [];
  const out = [];
  for (const name of readdirSync(fullDir)) {
    const rel = `${dirRel}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkFiles(rel));
    else out.push(rel);
  }
  return out;
}

function isLicenseOrReadme(relPath) {
  const base = relPath.split("/").pop() || "";
  return /^(readme|license|copying|notice)(\.|$)/i.test(base);
}

function computeSri(fileRel, algo) {
  const buf = readFileSync(join(ROOT, fileRel));
  return `${algo}-${createHash(algo).update(buf).digest("base64")}`;
}

function verifyHexOrSri(fileRel, token) {
  const m = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(token);
  if (m) {
    assert.equal(computeSri(fileRel, m[1]), token, `${fileRel}: digest ${m[1]} diverge do inventário`);
    return;
  }
  if (/^[0-9a-f]{64}$/i.test(token)) {
    const actual = createHash("sha256").update(readFileSync(join(ROOT, fileRel))).digest("hex");
    assert.equal(actual, token.toLowerCase(), `${fileRel}: SHA-256 hex diverge do inventário`);
  }
}

test("LAN-20: todo arquivo em client/vendor/ (exceto README/LICENSE) está documentado em docs/DEPENDENCIAS.md", () => {
  const vendorFiles = walkFiles("client/vendor").filter((f) => !isLicenseOrReadme(f));
  assert.ok(vendorFiles.length > 0, "esperava ao menos um arquivo vendorizado em client/vendor/");
  const undocumented = vendorFiles.filter((f) => !INVENTORY.includes(f));
  assert.deepEqual(undocumented, [], "arquivo em client/vendor/ fora de docs/DEPENDENCIAS.md");
});

test("LAN-20: todo client/vendor/ citado em docs/DEPENDENCIAS.md existe no disco e confere com seu hash", () => {
  const vendorFileRe = /client\/vendor\/[^\s`)|]*[^\s`)|/]/;
  const vendorRows = INVENTORY.split("\n").filter((l) => vendorFileRe.test(l));
  assert.ok(vendorRows.length > 0, "docs/DEPENDENCIAS.md precisa listar ao menos um arquivo em client/vendor/");
  for (const row of vendorRows) {
    const fileRel = row.match(vendorFileRe)[0];
    assert.ok(existsSync(join(ROOT, fileRel)), `vendor ausente no disco: ${fileRel}`);
    const hashMatch = row.match(/(?:sha384|sha256|sha512)-[A-Za-z0-9+/=]+|\b[0-9a-f]{64}\b/i);
    assert.ok(hashMatch, `linha de ${fileRel} em docs/DEPENDENCIAS.md precisa declarar hash SRI/SHA`);
    verifyHexOrSri(fileRel, hashMatch[0]);
  }
});

test("LAN-20: tags com integrity em client/index.html conferem com os arquivos locais", () => {
  const sriTags = [...INDEX_HTML.matchAll(/<(?:script|link)\b[^>]*\bintegrity=["']([^"']+)["'][^>]*>/gi)];
  for (const match of sriTags) {
    const tag = match[0];
    const ref = tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    assert.ok(ref, `tag com integrity sem src/href: ${tag}`);
    assert.ok(!/^https?:\/\//i.test(ref), `client/index.html não deve depender de CDN externo: ${ref}`);
    const fileRel = `client/${ref.replace(/^\.\//, "")}`;
    assert.ok(existsSync(join(ROOT, fileRel)), `ativo referenciado em index.html ausente: ${fileRel}`);
    verifyHexOrSri(fileRel, match[1]);
  }
});

test("LAN-20: client/index.html tem zero <script>/<link> externos e nenhum HTML carrega <script> CDN sem SRI", () => {
  const externalScripts = [...INDEX_HTML.matchAll(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi)];
  const externalLinks = [...INDEX_HTML.matchAll(/<link\b[^>]*\bhref=["'](https?:\/\/[^"']+)["'][^>]*>/gi)];
  assert.deepEqual(externalScripts.map((m) => m[1]), [], "index.html não pode ter <script src> externo");
  assert.deepEqual(externalLinks.map((m) => m[1]), [], "index.html não pode ter <link href> externo");

  const unpinnedScripts = [];
  for (const htmlRel of walkFiles("client").filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(join(ROOT, htmlRel), "utf8");
    for (const m of html.matchAll(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["'][^>]*>/gi)) {
      if (!/\bintegrity=["']sha(?:256|384|512)-[^"']+["']/i.test(m[0])) {
        unpinnedScripts.push(`${htmlRel}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(unpinnedScripts, [], "script externo sem atributo integrity encontrado");
});
