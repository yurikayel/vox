/**
 * PM-11 — o arweave é servido pelo próprio site (client/vendor/), com bytes idênticos ao bundle
 * anotado em docs/DEPENDENCIAS.md. Não acessa a rede: a transação é montada com last_tx e reward fixos.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = "client/vendor/arweave-1.15.7.bundle.js";
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("PM-11: bundle vendorizado tem o sha384 anotado no inventário", () => {
  const line = read("docs/DEPENDENCIAS.md").split("\n").find((l) => l.includes(VENDOR));
  assert.ok(line, `docs/DEPENDENCIAS.md precisa de uma linha para ${VENDOR}`);
  const pinned = line.match(/sha384-[A-Za-z0-9+/=]+/)?.[0];
  const actual = `sha384-${createHash("sha384").update(readFileSync(join(ROOT, VENDOR))).digest("base64")}`;
  assert.equal(actual, pinned, "o arquivo vendorizado mudou: revise antes de atualizar o hash");
});

test("PM-11: bundle é autocontido (não importa nada de fora)", () => {
  const src = read(VENDOR);
  assert.doesNotMatch(src, /\bimport\s*\(\s*["'`]/);
  assert.doesNotMatch(src, /\bfrom\s*["'`]https?:/);
});

test("PM-11: o carregador aponta para o vendor; upload.js e wallet.js usam o carregador; CSP sem esm.sh", async () => {
  const { ARWEAVE_BUNDLE_URL } = await import("../client/js/arweave-lib.js");
  const resolved = new URL(ARWEAVE_BUNDLE_URL, pathToFileURL(join(ROOT, "client/js/arweave-lib.js")));
  assert.equal(fileURLToPath(resolved), join(ROOT, VENDOR));
  for (const file of ["client/js/upload.js", "client/js/wallet.js"]) {
    assert.match(read(file), /import \{ loadArweave \} from "\.\/arweave-lib\.js"/, file);
    assert.doesNotMatch(read(file), /import\(\s*["'`]https?:/, file);
  }
  for (const file of ["client/_headers", "client/index.html"]) assert.doesNotMatch(read(file), /esm\.sh/, file);
});

test("PM-11: o bundle assina e verifica uma transação sem rede", { timeout: 30000 }, async () => {
  const mod = await import(pathToFileURL(join(ROOT, VENDOR)).href);
  const Arweave = mod.default || mod;
  const ar = Arweave.init({ host: "127.0.0.1", port: 9, protocol: "http", timeout: 500 });
  const jwk = await ar.wallets.generate();
  const data = new TextEncoder().encode("vox");
  const tx = await ar.createTransaction({ data, last_tx: "", reward: "0" }, jwk);
  tx.addTag("App-Name", "vox-brasil");
  await ar.transactions.sign(tx, jwk);
  assert.equal(await ar.transactions.verify(tx), true);
  assert.equal(ar.ar.winstonToAr("1500000000000"), "1.500000000000");
});
