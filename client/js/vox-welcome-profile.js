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

export const OFFICIAL_WELCOME_POST_BODY =
  "Bem-vindo ao Vox! 📢 Esta é a sua praça pública digital: uma rede cidadã que roda direto no seu aparelho, sem algoritmos de ódio, sem venda de dados e imune ao controle de bilionários. Aqui, conversas e comunidades pertencem a você. Suas publicações viajam de bolso em bolso pela malha P2P e ficam salvas de forma soberana. Explore o feed, participe das deliberações locais, conecte-se com pessoas reais e ajude a construir uma comunicação livre e popular no Brasil. O Vox é nosso! 🇧🇷✨";

export const OFFICIAL_WELCOME_TOPIC_ID = "vox-official-manifesto-welcome";

export function getOfficialWelcomeTopic() {
  let created = Date.now();
  try {
    const saved = localStorage.getItem("vox-welcome-post-ts");
    if (saved && !isNaN(Number(saved))) {
      created = Number(saved);
    } else {
      localStorage.setItem("vox-welcome-post-ts", String(created));
    }
  } catch {}

  return {
    id: OFFICIAL_WELCOME_TOPIC_ID,
    type: "topic",
    communityId: "geral",
    communityTitle: "Praça Cívica",
    title: "",
    body: OFFICIAL_WELCOME_POST_BODY,
    author: WELCOME_ROUTE_ID,
    owner: WELCOME_ROUTE_ID,
    authorDisplay: "Vox",
    authorHandle: "vox",
    authorAvatar: OFFICIAL_PROFILE_AVATAR,
    createdAt: created,
    ts: created,
    isPinned: true,
    isOfficial: true,
    isOfficialPlatform: true,
    isSystem: true,
    likes: 0,
    repliesCount: 0,
    isDismissable: true,
  };
}
