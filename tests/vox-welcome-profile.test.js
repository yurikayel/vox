import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

import * as welcome from "../client/js/vox-welcome-profile.js";

test("vox-welcome-profile - route id and copy", () => {
  assert.equal(welcome.WELCOME_ROUTE_ID, "vx_voxbrasil_welcome");
  const p = welcome.getWelcomeProfile();
  assert.equal(p.name, "Vox Brasil");
  assert.equal(p.handle, "voxbrasil");
  assert.equal(p.avatar, welcome.OFFICIAL_PROFILE_AVATAR);
  assert.ok(p.avatar.includes("profile-vox-official-512.png"));
  assert.ok(p.isOfficialPlatform);
  assert.ok(welcome.getWelcomeDmText().includes("Voxpedia"));
  assert.ok(welcome.getWelcomeDmText().includes("👋"));
  assert.equal(welcome.isWelcomeRouteId(welcome.WELCOME_ROUTE_ID), true);
});

test("vox-welcome-profile - intro seen and feed hint", () => {
  localStorage.removeItem(welcome.WELCOME_DM_INTRO_SEEN_KEY);
  localStorage.removeItem(welcome.WELCOME_CARD_SEEN_KEY);
  localStorage.removeItem(welcome.WELCOME_DM_SEED_KEY);

  assert.equal(welcome.shouldShowWelcomeFeedHint(), false);

  localStorage.setItem(welcome.WELCOME_DM_SEED_KEY, "1");
  assert.equal(welcome.shouldShowWelcomeFeedHint(), true);

  welcome.markWelcomeIntroSeen();
  assert.equal(welcome.shouldShowWelcomeFeedHint(), false);
  assert.equal(welcome.shouldShowWelcomeCard(), false);
});

test("vox-welcome-profile - legacy card flag migrates to intro seen", () => {
  localStorage.removeItem(welcome.WELCOME_DM_INTRO_SEEN_KEY);
  localStorage.removeItem(welcome.WELCOME_CARD_SEEN_KEY);
  localStorage.setItem(welcome.WELCOME_DM_SEED_KEY, "1");
  localStorage.setItem(welcome.WELCOME_CARD_SEEN_KEY, "1");

  assert.equal(welcome.shouldShowWelcomeFeedHint(), false);
  welcome.markWelcomeCardSeen();
  assert.equal(localStorage.getItem(welcome.WELCOME_DM_INTRO_SEEN_KEY), "1");
});
