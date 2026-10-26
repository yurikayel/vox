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
  assert.doesNotMatch(i18n.localMutateEditDeleteHint, /Local imediato/i);
  assert.match(i18n.localMutateEditDeleteHint, /efeito imediato aqui/i);
  assert.match(i18n.localMutateUpdatedToast, /malha|pares online/i);
  assert.match(i18n.localMutateDeletedToast, /malha|pares online/i);
});

test("i18n-pt-br - descoberta na malha (V-MESH)", () => {
  assert.match(i18n.meshDiscoverableLabel, /busca da malha/i);
  assert.match(i18n.meshDiscoverableHint, /cartão assinado|opt-in/i);
  assert.match(i18n.peopleSectionMesh, /malha/i);
});

test("i18n-pt-br - microcopy feira gossip (status / retratação)", () => {
  assert.match(i18n.listingMutateStatusTooltip, /GOSSIP_UPDATE|gossip/i);
  assert.match(i18n.listingRetractLabel, /Retirar/i);
  assert.match(i18n.listingPublishedToast, /publicada/i);
  assert.match(i18n.listingStatusUpdatedToast, /Status/i);
  assert.match(i18n.listingRetractedToast, /retirada/i);
  assert.match(i18n.listingVerifiedBadgeTitle, /assinada|verifyPayload/i);
});
