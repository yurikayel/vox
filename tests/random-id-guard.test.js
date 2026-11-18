/**
 * Teste-guarda: `Math.random` novo em `client/js/` só passa se estiver na lista permitida abaixo, com motivo.
 * Identificador novo usa `randomBase36` (`client/js/shared/html.js`). Conta pela árvore sintática (espree),
 * então comentário e texto não contam.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const jsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "js");

/**
 * Usos de `Math.random` permitidos em `client/js/`, por arquivo, com o número de ocorrências.
 * Só entra aqui o que NÃO gera identificador (interface, jitter, sorteio injetável). Identificador novo usa
 * `randomBase36` de `client/js/shared/html.js`.
 */
const ALLOWED_MATH_RANDOM = {
  // Sorteio das posições do quiz de confirmação da frase: UX, vem como parâmetro `random` e não gera id nem chave.
  "identity/account-phrase.js": 1,
};

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJs(full);
    return entry.name.endsWith(".js") ? [full] : [];
  });
}

/** Conta `Math.random` (chamada ou referência) pela árvore sintática, sem contar comentário nem texto. */
function countMathRandom(code) {
  let count = 0;
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    const isMember =
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" && node.object.name === "Math" &&
      ((!node.computed && node.property.name === "random") || (node.computed && node.property.value === "random"));
    if (isMember) count += 1;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(espree.parse(code, { ecmaVersion: "latest", sourceType: "module" }));
  return count;
}

test("guarda: Math.random em client/js/ só nos arquivos da lista permitida", () => {
  const found = {};
  for (const file of listJs(jsRoot)) {
    const count = countMathRandom(fs.readFileSync(file, "utf8"));
    if (count) found[path.relative(jsRoot, file).split(path.sep).join("/")] = count;
  }
  assert.deepEqual(found, ALLOWED_MATH_RANDOM, "Math.random novo? Para id use randomBase36; senão justifique na lista");
});

test("guarda: o detector acha Math.random e ignora comentário e texto", () => {
  assert.equal(countMathRandom("const a = Math.random() + Math['random']();"), 2);
  assert.equal(countMathRandom("const f = Math.random;"), 1);
  assert.equal(countMathRandom('// Math.random()\nconst s = "Math.random()";'), 0);
});
