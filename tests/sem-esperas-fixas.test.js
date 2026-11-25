/**
 * @file Catraca de esperas fixas nos testes (fora de VTT/Fairplay/Diorama, que têm `settlePeers`): o total não pode
 * crescer. Conta `new Promise((r) => setTimeout(r, N))` escrito no corpo e as chamadas de helpers de seta que embrulham
 * `setTimeout` (`const settle = (ms) => new Promise(...)`), que o padrão literal não via. Espera por condição usa
 * `waitUntil` (`tests/helpers/wait-until.js`); dormir tempo fixo falha sob carga. Os restantes são timers simulados,
 * ordenação de partida entre pares ou provas de ausência sem barreira observável.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const SLEEP = /new Promise\(\((r|res|resolve)\) => setTimeout\(\1, \d+\)\)/g;
const HELPER_DEF = /\bconst (\w+) = (?:async )?\([^)]*\) => new Promise\(\((\w+)\) => setTimeout\(\2, [^)]*\)\)/g;
const EXCLUDED = /vtt-sync|fairplay|diorama|sem-esperas-fixas/;
/** Medido com helpers contados: 41 (eram 51; 10 convertidas para `waitUntil` em lead-tab, círculos, aviso consultivo e explode; antes, 15 só nos 5 helpers apontados, antes de converter 8 delas). */
const CEILING = 41;

/** Conta esperas fixas de um texto: literais mais chamadas (não a definição) de helpers de seta que dormem. */
export function countSleepsIn(src) {
  const literal = (src.match(SLEEP) || []).length;
  const helpers = [...src.matchAll(HELPER_DEF)].map((m) => m[1]);
  const calls = helpers.reduce((sum, name) => sum + (src.match(new RegExp(String.raw`\b${name}\(`, "g")) || []).length, 0);
  return literal + calls;
}

function countSleeps() {
  const perFile = {};
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".test.js") && !EXCLUDED.test(n))) {
    const n = countSleepsIn(readFileSync(DIR + f, "utf8"));
    if (n) perFile[f] = n;
  }
  return perFile;
}

test("esperas fixas fora de VTT/Fairplay não crescem além do medido", () => {
  const perFile = countSleeps();
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);
  assert.ok(total <= CEILING, `${total} esperas fixas > ${CEILING}: use waitUntil. ${JSON.stringify(perFile)}`);
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
