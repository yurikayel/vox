import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as oauth from "../client/js/oauth-profile.js";
import * as localAccount from "../client/js/local-account.js";

test("oauth-profile - skip marks step complete", () => {
  localStorage.clear();
  oauth.__resetOAuthConfigForTests();
  assert.equal(oauth.hasCompletedOAuthStep(), false);
  oauth.skipOAuthEnrichment();
  assert.equal(oauth.hasSkippedOAuth(), true);
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});

test("oauth-profile - enrichment counts as completed", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  localAccount.setProfileEnrichment({ displayName: "Test", oauthProvider: "google" });
  assert.equal(oauth.hasCompletedOAuthStep(), true);
});
