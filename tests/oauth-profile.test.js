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

test("oauth-profile - signInWithGithub enriches profile from github api", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.github.com/users/devbrasil")) {
      return {
        ok: true,
        json: async () => ({
          login: "devbrasil",
          name: "Dev Brasil",
          avatar_url: "https://github.com/devbrasil.png",
          bio: "FOSS e Soberania Digital",
        }),
      };
    }
    return { ok: false };
  };

  try {
    const res = await oauth.signInWithGithub("devbrasil");
    assert.equal(res.ok, true);
    assert.equal(res.profile.displayName, "Dev Brasil");
    assert.equal(res.profile.avatarUrl, "https://github.com/devbrasil.png");
    assert.equal(res.profile.handle, "devbrasil");

    const enrichment = localAccount.getProfileEnrichment();
    assert.equal(enrichment.displayName, "Dev Brasil");
    assert.equal(enrichment.oauthProvider, "github");
    assert.equal(localStorage.getItem("vox-profile-github"), "devbrasil");
    assert.equal(oauth.hasCompletedOAuthStep(), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});
