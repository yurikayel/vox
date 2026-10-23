import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as i18n from "../client/js/i18n-pt-br.js";

test("i18n-pt-br - microcopy pós-gossip de retratação na malha", () => {
  assert.match(i18n.localMutateEditDeleteTooltip, /pares online/i);
  assert.match(i18n.localMutateEditDeleteTooltip, /gossip|malha/i);
  assert.match(i18n.localMutateEditDeleteHint, /pares online/i);
  assert.match(i18n.localMutateComposerHint, /pares online/i);
  assert.doesNotMatch(i18n.localMutateEditDeleteTooltip, /só neste aparelho/i);
});
