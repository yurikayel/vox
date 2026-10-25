/** Offline demo — 27 perfis estereótipo (um por UF). */

import {
  UF_ROUTE_IDS,
  MOCK_DEMO_UF_COUNT,
  MOCK_DEMO_TOPIC_COUNT,
  buildUfDemoProfilesMap,
  buildUfDemoTopics,
  buildUfDemoListings,
  buildUfDemoReplies,
} from "./data/profiles-brazil-uf.js";

export { UF_ROUTE_IDS, MOCK_DEMO_UF_COUNT, MOCK_DEMO_TOPIC_COUNT };

const NOW = Date.now();

export const MOCK_DEMO_COMMUNITY = {
  id: "demo-aprenda-vox",
  communityId: "demo-aprenda-vox",
  title: "Brasil Estereótipo (Demo Vox)",
  description:
    "27 perfis demo (um por UF) para testar feed, perfil, Pix e comunidade — humor educativo, não pessoas reais.",
  category: "Tour",
  owner: "vx_demo_mg",
  author: "vx_demo_mg",
  commercialEnabled: false,
  visibility: "open",
  memberCount: MOCK_DEMO_UF_COUNT,
  welcomeRecado:
    "Recado da comunidade: bem-vindos ao tour! Tratem este espaço como recados de Orkut — leveza, respeito e humor educativo. Um perfil por UF; nada de pessoas reais.",
  headerTagline: "Comunidade do Brasil estereótipo — demo Vox",
};

export const MOCK_DEMO_COMMUNITY_FEIRA = {
  id: "demo-feira-local",
  communityId: "demo-feira-local",
  title: "Feira do Bairro",
  description: "Classificados comunitários: combine no DM e Pix direto (demo).",
  category: "Feira",
  owner: "vx_demo_pe",
  author: "vx_demo_pe",
  commercialEnabled: true,
};

export const MOCK_DEMO_PROFILES = buildUfDemoProfilesMap();
export const MOCK_DEMO_TOPICS = buildUfDemoTopics(NOW);
export const MOCK_DEMO_LISTINGS = buildUfDemoListings(NOW);
export const MOCK_DEMO_REPLIES = buildUfDemoReplies();

function indexRepliesByTopic(replies) {
  const map = {};
  for (const r of replies) {
    if (!map[r.replyTo]) map[r.replyTo] = [];
    map[r.replyTo].push(r);
  }
  return map;
}

export const MOCK_DEMO_PROPOSALS = [
  {
    id: "demo-prop-feira",
    type: "governance-proposal",
    communityId: "demo-aprenda-vox",
    title: "Ativar feira comunitária e classificados populares",
    body: "Habilitar classificados para troca solidária e produtos regionais dos perfis demo UF.",
    diffText: `@@ -1,4 +1,5 @@
 category: "Tour"
- commercialEnabled: false
+ commercialEnabled: true
+ commercialRules: "Produtos artesanais e serviços locais sem taxas."`,
    author: "vx_demo_mg",
    owner: "vx_demo_mg",
    createdAt: NOW - 24 * 3600 * 1000,
    closesAt: NOW + 48 * 3600 * 1000,
    minQuorum: 2,
    state: "open",
    isLocalP2p: true,
  },
  {
    id: "demo-prop-mod",
    type: "governance-proposal",
    communityId: "demo-aprenda-vox",
    title: "Moderação comunitária transparente via mod-action",
    body: "Toda ação disciplinar gera registro assinado — sem deleções silenciosas.",
    diffText: `@@ -10,3 +10,4 @@
- modPolicy: "discricionária"
+ modPolicy: "pública e auditável via mod-action"
+ appealPeriod: "72h"`,
    author: "vx_demo_sp",
    owner: "vx_demo_sp",
    createdAt: NOW - 72 * 3600 * 1000,
    closesAt: NOW - 12 * 3600 * 1000,
    minQuorum: 2,
    state: "merged",
    isLocalP2p: true,
  },
];

