/**
 * @file Orçamento do núcleo Diorama B1 (spec Subversus v0 §9) como catraca: o peso medido hoje é o teto e
 * não pode crescer. O teto da spec (12 KB gzip, 25 KB de fonte) está estourado desde a entrada de fog,
 * standees e gestos no núcleo; ver a emenda da spec. Escopo: os cinco arquivos do núcleo, com o gzip somado
 * arquivo a arquivo (o que o navegador baixa). A pasta inteira é só informativa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = new URL("../client/js/dungeon/diorama/", import.meta.url);
const CORE = ["math", "geom", "camera", "gl", "view"].map((n) => `diorama-${n}.js`);

/** Medido em 2026-11-25 (gzip nível 9). O gzip tem folga de 64 B para variação de build do zlib entre versões do Node. */
const CEILING = { sourceBytes: 41_842, gzipBytes: 14_334 + 64 };
const SPEC = { sourceBytes: 25 * 1024, gzipBytes: 12 * 1024 };

function measure(files) {
  const bufs = files.map((f) => readFileSync(join(fileURLToPath(DIR), f)));
  return {
    sourceBytes: bufs.reduce((n, b) => n + b.length, 0),
    gzipBytes: bufs.reduce((n, b) => n + gzipSync(b, { level: 9 }).length, 0),
  };
}

test("diorama orçamento: o núcleo B1 (5 arquivos) não cresce além do medido", () => {
  const core = measure(CORE);
  assert.ok(core.sourceBytes <= CEILING.sourceBytes, `fonte do núcleo ${core.sourceBytes} B > ${CEILING.sourceBytes} B`);
  assert.ok(core.gzipBytes <= CEILING.gzipBytes, `gzip do núcleo ${core.gzipBytes} B > ${CEILING.gzipBytes} B`);
});

test("diorama orçamento: a catraca nunca fica acima do que a spec já tolerava antes do estouro", () => {
  assert.ok(CEILING.sourceBytes > SPEC.sourceBytes && CEILING.gzipBytes > SPEC.gzipBytes, "teto da spec voltou a valer: troque a catraca pelo teto da spec");
});

test("diorama orçamento: todo arquivo do núcleo existe e a pasta inteira é medida (informativo)", () => {
  const all = readdirSync(new URL("../client/js/dungeon/diorama/", import.meta.url)).filter((f) => f.endsWith(".js"));
  for (const f of CORE) assert.ok(all.includes(f), `${f} sumiu do núcleo`);
  const whole = measure(all);
  assert.ok(whole.sourceBytes > 0 && whole.gzipBytes > 0);
  console.log(`diorama: núcleo ${JSON.stringify(measure(CORE))} · pasta inteira (${all.length} arquivos) ${JSON.stringify(whole)}`);
});
