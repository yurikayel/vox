/** @file Welcome onboarding after pact (no UI modals). */

import * as welcomeProfile from "../vox-welcome-profile.js";

/**
 * Efeitos colaterais pós-pacto (perfil de boas-vindas e seed de DM), sem modais extras.
 *
 * @param {string} userRouteId Rota da conta local.
 * @returns {Promise<{dmJustSeeded: boolean}>} Resultado de `runWelcomeOnboarding` ou fallback seguro.
 */
export async function ensureOnboardingSideEffects(userRouteId) {
  if (!userRouteId || localStorage.getItem("vox-pact-accepted") !== "true") {
    return { dmJustSeeded: false };
  }
  try {
    return await welcomeProfile.runWelcomeOnboarding(userRouteId);
  } catch {
    return { dmJustSeeded: false };
  }
}
