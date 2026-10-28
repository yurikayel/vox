/** Perfil oficial da plataforma Vox — primeiro contato (V-DIS). */

import * as cacheNode from "./cache-node.js";
import * as social from "./social.js";

export const WELCOME_ROUTE_ID = "vx_voxbrasil_welcome";

/** Avatar institucional: logo branco em tile opaco, squircle (light/dark). */
export const OFFICIAL_PROFILE_AVATAR = "./icons/profile-vox-official-512.png";

/** @deprecated Card removido — migrado para intro via DM. */
export const WELCOME_CARD_SEEN_KEY = "vox-welcome-card-seen";
export const WELCOME_DM_INTRO_SEEN_KEY = "vox-welcome-dm-intro-seen";
export const WELCOME_DM_SEED_KEY = "vox-welcome-dm-seeded-v3";

export function getWelcomeProfile() {
  return {
    routeId: WELCOME_ROUTE_ID,
    name: "Vox",
    handle: "vox",
    bio:
      "Conta oficial da plataforma — voz institucional, novidades e ajuda na rede. " +
      "Não é perfil de pessoa: é o canal do Vox com você. 📣",
    avatar: OFFICIAL_PROFILE_AVATAR,
    readme:
      "Somos a **conta oficial** do Vox: onboarding, dicas de rede e links úteis.\n\n" +
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
    "Oi! 👋 Sou o Vox — a conta oficial que te dá boas-vindas por aqui.\n\n" +
    "Quer achar alguém? Use Pessoas no menu. Quer entender as palavrinhas do app? " +
    "Abra a Voxpedia (glossário bem leigo).\n\n" +
    "Se travar, responde nesta conversa. A gente orienta — sem linguagem de banco. 😊"
  );
}

function readWelcomeIntroSeen() {
  try {
    if (localStorage.getItem(WELCOME_DM_INTRO_SEEN_KEY) === "1") return true;
    if (localStorage.getItem(WELCOME_CARD_SEEN_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function markWelcomeIntroSeen() {
  try {
    localStorage.setItem(WELCOME_DM_INTRO_SEEN_KEY, "1");
    localStorage.setItem(WELCOME_CARD_SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** @deprecated Use markWelcomeIntroSeen */
export function markWelcomeCardSeen() {
  markWelcomeIntroSeen();
}

export function shouldShowWelcomeFeedHint() {
  try {
    if (readWelcomeIntroSeen()) return false;
    return localStorage.getItem(WELCOME_DM_SEED_KEY) === "1";
  } catch {
    return false;
  }
}

/** @deprecated Card removido do feed */
export function shouldShowWelcomeCard() {
  return false;
}

export function isWelcomeRouteId(routeId) {
  return String(routeId || "") === WELCOME_ROUTE_ID;
}

export async function ensureWelcomeDmSeed(myRouteId) {
  if (!myRouteId || localStorage.getItem(WELCOME_DM_SEED_KEY)) return false;
  await cacheNode.saveDmMessage({
    id: "welcome-dm-vox-brasil-v3",
    peerAddress: WELCOME_ROUTE_ID,
    from: WELCOME_ROUTE_ID,
    to: myRouteId,
    text: getWelcomeDmText(),
    ts: Date.now(),
    status: "received",
  });
  localStorage.setItem(WELCOME_DM_SEED_KEY, "1");
  return true;
}

export function ensureWelcomeWatch() {
  if (!social.getWatchedProfiles().includes(WELCOME_ROUTE_ID)) {
    social.toggleWatch(WELCOME_ROUTE_ID);
  }
}

export async function runWelcomeOnboarding(myRouteId) {
  const dmJustSeeded = await ensureWelcomeDmSeed(myRouteId);
  ensureWelcomeWatch();
  return { dmJustSeeded };
}
