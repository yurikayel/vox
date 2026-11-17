/**
 * CODEOWNERS sem caminho morto (PM-110). Quando um arquivo sensível muda de pasta (ex.: `identity/`, `vault/`,
 * ADR-035), a linha antiga do CODEOWNERS para de casar com qualquer arquivo e a área perde a marca de sensível
 * sem ninguém notar. As linhas de `client/js/` são também o Tier A dos testes (docs/TESTES.md §3.3).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codeowners = fs.readFileSync(path.join(root, ".github", "CODEOWNERS"), "utf8");

/** Padrões do CODEOWNERS (primeira coluna), sem comentários, linhas vazias e o curinga geral `*`. */
const patterns = codeowners
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split(/\s+/)[0])
  .filter((pattern) => pattern !== "*");

test("codeowners: há linhas específicas além do curinga geral", () => {
  assert.ok(patterns.length >= 5, `esperava as linhas de cripto, cofre e relay; achei ${patterns.length}`);
});

test("codeowners: padrões são caminhos literais a partir da raiz", () => {
  const bad = patterns.filter((p) => !p.startsWith("/") || /[*?[\]]/.test(p));
  assert.deepEqual(bad, [], "use caminho absoluto sem curinga (pasta termina em /) para o teste poder conferir");
});

test("codeowners: todo caminho existe no repositório", () => {
  const dead = patterns.filter((p) => !fs.existsSync(path.join(root, p.replace(/^\//, ""))));
  assert.deepEqual(dead, [], "caminho morto no CODEOWNERS: o arquivo mudou de pasta? Aponte para o novo lugar");
});

test("codeowners: pasta e arquivo batem com a forma da linha", () => {
  const wrong = patterns.filter((p) => {
    const abs = path.join(root, p.replace(/^\//, ""));
    return fs.existsSync(abs) && fs.statSync(abs).isDirectory() !== p.endsWith("/");
  });
  assert.deepEqual(wrong, [], "pasta precisa terminar em / e arquivo não");
});

test("codeowners: identidade, cofre, assinatura e DM estão marcados (Tier A)", () => {
  for (const required of ["/client/js/identity/", "/client/js/vault/", "/client/js/sig-format.js", "/client/js/crypto-dm.js"]) {
    assert.ok(patterns.includes(required), `${required} precisa estar no CODEOWNERS`);
  }
});
