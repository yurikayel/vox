/** @file Welcome onboarding after pact (no UI modals). */

import * as welcomeProfile from "../vox-welcome-profile.js";

export async function ensureOnboardingSideEffects(userRouteId) {
  if (!userRouteId || localStorage.getItem("vox-pact-accepted") !== "true") return;
  try {
    await welcomeProfile.runWelcomeOnboarding(userRouteId);
  } catch {
    /* ignore */
  }
}
