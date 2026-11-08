import test from "node:test";
import assert from "node:assert/strict";
import { hasChosenName } from "../client/js/people-index.js";

test("diretório: par da malha só com a chave não entra na lista", () => {
  assert.equal(hasChosenName({ routeId: "vx_6ir2sF_M-JEabc", name: "vx_6ir2sF_M-JE" }), false);
  assert.equal(hasChosenName({ routeId: "Wmp0V7S-po7C2rXYZ", name: "Wmp0V7S-po7C2r" }), false);
  assert.equal(hasChosenName({ routeId: "vx_abc", name: "" }), false);
});

test("diretório: par com nome escolhido aparece", () => {
  assert.equal(hasChosenName({ routeId: "vx_Mr2Hym123", name: "Yuri Kayel" }), true);
});
