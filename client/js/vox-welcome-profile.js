/** Perfil sistema Vox Brasil — primeiro contato (V-DIS). */

import * as cacheNode from "./cache-node.js";
import * as social from "./social.js";

export const WELCOME_ROUTE_ID = "vx_voxbrasil_welcome";

export const WELCOME_CARD_SEEN_KEY = "vox-welcome-card-seen";
export const WELCOME_DM_SEED_KEY = "vox-welcome-dm-seeded";

export function getWelcomeProfile() {
  return {
    routeId: WELCOME_ROUTE_ID,
    name: "Vox Brasil",
    handle: "voxbrasil",
    bio: "Contato inicial — onboarding, pessoas e ajuda na rede comunitária.",
    avatar: "./icons/icon.svg",
    readme:
      "Bem-vindo ao Vox. Explore comunidades, adicione contatos em **Pessoas** e configure sua participação na malha em Configurações → Sua rede.",
    isSystem: true,
  };
}

export function getWelcomeDmText() {
  return (
    "Olá! Sou o contato inicial do Vox Brasil. " +
    "Use Pessoas para achar gente, ou compartilhe seu link #/connect/seu_vx_. " +
    "Dúvidas de rede: Configurações → Sua rede."
  );
}

export function markWelcomeCardSeen() {
  try {
    localStorage.setItem(WELCOME_CARD_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function shouldShowWelcomeCard() {
  try {
    return localStorage.getItem(WELCOME_CARD_SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

export function isWelcomeRouteId(routeId) {
  return String(routeId || "") === WELCOME_ROUTE_ID;
}

export async function ensureWelcomeDmSeed(myRouteId) {
  if (!myRouteId || localStorage.getItem(WELCOME_DM_SEED_KEY)) return;
  await cacheNode.saveDmMessage({
    id: "welcome-dm-vox-brasil-v1",
    peerAddress: WELCOME_ROUTE_ID,
    from: WELCOME_ROUTE_ID,
    to: myRouteId,
    text: getWelcomeDmText(),
    ts: Date.now(),
    status: "received",
  });
  localStorage.setItem(WELCOME_DM_SEED_KEY, "1");
}

export function ensureWelcomeWatch() {
  if (!social.getWatchedProfiles().includes(WELCOME_ROUTE_ID)) {
    social.toggleWatch(WELCOME_ROUTE_ID);
  }
}

export async function runWelcomeOnboarding(myRouteId) {
  await ensureWelcomeDmSeed(myRouteId);
  ensureWelcomeWatch();
}
