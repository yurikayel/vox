import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as i18n from "../client/js/i18n-pt-br.js";

test("i18n-pt-br - microcopy de edição/apagar e malha", () => {
  assert.match(i18n.localMutateEditDeleteTooltip, /aparelhos online/i);
  assert.match(i18n.localMutateEditDeleteTooltip, /malha/i);
  assert.match(i18n.localMutateEditDeleteHint, /aparelhos online/i);
  assert.match(i18n.localMutateComposerHint, /aparelhos online/i);
  assert.doesNotMatch(i18n.localMutateEditDeleteTooltip, /só neste aparelho/i);
  assert.doesNotMatch(i18n.localMutateEditDeleteHint, /Local imediato/i);
  assert.match(i18n.localMutateEditDeleteHint, /efeito imediato aqui/i);
  assert.match(i18n.localMutateUpdatedToast, /malha|aparelhos online/i);
  assert.match(i18n.localMutateDeletedToast, /malha|aparelhos online/i);
});

test("i18n-pt-br - descoberta na malha (V-MESH)", () => {
  assert.match(i18n.meshDiscoverableLabel, /busca da malha/i);
  assert.match(i18n.meshDiscoverableHint, /nome, foto|Se você quiser/i);
  assert.equal(i18n.peopleSectionMesh, "🔗🟢");
});

test("i18n-pt-br - microcopy feira (status e oferta)", () => {
  assert.match(i18n.listingMutateStatusTooltip, /malha|aparelhos online/i);
  assert.match(i18n.listingRetractLabel, /Retirar/i);
  assert.match(i18n.listingPublishedToast, /publicada/i);
  assert.match(i18n.listingStatusUpdatedToast, /Status/i);
  assert.match(i18n.listingRetractedToast, /retirada/i);
  assert.match(i18n.listingVerifiedBadgeTitle, /assinada|conferida neste aparelho/i);
});
