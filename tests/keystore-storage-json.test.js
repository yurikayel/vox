/**
 * @file `readStoredRecord` rejeita JSON que não é mapa plano (PR #214 / lobby Bloco A).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readStoredRecord, writeStoredJson } from "../client/js/identity/keystore.js";

const KEY = "vox-test-read-stored-record";

test.afterEach(() => {
  localStorage.removeItem(KEY);
});

test("readStoredRecord devolve fallback para array no topo", () => {
  localStorage.setItem(KEY, "[1,2,3]");
  assert.deepEqual(readStoredRecord(KEY, { ok: true }), { ok: true });
});

test("readStoredRecord devolve mapa para objeto plano", () => {
  writeStoredJson(KEY, { a: 1 });
  assert.deepEqual(readStoredRecord(KEY), { a: 1 });
});