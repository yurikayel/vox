/**
 * @file Testes de formatação pt-BR centralizada (`shared/date-format.js`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as aviso from "../client/js/aviso.js";

test("date-format: aviso com eventAt inválido não vaza Invalid Date", () => {
  const text = aviso.buildAvisoShareText({
    aviso: { title: "Reunião", body: "", eventAt: NaN },
    communityName: "Vila",
  });
  assert.doesNotMatch(text, /Invalid Date/i);
  assert.doesNotMatch(text, /^Quando:/m);
});

test("date-format: parseInstant rejeita lixo e aceita ms", async () => {
  const df = await import("../client/js/shared/date-format.js");
  assert.equal(df.parseInstant(null), null);
  assert.equal(df.parseInstant("invalido"), null);
  assert.equal(df.parseInstant(NaN), null);
  const ts = new Date(2026, 9, 26, 9, 30).getTime();
  assert.equal(df.parseInstant(ts)?.getTime(), ts);
});

test("date-format: absoluto DD/MM/AAAA e data-hora", async () => {
  const df = await import("../client/js/shared/date-format.js");
  const ts = new Date(2026, 9, 26, 9, 30).getTime();
  assert.equal(df.formatAbsoluteDate(ts), "26/10/2026");
  assert.equal(df.formatAbsoluteDateTime(ts), "26/10/2026 09:30");
  assert.equal(df.formatAbsoluteDate(null), "");
  assert.equal(df.formatAbsoluteDateTime("invalid"), "");
});

test("date-format: estilos Intl não vazam Invalid Date", async () => {
  const df = await import("../client/js/shared/date-format.js");
  assert.equal(df.formatPtBrDateTimeShort(NaN), "");
  assert.equal(df.formatPtBrDateTimeFull(NaN), "");
  assert.equal(df.formatPtBrDateOnly(NaN), "");
  const ts = Date.UTC(2026, 5, 15, 14, 0);
  assert.match(df.formatPtBrDateTimeShort(ts), /\d/);
  assert.match(df.formatPtBrDateTimeFull(ts), /\d/);
  assert.match(df.formatPtBrDateOnly(ts), /\d/);
});