export const MOCK_DEMO_VOTES = {
  "demo-prop-feira": [
    { id: "vote-1", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_mg", owner: "vx_demo_mg", choice: "yes", ts: NOW - 20 * 3600 * 1000 },
    { id: "vote-2", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_sp", owner: "vx_demo_sp", choice: "yes", ts: NOW - 18 * 3600 * 1000 },
    { id: "vote-3", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_rj", owner: "vx_demo_rj", choice: "abstain", ts: NOW - 15 * 3600 * 1000 },
  ],
  "demo-prop-mod": [
    { id: "vote-4", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_sp", owner: "vx_demo_sp", choice: "yes", ts: NOW - 60 * 3600 * 1000 },
    { id: "vote-5", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_ba", owner: "vx_demo_ba", choice: "yes", ts: NOW - 58 * 3600 * 1000 },
    { id: "vote-6", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_am", owner: "vx_demo_am", choice: "yes", ts: NOW - 50 * 3600 * 1000 },
  ],
};

export const MOCK_COMMUNITIES = [
  MOCK_DEMO_COMMUNITY,
  MOCK_DEMO_COMMUNITY_FEIRA,
  {
    id: "demo-community-1",
    title: "Vox Brasil — Boas-vindas",
    description: "Comunidade de demonstração offline.",
    category: "Geral",
    owner: "demo-owner",
  },
  {
    id: "demo-community-2",
    title: "Política & Cidadania",
    description: "Discussões sobre direitos e participação popular (mock).",
    category: "Sociedade",
    owner: "demo-owner",
  },
];

export const MOCK_TOPICS = {
  "demo-aprenda-vox": MOCK_DEMO_TOPICS,
  "demo-feira-local": [],
  "demo-community-1": [
    {
      id: "demo-topic-1",
      communityId: "demo-community-1",
      title: "Como funciona a Fase 1?",
      owner: "demo-owner",
    },
  ],
  "demo-community-2": [],
};

export const MOCK_REPLIES = {
  ...indexRepliesByTopic(MOCK_DEMO_REPLIES),
  "demo-topic-1": [
    {
      id: "demo-reply-1",
      replyTo: "demo-topic-1",
      body: "Só leitura via GraphQL ou estes dados demo.",
      owner: "demo-mod",
    },
  ],
};

export function getMockProfile(authorId) {
  if (!authorId) return null;
  return MOCK_DEMO_PROFILES[authorId] || null;
}

export function getAuthorDisplay(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  return prof ? prof.name : "";
}

export function getAuthorAvatar(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  if (!prof) return "";
  return prof.avatarUrl || prof.avatar || "";
}

export function getAuthorHandle(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  return prof ? prof.handle || "" : "";
}

export function getAuthorReadme(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  return prof ? prof.readme || "" : "";
}

export function getAuthorGithub(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  return prof ? prof.githubHandle || "" : "";
}

export function getAuthorPinnedPostId(authorId) {
  if (!authorId) return "";
  const prof = getMockProfile(authorId);
  return prof ? prof.pinnedPostId || "" : "";
}

export function mockCommunities() {
  return { items: MOCK_COMMUNITIES, demo: true };
}

export function mockTopics(communityId) {
  const items = MOCK_TOPICS[communityId] || [];
  return { items, demo: true };
}

export function mockReplies(topicId) {
  const items = MOCK_REPLIES[topicId] || [];
  return { items, demo: true };
}

export function mockListings(communityId) {
  if (communityId === "demo-feira-local") {
    return { items: MOCK_DEMO_LISTINGS, demo: true };
  }
  return { items: [], demo: true };
}

export function mockRecentTopics() {
  const items = MOCK_DEMO_TOPICS.map((t) => ({
    ...t,
    communityTitle: MOCK_DEMO_COMMUNITY.title,
  }));
  return { items, demo: true };
}

export function mockProposals(communityId) {
  if (communityId === "demo-aprenda-vox") {
    return { items: MOCK_DEMO_PROPOSALS, demo: true };
  }
  return { items: [], demo: true };
}

export function mockVotes(proposalId) {
  const items = MOCK_DEMO_VOTES[proposalId] || [];
  return { items, demo: true };
}

export function getAuthorPixKey(author) {
  if (!author) return "";
  return getMockProfile(author)?.pixKey || "";
}

export function findMockByPixKey(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().toLowerCase();
  for (const prof of Object.values(MOCK_DEMO_PROFILES)) {
    if (prof.pixKey && prof.pixKey.trim().toLowerCase() === clean) {
      return prof;
    }
  }
  return null;
}
