/**
 * @file Catraca de esperas fixas nos testes, contada pela árvore sintática (ver `tests/helpers/sleep-ast.js`) em todos os
 * `.js`/`.mjs` de `tests/`, subpastas incluídas: o total não pode crescer. Espera por condição usa `waitUntil`
 * (`tests/helpers/wait-until.js`, a única implementação autorizada de laço com `setTimeout`); dormir tempo fixo falha sob
 * carga. Os restantes são timers simulados, ordenação de partida entre pares, provas de ausência sem barreira
 * observável e o `realSleep(4)` do relógio virtual do Fairplay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { countSleepsIn } from "./helpers/sleep-ast.js";
import { drainMicrotasks } from "./helpers/wait-until.js";

const DIR = fileURLToPath(new URL(".", import.meta.url));
/** A catraca em si e a implementação de `waitUntil` (o laço de condição autorizado) não entram na conta. */
const EXCLUDED = new Set(["sem-esperas-fixas.test.js", "helpers/wait-until.js"]);
/**
 * Medido por AST em `tests/` inteiro: 37 (eram 33 só em `*.test.js` da raiz; os helpers `.mjs` somam 4: três laços fixos de
 * `setImmediate` para drenar promessas soltas em `cov-t2/t3/t5-dom` e a janela de silêncio de 80 ms de `settleToasts`;
 * o `waitFor` de `cov-t5-dom` virou `waitUntil`). Nenhuma das formas novas (`promisify`, `scheduler`, `require`, `setInterval`,
 * `globalThis.setTimeout`) aparece hoje nos testes: o teto cresce só pelo que passou a ser varrido.
 * SUB-20, fatia 1: 37 → 30. Provas de ausência sobre stubs em memória (`cov-t1-circles`, `cov-t1-home-more`,
 * `cov-t6-explode-events`, `cov-t6-photo-lightbox`) passaram a `drainMicrotasks` (sem relógio), e `cov-t6-contact-notify`
 * espera um contato sentinela em vez de dormir. Seguem com timer real, por usar E/S ou criptografia reais:
 * `cov-t6-post-more-menu` e `cov-t7-labs-webxdc`.
 */
const CEILING = 30;

function listSources(dir = DIR, rel = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = rel + entry.name;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSources(`${dir}${entry.name}/`, `${path}/`);
    return /\.(m?js)$/.test(entry.name) && !EXCLUDED.has(path) ? [path] : [];
  });
}

function countSleeps() {
  const perFile = {};
  for (const f of listSources()) {
    const n = countSleepsIn(readFileSync(DIR + f, "utf8"));
    if (n) perFile[f] = n;
  }
  return perFile;
}

test("esperas fixas nos testes não crescem além do medido", () => {
  const perFile = countSleeps();
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);
  assert.ok(total <= CEILING, `${total} esperas fixas > ${CEILING}: use waitUntil. ${JSON.stringify(perFile)}`);
});

test("a varredura chega às subpastas e aos .mjs de tests/", () => {
  const files = listSources();
  assert.ok(files.some((f) => f.endsWith(".mjs")), "há .mjs varridos");
  assert.ok(files.some((f) => f.includes("/")), "há subpastas varridas");
  assert.ok(!files.includes("helpers/wait-until.js") && !files.includes("sem-esperas-fixas.test.js"));
});

test("um helper settle(ms) plantado é contado (chamadas, não a definição)", () => {
  const planted = [
    "const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));",
    "await settle(); await settle(20);",
  ].join("\n");
  assert.equal(countSleepsIn(planted), 2);
  assert.equal(countSleepsIn("await new Promise((r) => setTimeout(r, 50));"), 1);
  assert.equal(countSleepsIn("await waitUntil(() => ok);"), 0);
});

const T = 'import { setTimeout as sleep } from "node:timers/promises";\n';

