import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as welcome from "../client/js/vox-welcome-profile.js";

test("vox-welcome-profile - route id and copy", () => {
  assert.equal(welcome.WELCOME_ROUTE_ID, "vx_voxbrasil_welcome");
  const p = welcome.getWelcomeProfile();
  assert.equal(p.name, "Vox Brasil");
  assert.ok(welcome.getWelcomeDmText().includes("Pessoas"));
  assert.equal(welcome.isWelcomeRouteId(welcome.WELCOME_ROUTE_ID), true);
});

test("vox-welcome-profile - welcome card seen flag", () => {
  localStorage.removeItem(welcome.WELCOME_CARD_SEEN_KEY);
  assert.equal(welcome.shouldShowWelcomeCard(), true);
  welcome.markWelcomeCardSeen();
  assert.equal(welcome.shouldShowWelcomeCard(), false);
});
