import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as i18n from "../client/js/i18n-pt-br.js";

test("i18n-pt-br - microcopy honesta até gossip de retratação", () => {
  assert.match(i18n.localMutateEditDeleteTooltip, /aparelho/i);
  assert.match(i18n.localMutateEditDeleteTooltip, /gossip/i);
  assert.match(i18n.localMutateEditDeleteHint, /pares online/i);
  assert.match(i18n.localMutateComposerHint, /aparelho/i);
});
