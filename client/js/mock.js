/**
 * Módulo de compatibilidade e schemas base.
 * Modo 100% real: feeds, comunidades e listagens mock desativados.
 */

import {
  UF_ROUTE_IDS,
  MOCK_DEMO_UF_COUNT,
  MOCK_DEMO_TOPIC_COUNT,
  buildUfDemoProfilesMap,
} from "./data/profiles-brazil-uf.js";

export { UF_ROUTE_IDS, MOCK_DEMO_UF_COUNT, MOCK_DEMO_TOPIC_COUNT };

const UF_PROFILES_CACHE = buildUfDemoProfilesMap();

/**
 * LAN-10 — os 27 perfis fictícios por UF só existem em modo demonstração explícito.
 * Fora dele, nenhum perfil, chave Pix ou "pessoa online" fictícia aparece misturada à rede real.
 */
export const DEMO_MODE_KEY = "vox-demo-mode";

export function isDemoMode() {
  try {
    return globalThis.localStorage?.getItem(DEMO_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(on) {
  try {
    if (on) globalThis.localStorage?.setItem(DEMO_MODE_KEY, "1");
    else globalThis.localStorage?.removeItem(DEMO_MODE_KEY);
  } catch {}
}

export const MOCK_OFFICIAL_COMMUNITY_VOX = {
  id: "vox",
  communityId: "vox",
  title: "Vox",
  category: "Fórum Oficial",
  description: "Fórum oficial da rede Vox. Debates abertos, governança, issues e espaço comum de encontro de todas as pessoas da rede.",
  owner: "vx_voxbrasil_welcome",
  author: "vx_voxbrasil_welcome",
  image: "./icons/icon-white-192.png",
  avatar: "./icons/icon-white-192.png",
  commercialEnabled: false,
  visibility: "open",
  isOfficial: true,
  isOfficialPlatform: true,
  welcomeRecado: "Bem-vindo ao fórum oficial do Vox! Debates públicos, propostas de melhoria, dúvidas e issues abertas. Todo usuário da rede começa aqui e pode interagir livremente.",
  headerTagline: "Fórum aberto e governança da rede Vox",
};

export const MOCK_DEMO_COMMUNITY = {
  id: "demo-aprenda-vox",
  communityId: "demo-aprenda-vox",
  title: "Brasil Estereótipo (Demo Vox)",
  description: "27 perfis demo para testar feed e comunidade.",
  category: "Tour",
  owner: "vx_demo_mg",
  author: "vx_demo_mg",
  commercialEnabled: false,
  visibility: "open",
  memberCount: 27,
  welcomeRecado: "Recado da comunidade: bem-vindos ao tour! Tratem este espaço como recados de Orkut.",
  headerTagline: "Comunidade do Brasil estereótipo",
};

export const MOCK_DEMO_COMMUNITY_FEIRA = {
  id: "demo-feira-local",
  communityId: "demo-feira-local",
  title: "Feira Solidária",
  description: "Classificados populares sem taxas.",
  category: "Feira",
  owner: "vx_vox_welcome",
  author: "vx_vox_welcome",
  commercialEnabled: true,
};

export const MOCK_DEMO_COMMUNITY_FORK = {
  id: "demo-aprenda-vox-mirror",
  communityId: "demo-aprenda-vox-mirror",
  title: "Brasil Estereótipo — espelho SP",
  description: "Espelho comunitário de leitura rápida (demo fork).",
  category: "Espelho",
  owner: "vx_demo_sp",
  author: "vx_demo_sp",
  commercialEnabled: false,
  visibility: "open",
  communityForkOf: {
    communityId: "demo-aprenda-vox",
    title: "Brasil Estereótipo (Demo Vox)",
  },
};

export const MOCK_DEMO_PROFILES = {};
export const MOCK_DEMO_TOPICS = [];
export const MOCK_DEMO_PROPOSALS = [];
export const MOCK_DEMO_VOTES = {};
export const MOCK_REPLIES = {};

export function getMockProfile(authorId) {
  if (!authorId) return null;
  if (authorId === "vx_voxbrasil_welcome" || authorId === "vx_vox_welcome") {
    return {
      routeId: authorId,
      name: "Vox",
      handle: "vox",
      avatar: "./icons/icon-white-192.png",
      bio: "Conta oficial da plataforma Vox.",
      readme: "Conta oficial da plataforma Vox.",
      isOfficialPlatform: true,
      isSystem: true,
    };
  }
  if (!isDemoMode()) return null;
  if (typeof authorId === "string" && authorId.startsWith("vx_demo_") && UF_PROFILES_CACHE[authorId]) {
    return UF_PROFILES_CACHE[authorId];
  }
  return null;
}

export function getAuthorDisplay(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.name || "";
}

export function getAuthorHandle(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.handle || "";
}

export function getAuthorAvatar(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.avatar || "";
}

export function getAuthorReadme(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.readme || "";
}

export function getAuthorGithub(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.githubHandle || "";
}

export function getAuthorPinnedPostId(authorId) {
  const prof = getMockProfile(authorId);
  return prof?.pinnedPostId || "";
}

export function mockCommunities() {
  return { items: [MOCK_OFFICIAL_COMMUNITY_VOX], demo: false };
}

export function mockTopics(communityId) {
  return { items: [], demo: false };
}

export function mockReplies(topicId) {
  return { items: [], demo: false };
}

export function mockListings(communityId) {
  return { items: [], demo: false };
}

export function mockRecentTopics() {
  return { items: [], demo: false };
}

export function mockProposals(communityId) {
  return { items: [], demo: false };
}


export function getAuthorPixKey(author) {
  const prof = getMockProfile(author);
  return prof?.pixKey || "";
}

export function findMockByPixKey(raw) {
  if (!raw || !isDemoMode()) return null;
  const clean = String(raw).trim().toLowerCase();
  for (const prof of Object.values(UF_PROFILES_CACHE)) {
    if (prof.pixKey && prof.pixKey.trim().toLowerCase() === clean) {
      return prof;
    }
  }
  return null;
}
