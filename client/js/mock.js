/** Offline demo and guided tour (Fase 1 / Fase 5.5). */

export const MOCK_DEMO_COMMUNITY = {
  id: "demo-aprenda-vox",
  communityId: "demo-aprenda-vox",
  title: "Aprenda o Vox",
  description: "Dicas rápidas e essenciais sobre como o Vox funciona no seu aparelho.",
  category: "Tour",
  owner: "vx_demo_lia",
  author: "vx_demo_lia",
};

export const MOCK_DEMO_PROFILES = {
  vx_demo_lia: {
    routeId: "vx_demo_lia",
    name: "Lia",
    bio: "Apoiadora de redes livres. Acredito que a tecnologia deve servir às pessoas, não a grandes servidores.",
  },
  vx_demo_rafa: {
    routeId: "vx_demo_rafa",
    name: "Rafa",
    bio: "Entusiasta de privacidade e comunicação direta sem intermediários.",
  },
  vx_demo_camila: {
    routeId: "vx_demo_camila",
    name: "Camila",
    bio: "Organizadora comunitária. Foco em conversas que constroem laços reais.",
  },
  vx_demo_davi: {
    routeId: "vx_demo_davi",
    name: "Davi",
    bio: "Curioso por tecnologia descentralizada e preservação da memória popular.",
  },
  vx_demo_pri: {
    routeId: "vx_demo_pri",
    name: "Pri",
    bio: "Exploradora de novas redes sociais e defensora da internet aberta para todo mundo.",
  },
};

export const MOCK_DEMO_TOPICS = [
  {
    id: "demo-post-lia",
    communityId: "demo-aprenda-vox",
    title: "O Vox mora no seu celular",
    body: "No Vox, não existem servidores centrais controlando o que você vê. A rede roda no aparelho de cada pessoa conectada. Na seção 'Sua rede', você decide se quer compartilhar um pouquinho de conexão para fortalecer o grupo — e pode pausar sempre que quiser com um toque.",
    author: "vx_demo_lia",
    owner: "vx_demo_lia",
    isLocalP2p: true,
  },
  {
    id: "demo-post-rafa",
    communityId: "demo-aprenda-vox",
    title: "Mensagens sem complicação",
    body: "As conversas diretas no Vox viajam direto de aparelho para aparelho quando vocês estão conectados. Se a outra pessoa estiver offline, o recado fica guardado em uma caixa postal segura e temporária até ela voltar. Ninguém no meio do caminho consegue ler.",
    author: "vx_demo_rafa",
    owner: "vx_demo_rafa",
    isLocalP2p: true,
  },
  {
    id: "demo-post-camila",
    communityId: "demo-aprenda-vox",
    title: "Comunidades em vez de scroll infinito",
    body: "Em vez de algoritmos empurrando discussões vazias para prender sua atenção, aqui você participa de comunidades por interesse real. Você entra, lê os posts, compartilha o que importa e conversa com quem está junto na mesma causa.",
    author: "vx_demo_camila",
    owner: "vx_demo_camila",
    isLocalP2p: true,
  },
  {
    id: "demo-post-davi",
    communityId: "demo-aprenda-vox",
    title: "Na rede e Guardado",
    body: "Você já deve ter reparado nos selos ao lado dos posts. 'Na rede' significa que a publicação está viva nos celulares da comunidade, com custo zero. Já 'Guardado' indica arquivo permanente na nuvem livre, disponível se você quiser conectar uma carteira no perfil.",
    author: "vx_demo_davi",
    owner: "vx_demo_davi",
    isLocalP2p: true,
  },
  {
    id: "demo-post-pri",
    communityId: "demo-aprenda-vox",
    title: "Entrar leva um toque",
    body: "Para começar a usar o Vox, você não precisa de senha, e-mail nem cadastrar cartão. Sua conta é gerada no próprio navegador e você já pode criar posts e comunidades na hora. Se quiser personalizar, basta definir seu nome em 'Perfil'.",
    author: "vx_demo_pri",
    owner: "vx_demo_pri",
    isLocalP2p: true,
  },
];

export const MOCK_DEMO_REPLIES = [
  {
    id: "demo-reply-pri-1",
    replyTo: "demo-post-lia",
    communityId: "demo-aprenda-vox",
    body: "Exatamente, Lia! É muito bom saber que nossos dados não ficam presos em plataformas gigantes.",
    author: "vx_demo_pri",
    owner: "vx_demo_pri",
    isLocalP2p: true,
  },
];

export const MOCK_COMMUNITIES = [
  MOCK_DEMO_COMMUNITY,
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
  "demo-post-lia": MOCK_DEMO_REPLIES,
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
  const items = MOCK_DEMO_TOPICS.map((t) => ({
    ...t,
    communityTitle: "Aprenda o Vox",
  }));
  return { items, demo: true };
}
