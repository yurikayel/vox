import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { advanceTime, createDefaultCalendar, formatInWorldDate } from "../client/js/dungeon/vtt-calendar.js";

test("calendário: avança rodada e +10 min", () => {
  const cal = createDefaultCalendar({ minuteOfDay: 600 });
  const r1 = advanceTime(cal, "round");
  assert.equal(r1.calendar.totalRounds, 1);
  const r2 = advanceTime(r1.calendar, "minutes_10");
  assert.ok(r2.calendar.minuteOfDay >= 610);
  assert.match(formatInWorldDate(r2.calendar), /Ano 1/);
});

test("calendário: descanso longo avança 8h", () => {
  const cal = createDefaultCalendar({ minuteOfDay: 0 });
  const { calendar } = advanceTime(cal, "long_rest");
  assert.equal(calendar.minuteOfDay, 8 * 60);
});