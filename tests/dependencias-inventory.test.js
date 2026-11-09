/**
 * LAN-20 — o inventário em docs/DEPENDENCIAS.md cobre o código de terceiros que o Vox carrega,
 * as ferramentas que o CI instala e os binários do repositório (com SHA-256).
 * Só lê arquivos do repositório: não baixa nem executa nada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const INVENTORY = read("docs/DEPENDENCIAS.md");

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walk(rel, ext));
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

/**
 * Binários que o git rastreia em `dir`. Artefatos de build locais e ignorados
 * (ex.: APKs em android/build/) não são "do repositório" e não podem quebrar o teste.
 * Sem git (tarball), cai na varredura do disco.
 */
function trackedFiles(dir) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", dir], { cwd: ROOT, encoding: "utf8" });
    return out.split(String.fromCharCode(0)).filter(Boolean);
  } catch {
    return existsSync(join(ROOT, dir)) ? walk(dir, "") : [];
  }
}

function missing(items) {
  return [...new Set(items)].filter((x) => !INVENTORY.includes(x));
}

test("LAN-20: todo import()/loadScript() remoto do cliente está no inventário", () => {
  const urls = [];
  for (const file of [...walk("client/js", ".js"), "client/sw.js"]) {
    const src = read(file);
    for (const m of src.matchAll(/(?:import\(|loadScript\()\s*["'`](https?:\/\/[^"'`]+)["'`]/g)) urls.push(m[1]);
  }
  // PM-11: o arweave é vendorizado; nenhum módulo do app importa código de CDN.
  assert.deepEqual(urls.filter((u) => u.startsWith("https://esm.sh/")), [], "o arweave vem de client/vendor/");
  assert.deepEqual(missing(urls), [], "adicione a URL em docs/DEPENDENCIAS.md");
});

test("LAN-20: nenhum <script src> remoto fora do inventário nas páginas do cliente", () => {
  const urls = [];
  for (const file of walk("client", ".html")) {
    for (const m of read(file).matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/g)) urls.push(m[1]);
  }
  assert.deepEqual(missing(urls), []);
});

test("LAN-20: origens do script-src da CSP estão no inventário", () => {
  const csp = read("client/_headers").match(/script-src ([^;]+);/)[1];
  const origins = csp.split(/\s+/).filter((o) => o.startsWith("https://"));
  assert.ok(origins.length > 0);
  assert.deepEqual(missing(origins), []);
});

test("LAN-20: actions dos workflows estão no inventário", () => {
  const uses = [];
  for (const file of walk(".github/workflows", ".yml")) {
    for (const m of read(file).matchAll(/uses:\s*([^\s#]+)/g)) uses.push(m[1]);
  }
  assert.ok(uses.includes("actions/checkout@v5"));
  assert.deepEqual(missing(uses), []);
});

test("LAN-20: pacotes pip instalados nos workflows estão no inventário", () => {
  const pkgs = [];
  for (const file of walk(".github/workflows", ".yml")) {
    for (const m of read(file).matchAll(/pip install ([^&\n]+)/g)) {
      for (const spec of m[1].trim().split(/\s+/)) pkgs.push(spec.split(/[=<>]/)[0]);
    }
  }
  assert.ok(pkgs.length > 0);
  assert.deepEqual(missing(pkgs.map((p) => `\`${p}\``)), []);
});

test("LAN-20: imagens de contêiner estão no inventário", () => {
  const images = [];
  for (const m of read("relay/Dockerfile").matchAll(/^FROM\s+(\S+)/gm)) images.push(m[1]);
  for (const m of read("relay/deploy/docker-compose.yml").matchAll(/image:\s*(\S+)/g)) images.push(m[1]);
  assert.ok(images.length >= 2);
  assert.deepEqual(missing(images), []);
});

test("LAN-20: devDependencies e versões do lock estão no inventário", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  for (const name of Object.keys(pkg.dependencies || {})) {
    assert.fail(`dependência de runtime npm (${name}) precisa de linha própria e revisão`);
  }
  for (const name of Object.keys(pkg.devDependencies || {})) {
    const version = lock.packages[`node_modules/${name}`]?.version;
    assert.ok(version, `${name} fora do package-lock.json`);
    const row = INVENTORY.split("\n").find((l) => l.startsWith(`| ${name} |`));
    assert.ok(row, `${name} sem linha no inventário`);
    assert.ok(row.includes(version), `${name}: inventário diz outra versão (lock: ${version})`);
  }
});

test("LAN-20: todo binário do repositório tem linha com o SHA-256 atual", () => {
  const BIN = /\.(apk|exe|dll|jar|aar|so|dylib|msi)$/i;
  const found = [];
  for (const dir of ["android", "client", "packaging", "relay", "dist"]) {
    found.push(...trackedFiles(dir).filter((f) => BIN.test(f)));
  }
  assert.ok(found.length > 0, "esperava achar as DLLs do WebView2");
  for (const file of found) {
    const row = INVENTORY.split("\n").find((l) => l.startsWith(`| \`${file}\` |`));
    assert.ok(row, `${file} sem linha na seção 6 de docs/DEPENDENCIAS.md`);
    const sha = createHash("sha256").update(readFileSync(join(ROOT, file))).digest("hex");
    assert.ok(row.includes(sha), `${file}: SHA-256 mudou (${sha}); atualize docs/DEPENDENCIAS.md`);
  }
});

test("PM-45: .exe e .apk saem do CI, não do git", () => {
  const banned = [];
  for (const dir of ["client", "android"]) banned.push(...trackedFiles(dir).filter((f) => /\.(exe|apk)$/i.test(f)));
  assert.deepEqual(banned, [], "publique pelo release-binarios.yml");
  for (const page of ["client/download.html", "client/download/index.html"]) {
    const html = read(page);
    assert.ok(!/["']downloads\/[^"']+\.(exe|apk)["']/.test(html), `${page} ainda aponta para client/downloads`);
    for (const f of ["Vox.exe", "VoxPopuli.exe", "vox.apk", "vox-populi.apk"]) {
      assert.ok(html.includes(`releases/latest/download/${f}`), `${page} sem link da Release para ${f}`);
    }
  }
});

test("LAN-20: hashes SRI do inventário têm formato sha384 válido", () => {
  const hashes = [...INVENTORY.matchAll(/sha384-([A-Za-z0-9+/=]+)/g)].map((m) => m[1]);
  assert.ok(hashes.length >= 1);
  for (const h of hashes) assert.equal(Buffer.from(h, "base64").length, 48, `sha384-${h}`);
});
