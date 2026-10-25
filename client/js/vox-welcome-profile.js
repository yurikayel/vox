/** Perfil oficial da plataforma Vox Brasil — primeiro contato (V-DIS). */

import * as cacheNode from "./cache-node.js";
import * as social from "./social.js";

export const WELCOME_ROUTE_ID = "vx_voxbrasil_welcome";

/** Avatar institucional: logo branco em tile opaco, squircle (light/dark). */
export const OFFICIAL_PROFILE_AVATAR = "./icons/profile-vox-official-512.png";

export const WELCOME_CARD_SEEN_KEY = "vox-welcome-card-seen";
export const WELCOME_DM_SEED_KEY = "vox-welcome-dm-seeded-v2";

export function getWelcomeProfile() {
  return {
    routeId: WELCOME_ROUTE_ID,
    name: "Vox Brasil",
    handle: "voxbrasil",
    bio:
      "Conta oficial da plataforma — voz institucional, novidades e ajuda na rede. " +
      "Não é perfil de pessoa: é o canal do Vox com você. 📣",
    avatar: OFFICIAL_PROFILE_AVATAR,
    readme:
      "Somos a **conta oficial** do Vox Brasil: onboarding, dicas de rede e links úteis.\n\n" +
      "- **Pessoas** — busca local e deep links `#/connect/seu_vx_`\n" +
      "- **Sua rede** — Configurações → malha comunitária\n" +
      "- **Voxpedia** — glossário leigo em [#/voxpedia](#/voxpedia)\n\n" +
      "Dúvidas? Mande DM por aqui — respondemos com orientação, não como suporte bancário.",
    isSystem: true,
    isOfficialPlatform: true,
  };
}

export function getWelcomeDmText() {
  return (
    "Olá! 👋 Sou a conta oficial do Vox Brasil — sua voz de boas-vindas na plataforma. " +
    "Use **Pessoas** para achar gente ou compartilhe `#/connect/seu_vx_`. " +
    "Glossário leigo: **Voxpedia** (#/voxpedia). Rede: Configurações → Sua rede."
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
    id: "welcome-dm-vox-brasil-v2",
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
