import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as localAccount from "../client/js/local-account.js";
import * as peers from "../client/js/peers.js";
import * as attestation from "../client/js/contribution-attestation.js";

test("contribution-attestation - draft e assinatura ADR-001", async () => {
  localStorage.clear();
  peers.savePeerSettings({ enabled: true, maxMb: 25, wifiOnly: true, commOnly: false, dailyCapMb: 50 });
  localStorage.setItem(
    "vox-peer-metrics",
    JSON.stringify({ blobsServed: 3, bytesServed: 4096, blobsServedRtc: 1 }),
  );

  const draft = attestation.buildAttestationDraft();
  assert.equal(draft.type, "contribution-attestation");
  assert.equal(draft.schemaVersion, 0);
  assert.equal(draft.metrics.blobsServed, 3);

  const signed = await localAccount.signPayload(draft);
  assert.equal(attestation.validateContributionAttestation(signed).ok, true);
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("contribution-attestation - rate limit de export", async () => {
  localStorage.clear();
  attestation.markExportDone(Date.now());
  assert.ok(attestation.getExportCooldownRemainingMs() > 0);

  const blocked = await attestation.buildSignedContributionAttestation();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "rate-limit");

  localStorage.removeItem("vox-contribution-attestation-last-export");
  const ok = await attestation.buildSignedContributionAttestation();
  assert.equal(ok.ok, true);
  assert.equal(ok.signed.type, "contribution-attestation");
});

test("contribution-attestation - rejeita tipo inválido", () => {
  assert.equal(attestation.validateContributionAttestation({ type: "other", schemaVersion: 0, metrics: {} }).ok, false);
});
