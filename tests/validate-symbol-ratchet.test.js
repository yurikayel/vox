/**
 * @file O `npm run validate` roda a catraca por símbolo (`audit:symbols`, PM-116). Sem isso, um símbolo que piora contra
 * `origin/develop` só reprovava se alguém lembrasse de rodar o comando à mão. Lê o `package.json` e confere que o
 * `validate` chama `npm run audit:symbols` e que isso vem antes de `npm test` (a barreira mais barata falha primeiro).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
/** Passos do `validate`, separados por `&&`. */
const steps = pkg.scripts.validate.split("&&").map((s) => s.trim());

describe("validate roda a catraca por símbolo", () => {
  it("o validate chama npm run audit:symbols", () => {
    assert.ok(steps.includes("npm run audit:symbols"), `validate sem audit:symbols: ${pkg.scripts.validate}`);
  });

  it("audit:symbols vem antes de npm test", () => {
    const symbols = steps.indexOf("npm run audit:symbols");
    const tests = steps.indexOf("npm test");
    assert.ok(symbols >= 0, "validate sem audit:symbols");
    assert.ok(tests >= 0, "validate sem npm test");
    assert.ok(symbols < tests, `audit:symbols (passo ${symbols + 1}) deve vir antes de npm test (passo ${tests + 1})`);
  });

  it("o script audit:symbols existe e aponta para a catraca", () => {
    assert.equal(pkg.scripts["audit:symbols"], "node scripts/symbol-ratchet.mjs");
  });
});