test("timers/promises: import com apelido, namespace, require e import() dinâmico", () => {
  assert.equal(countSleepsIn(`${T}await sleep(4);`), 1);
  assert.equal(countSleepsIn('import * as t from "node:timers/promises";\nawait t.setTimeout(5);'), 1);
  assert.equal(countSleepsIn('const { setTimeout: nap } = require("node:timers/promises");\nawait nap(1); await nap(2);'), 2);
  assert.equal(countSleepsIn('const timers = require("timers/promises");\nawait timers.setTimeout(3);'), 1);
  assert.equal(countSleepsIn('await require("node:timers/promises").setTimeout(3);'), 1);
  assert.equal(countSleepsIn('const { setTimeout: nap } = await import("node:timers/promises");\nawait nap(1);'), 1);
});

test("promisify(setTimeout), direto ou em helper, e scheduler.wait", () => {
  assert.equal(countSleepsIn('import { promisify } from "node:util";\nconst sleep = promisify(setTimeout);\nawait sleep(1); await sleep(2);'), 2);
  assert.equal(countSleepsIn('import util from "node:util";\nawait util.promisify(setTimeout)(5);'), 1);
  assert.equal(countSleepsIn('const sleep = promisify(setTimeout);'), 0, "a definição sem chamadas não conta");
  assert.equal(countSleepsIn('import { scheduler } from "node:timers/promises";\nawait scheduler.wait(10);'), 1);
  assert.equal(countSleepsIn('import * as t from "node:timers/promises";\nawait t.scheduler.wait(10);'), 1);
});

test("callee membro dentro de new Promise: globalThis, global, timers e setInterval", () => {
  assert.equal(countSleepsIn("await new Promise((r) => globalThis.setTimeout(r, 5));"), 1);
  assert.equal(countSleepsIn("await new Promise((r) => global.setTimeout(r, 5));"), 1);
  assert.equal(countSleepsIn('import timers from "node:timers";\nawait new Promise((r) => timers.setTimeout(r, 5));'), 1);
  assert.equal(countSleepsIn("await new Promise((r) => { const id = setInterval(() => { clearInterval(id); r(); }, 10); });"), 1);
  assert.equal(countSleepsIn("await new Promise((r) => other.setTimeout(r, 5));"), 0, "objeto desconhecido não é temporizador");
});

test("setImmediate conta quando se repete (laço, forEach/map, recursão, scheduler.yield) e não quando é só barreira", () => {
  assert.equal(countSleepsIn("await new Promise((r) => setImmediate(r));"), 0);
  assert.equal(countSleepsIn("for (let i = 0; i < 9; i += 1) await new Promise((r) => setImmediate(r));"), 1);
  assert.equal(countSleepsIn("[1, 2].forEach(async () => { await new Promise((r) => setImmediate(r)); });"), 1);
  assert.equal(countSleepsIn("await Promise.all(xs.map(async () => { await new Promise((r) => setImmediate(r)); }));"), 1);
  assert.equal(countSleepsIn("const drain = async () => { await new Promise((r) => setImmediate(r)); if (busy()) await drain(); };"), 1);
  assert.equal(countSleepsIn("async function drain() { await new Promise((r) => setImmediate(r)); if (busy()) await drain(); }"), 1);
  assert.equal(countSleepsIn('import { setImmediate as tick } from "node:timers/promises";\nwhile (busy()) await tick();'), 1);
  assert.equal(countSleepsIn('import { scheduler } from "node:timers/promises";\nwhile (busy()) await scheduler.yield();'), 1);
  assert.equal(countSleepsIn('import { scheduler } from "node:timers/promises";\nawait scheduler.yield();'), 0);
});

test("não conta o que não é espera: outro módulo, definição sem chamadas, condição", () => {
  assert.equal(countSleepsIn('import { setTimeout as sleep } from "node:fs";\nawait sleep(1);'), 0);
  assert.equal(countSleepsIn("const settle = () => new Promise((r) => setTimeout(r, 10));"), 0);
  assert.equal(countSleepsIn("await waitUntil(() => ok);"), 0);
});

test("drainMicrotasks termina cadeias de promessas já resolvidas e não é espera fixa", async () => {
  let done = false;
  Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => { done = true; });
  await drainMicrotasks();
  assert.equal(done, true);
  assert.equal(countSleepsIn("await drainMicrotasks();"), 0);
});
