/**
 * @file Catraca de esperas fixas nos testes (fora de VTT/Fairplay/Diorama, que têm `settlePeers`): o total de
 * `await new Promise((r) => setTimeout(r, N))` não pode crescer. Espera por condição usa `waitUntil`
 * (`tests/helpers/wait-until.js`); dormir tempo fixo falha sob carga. Os restantes são timers simulados
 * (trabalho que dura N ms), laços de polling já limitados ou provas de ausência sem barreira disponível.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const SLEEP = /new Promise\(\((r|res|resolve)\) => setTimeout\(\1, \d+\)\)/g;
const EXCLUDED = /vtt-sync|fairplay|diorama|sem-esperas-fixas/;
/** Medido após trocar 16 esperas por `waitUntil` (antes: 44). */
const CEILING = 28;

function countSleeps() {
  const perFile = {};
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".test.js") && !EXCLUDED.test(n))) {
    const n = (readFileSync(DIR + f, "utf8").match(SLEEP) || []).length;
    if (n) perFile[f] = n;
  }
  return perFile;
}

test("esperas fixas fora de VTT/Fairplay não crescem além do medido", () => {
  const perFile = countSleeps();
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);
  assert.ok(total <= CEILING, `${total} esperas fixas > ${CEILING}: use waitUntil. ${JSON.stringify(perFile)}`);
});
