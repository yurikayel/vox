/** Offline demo when GraphQL gateways fail (Fase 1). */

export const MOCK_COMMUNITIES = [
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
  "demo-topic-1": [
    {
      id: "demo-reply-1",
      replyTo: "demo-topic-1",
      body: "Só leitura via GraphQL ou estes dados demo.",
      owner: "demo-mod",
    },
  ],
};

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

export function mockRecentTopics() {
  const items = [
    {
      id: "demo-topic-1",
      communityId: "demo-community-1",
      title: "Como funciona a rede Vox?",
      body: "Uma rede que roda no celular e computador de quem usa. Sem servidores caros e com soberania total.",
      owner: "demo-owner",
    },
    {
      id: "demo-topic-2",
      communityId: "demo-community-2",
      title: "Soberania e Autonomia Popular",
      body: "Comunicação direta, dados protegidos e controle total pelo usuário.",
      owner: "demo-mod",
    },
  ];
  return { items, demo: true };
}
