/** Offline demo and guided tour (Fase 5.8 — 10 Personas Educativas & Diversidade Plural). */

export const MOCK_DEMO_COMMUNITY = {
  id: "demo-aprenda-vox",
  communityId: "demo-aprenda-vox",
  title: "Aprenda o Vox",
  description: "Dicas essenciais e respostas sobre como o Vox protege suas conversas nos seus aparelhos.",
  category: "Tour",
  owner: "vx_demo_helena",
  author: "vx_demo_helena",
  commercialEnabled: false,
};

export const MOCK_DEMO_COMMUNITY_FEIRA = {
  id: "demo-feira-local",
  communityId: "demo-feira-local",
  title: "Feira do Bairro",
  description: "Classificados comunitários e economia popular: compre de quem faz no bairro, combine no DM e use Pix direto.",
  category: "Feira",
  owner: "vx_demo_fernanda",
  author: "vx_demo_fernanda",
  commercialEnabled: true,
};

export const MOCK_DEMO_PROFILES = {
  vx_demo_helena: {
    routeId: "vx_demo_helena",
    handle: "helena",
    name: "Helena",
    avatar: "images/avatars/helena.jpg",
    bio: "Artesã e educadora popular. Acredito em redes onde as conversas não dependem de pagar para ser vista.",
    pixKey: "helena.vox@gmail.com",
    githubHandle: "helenapopular",
    pinnedPostId: "demo-post-helena",
    readme: "### Olá, sou a Helena! 👋\n\nSou artesã e educadora popular em São Paulo. Construo espaços comunitários onde a tecnologia serve às pessoas, não a algoritmos de anúncio.\n\n- 🥖 **Produção Local:** Pães artesanais e conservas da horta comunitária na Feira do Bairro.\n- 🤝 **Solidariedade:** Oficinas de alfabetização digital e cidadania popular.\n- 💬 Fique à vontade para me mandar um DM ou trocar ideias!",
    stats: { posts: 1, peersConnected: 3, communities: 1, followers: 42, stars: 38, isTourDemo: true },
  },
  vx_demo_juliana: {
    routeId: "vx_demo_juliana",
    handle: "juliana",
    name: "Juliana",
    avatar: "images/avatars/juliana.jpg",
    bio: "Advogada e pesquisadora de direitos digitais. Defendo moderação transparente e auditável.",
    githubHandle: "julianadireito",
    pinnedPostId: "demo-post-juliana",
    readme: "### Juliana — Direitos Digitais & Governança FOSS ⚖️\n\nPesquiso modelos de deliberação democrática direta e soberania de dados.\n\n- 📜 **Governança Aberta:** Propostas, votos auditáveis e corte anti-brigading.\n- 🛡️ **Pacto Comunitário:** Moderação exercida pela base com regras visíveis em diff.",
    stats: { posts: 1, peersConnected: 2, communities: 1, followers: 29, stars: 21, isTourDemo: true },
  },
  vx_demo_yara: {
    routeId: "vx_demo_yara",
    handle: "yara",
    name: "Yara",
    avatar: "images/avatars/yara.jpg",
    bio: "Ativista socioambiental. Defendo a soberania sobre nossas memórias e a recusa da extração predatória de dados.",
    pixKey: "+5592988112233",
    pinnedPostId: "demo-post-yara",
    readme: "### Yara — Guardiã de Memórias & Amazônia Viva 🌿\n\nArticuladora de redes populares de comunicação na Amazônia.\n\n- 📡 **Comunicação Segura:** Nossos registros históricos guardados nos aparelhos da comunidade.\n- 💧 Preservação das águas e das florestas sem vigilância de corporações.",
    stats: { posts: 1, peersConnected: 4, communities: 1, followers: 35, stars: 19, isTourDemo: true },
  },
  vx_demo_mei: {
    routeId: "vx_demo_mei",
    handle: "mei",
    name: "Mei",
    avatar: "images/avatars/mei.jpg",
    bio: "Designer e leitora assídua. Busco uma experiência de leitura limpa, sem gatilhos viciantes de autoplay.",
    pinnedPostId: "demo-post-mei",
    readme: "### Mei — Design Consciente & Tipografia 🎨\n\nCrio identidades visuais e ilustrações com foco em leitura calma e interfaces humanizadas.\n\n- 👜 Arte têxtil e ecobags manuais na Feira do Bairro.\n- 📖 Design ético que respeita a atenção do usuário.",
    stats: { posts: 1, peersConnected: 2, communities: 1, followers: 18, stars: 15, isTourDemo: true },
  },
  vx_demo_fernanda: {
    routeId: "vx_demo_fernanda",
    handle: "fernanda",
    name: "Fernanda",
    avatar: "images/avatars/fernanda.jpg",
    bio: "Comunicadora comunitária no Nordeste. Foco no que é real entre vizinhos e sem anúncios disfarçados.",
    pinnedPostId: "demo-post-fernanda",
    readme: "### Fernanda — Comunicação Popular no Bongi ☀️\n\nRadialista comunitária e produtora de doces artesanais em Recife.\n\n- 🍰 **Feira do Bairro:** Valorização do trabalho autônomo e da economia solidária.\n- 📻 Informação que nasce da rua e volta para a rua.",
    stats: { posts: 1, peersConnected: 5, communities: 1, followers: 51, stars: 33, isTourDemo: true },
  },
  vx_demo_salma: {
    routeId: "vx_demo_salma",
    handle: "salma",
    name: "Salma",
    avatar: "images/avatars/salma.jpg",
    bio: "Jornalista independente e tradutora. Minha voz vive nas minhas chaves, sem medo de cancelamento por robôs.",
    pinnedPostId: "demo-post-salma",
    readme: "### Salma — Jornalismo Independente & Tradução 🗞️\n\nCobro direitos humanos, trabalho precarizado e tecnologia soberana.\n\n- ✍️ Reportagens de fôlego sem caça-cliques.\n- 🔑 Autenticação criptográfica de fontes sem censura central.",
    stats: { posts: 1, peersConnected: 3, communities: 1, followers: 27, stars: 24, isTourDemo: true },
  },
  vx_demo_lucas: {
    routeId: "vx_demo_lucas",
    handle: "lucas",
    name: "Lucas",
    avatar: "images/avatars/lucas.jpg",
    bio: "Professor de história e entusiasta de software livre. Conversas sem incentivo algorítmico à polarização.",
    githubHandle: "lucas-historia",
    pinnedPostId: "demo-post-lucas",
    readme: "### Lucas — História, Educação Popular & FOSS 📚\n\nProfessor da rede pública. Ensino história contemporânea e ativismo de código aberto.\n\n- 🐧 Defesa do software livre na educação.\n- 🏛️ Redes públicas como praça da cidadania.",
    stats: { posts: 1, peersConnected: 4, communities: 1, followers: 31, stars: 22, isTourDemo: true },
  },
  vx_demo_andre: {
    routeId: "vx_demo_andre",
    handle: "andre",
    name: "André",
    avatar: "images/avatars/andre.jpg",
    bio: "Organizador de coletivo cultural periférico. Comunicação direta entre nós, com apoios comunitários diretos.",
    pixKey: "andre.comunidade@voxbrasil.org",
    pinnedPostId: "demo-post-andre",
    readme: "### André — Coletivo Cultural no Capão Redondo 🎤\n\nProdução cultural, hip-hop e economia periférica.\n\n- 👕 Estamparia sustentável e eventos culturais locais.\n- ⚡ Apoio direto via Pix para oficinas de jovens.",
    stats: { posts: 1, peersConnected: 3, communities: 1, followers: 44, stars: 30, isTourDemo: true },
  },
  vx_demo_kaue: {
    routeId: "vx_demo_kaue",
    handle: "kaue",
    name: "Kaue",
    avatar: "images/avatars/kaue.jpg",
    bio: "Estudante e comunicador popular. Registrando saberes ancestrais em redes cooperativas abertas.",
    pinnedPostId: "demo-post-kaue",
    readme: "### Kaue — Saberes Tradicionais & Mídias Livres 🌾\n\nEstudante universitário e documentarista comunitário.\n\n- 🎙️ Histórias orais de mestres da tradição.\n- 🌐 Protocolos P2P para preservar a memória coletiva.",
    stats: { posts: 1, peersConnected: 2, communities: 1, followers: 23, stars: 17, isTourDemo: true },
  },
  vx_demo_raj: {
    routeId: "vx_demo_raj",
    handle: "raj",
    name: "Raj",
    avatar: "images/avatars/raj.jpg",
    bio: "Engenheiro de sistemas e defensor de privacidade. Dados locais no meu próprio celular, sob minha jurisdição.",
    githubHandle: "raj-crypto",
    pinnedPostId: "demo-post-raj",
    readme: "### Raj — Sistemas Distribuídos & Web Crypto 🛡️\n\nArquiteto de software com foco em criptografia cliente-lado e redes tolerantes a falhas.\n\n- 🔐 ECDSA P-256 e ECDH locais no browser.\n- 📦 Zero dependências de runtime e local-first.",
    stats: { posts: 1, peersConnected: 3, communities: 1, followers: 36, stars: 45, isTourDemo: true },
  },
};

// Base de tempo dinâmica para os tópicos do tour (escalonados recentemente)
const NOW = Date.now();

export const MOCK_DEMO_TOPICS = [
  {
    id: "demo-post-helena",
    communityId: "demo-aprenda-vox",
    title: "Comunidades livres em vez de reféns do algoritmo",
    body: "No Instagram, eu passava horas criando oficinas e peças comunitárias, mas o algoritmo só mostrava o que eu fazia se eu pagasse impulsionamento. Aqui no Vox, as conversas vivem em comunidades por afinidade real e no feed 'Para você'. Nenhuma empresa decide se a minha voz chega a quem quer ouvir. É para isso que construímos.",
    image: "images/posts/tour-helena.jpg",
    imageAlt: "Pessoas conversando e criando arte em mesa coletiva",
    author: "vx_demo_helena",
    owner: "vx_demo_helena",
    externalPain: "Instagram - engajamento forçado e alcance reduzido",
    voxResolution: "now",
    likesCount: 48,
    repliesCount: 1,
    isLocalP2p: true,
    ts: NOW - 8 * 60 * 1000, // ~8m atrás
  },
  {
    id: "demo-post-juliana",
    communityId: "demo-aprenda-vox",
    title: "Moderação aberta: chega de sumiço sem explicação",
    body: "Quantas vezes você viu um comentário ou relato legítimo sumir nas redes da Meta sem ninguém te dar um motivo? No Vox, toda ação moderadora segue regras públicas e é assinada via mod-action transparente. Se alguém contesta, a comunidade vê os critérios, sem tribunais secretos. É a garantia de que a verdade não é censurada nas sombras.",
    image: "images/posts/tour-juliana.jpg",
    imageAlt: "Advogada analisando documentos e telas abertas",
    author: "vx_demo_juliana",
    owner: "vx_demo_juliana",
    externalPain: "Meta - comentários e posts sumindo sem explicação",
    voxResolution: "now",
    likesCount: 36,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 22 * 60 * 1000, // ~22m atrás
  },
  {
    id: "demo-post-yara",
    communityId: "demo-aprenda-vox",
    title: "Nossa história não é combustível para IA corporativa",
    body: "Nossos relatos e saberes tradicionais foram sugados por plataformas corporativas para treinar inteligências artificiais sem qualquer autorização. Com o Pacto Vox, seus dados pertencem a você e você tem controle pleno no painel 'Sua rede': pode limitar banda, teto diário e pausar a qualquer momento. Soberania não se negocia.",
    image: "images/posts/tour-yara.jpg",
    imageAlt: "Linhas de conexão geométrica e respeito à natureza",
    author: "vx_demo_yara",
    owner: "vx_demo_yara",
    externalPain: "Big Tech - extração predatória de dados comunitários",
    voxResolution: "now",
    likesCount: 52,
    repliesCount: 1,
    isLocalP2p: true,
    ts: NOW - 45 * 60 * 1000, // ~45m atrás
  },
  {
    id: "demo-post-mei",
    communityId: "demo-aprenda-vox",
    title: "Uma rede que respeita sua paz: sem autoplay viciante",
    body: "Eu já não aguentava mais abrir uma rede social e ser bombardeada por vídeos gritantes no autoplay e gatilhos desenhados para me deixar ansiosa. O Vox é pensado para leitura humana: sem rolagem infinita tóxica, sem sons automáticos e sem truques para roubar seus minutos. Tecnologia feita para servir, não para escravizar.",
    image: "images/posts/tour-mei.jpg",
    imageAlt: "Ambiente tranquilo de trabalho e leitura em smartphone",
    author: "vx_demo_mei",
    owner: "vx_demo_mei",
    externalPain: "TikTok e Reels - autoplay viciante e ansiedade",
    voxResolution: "now",
    likesCount: 29,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 90 * 60 * 1000, // ~1h30 atrás
  },
  {
    id: "demo-post-fernanda",
    communityId: "demo-aprenda-vox",
    title: "Feeds limpos e métricas que não mentem",
    body: "Cansada de abrir o feed e só ver propaganda disfarçada de conselho e perfis ostentando milhões de seguidores comprados. No Vox, não existem anúncios comerciais empurrados na sua timeline e as estatísticas são honestas: posts reais e aparelhos conectados por perto. Sem ilusão e sem vendedores de fumaça.",
    image: "images/posts/tour-fernanda.jpg",
    imageAlt: "Mulher sorrindo em feira comunitária de rua",
    author: "vx_demo_fernanda",
    owner: "vx_demo_fernanda",
    externalPain: "Feeds dominados por anúncios e métricas de vaidade",
    voxResolution: "now",
    likesCount: 41,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 3 * 3600 * 1000, // ~3h atrás
  },
  {
    id: "demo-post-salma",
    communityId: "demo-aprenda-vox",
    title: "Nenhum robô pode deletar a sua identidade",
    body: "Tive um canal de tradução suspenso sem aviso por um filtro automático que confundiu palavras em árabe com violação de política. No Vox isso é impossível: sua identidade (routeId) é um par criptográfico gerado direto no seu aparelho. Não existe um botão vermelho em São Francisco ou Brasília para apagar quem você é.",
    image: "images/posts/tour-salma.jpg",
    imageAlt: "Caderno aberto com anotações e laptop ao lado",
    author: "vx_demo_salma",
    owner: "vx_demo_salma",
    externalPain: "Banimento arbitrário por filtro automatizado",
    voxResolution: "now",
    likesCount: 63,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 5 * 3600 * 1000, // ~5h atrás
  },
  {
    id: "demo-post-lucas",
    communityId: "demo-aprenda-vox",
    title: "Debate público sem estímulo à briga e ao ódio",
    body: "No X (Twitter), o algoritmo foi calibrado para premiar agressão porque ódio retém clique. No Vox, a dinâmica é outra: comunidades autônomas onde as pessoas constroem pontes e compartilham conhecimento. Podemos discordar com civilidade sem que um algoritmo de cassino lucre com a discórdia.",
    image: "images/posts/tour-lucas.jpg",
    imageAlt: "Homem escrevendo em quadro branco em roda de conversa",
    author: "vx_demo_lucas",
    owner: "vx_demo_lucas",
    externalPain: "Twitter/X - algoritmo que premia briga e toxicidade",
    voxResolution: "now",
    likesCount: 34,
    repliesCount: 1,
    isLocalP2p: true,
    ts: NOW - 8 * 3600 * 1000, // ~8h atrás
  },
  {
    id: "demo-post-andre",
    communityId: "demo-aprenda-vox",
    title: "Mensagens diretas que viajam de ponta a ponta",
    body: "Quantas vezes seu coletivo ficou paralisado quando o WhatsApp caiu ou baniu um grupo por engano? No Vox, as DMs viajam direto de aparelho para aparelho com criptografia de ponta a ponta. Se alguém estiver offline, fica na caixa postal segura por até 72 horas. E no perfil, ainda dá para apoiar quem produz via Pix direto.",
    image: "images/posts/tour-andre.jpg",
    imageAlt: "Roda de conversa com celulares e planejamento comunitário",
    author: "vx_demo_andre",
    owner: "vx_demo_andre",
    externalPain: "WhatsApp - monopólio, clonagens e risco de bloqueios",
    voxResolution: "now",
    likesCount: 45,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 14 * 3600 * 1000, // ~14h atrás
  },
  {
    id: "demo-post-kaue",
    communityId: "demo-aprenda-vox",
    title: "Nossa cultura não cabe em bolhas centrais",
    body: "Nas plataformas grandes, nossas histórias do interior só ganham espaço se virarem espetáculo ou meme. Aqui no Vox, nós mesmos fundamos e administramos nossas comunidades. A rede guarda os registros nos celulares do grupo a custo zero, sem pedir licença a nenhuma sede em outro país.",
    image: "images/posts/tour-kaue.jpg",
    imageAlt: "Jovem no pôr do sol em ambiente natural e conectado",
    author: "vx_demo_kaue",
    owner: "vx_demo_kaue",
    externalPain: "Invisibilidade de culturas regionais nas plataformas",
    voxResolution: "now",
    likesCount: 38,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 20 * 3600 * 1000, // ~20h atrás
  },
  {
    id: "demo-post-raj",
    communityId: "demo-aprenda-vox",
    title: "Seus dados sob as suas mãos, não no estrangeiro",
    body: "Por que conversas entre brasileiros precisam ficar gravadas em datacenters em Virgínia ou Dublin sob leis estrangeiras? No Vox, suas mensagens e postagens residem no seu próprio navegador e nos aparelhos da comunidade. Com opção de guardar permanentemente no permaweb livre quando você quiser.",
    image: "images/posts/tour-raj.jpg",
    imageAlt: "Desenvolvimento de tecnologia em ambiente de alta precisão",
    author: "vx_demo_raj",
    owner: "vx_demo_raj",
    externalPain: "Nuvem estrangeira com retenção perpétua de dados",
    voxResolution: "now",
    likesCount: 50,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 26 * 3600 * 1000, // ~1d atrás
  },
];

export const MOCK_DEMO_REPLIES = [
  {
    id: "demo-reply-juliana-1",
    replyTo: "demo-post-helena",
    communityId: "demo-aprenda-vox",
    body: "Perfeito, Helena! A autonomia sobre como nos organizamos é a maior conquista contra o estrangulamento das plataformas tradicionais.",
    author: "vx_demo_juliana",
    owner: "vx_demo_juliana",
    isLocalP2p: true,
  },
  {
    id: "demo-reply-kaue-1",
    replyTo: "demo-post-yara",
    communityId: "demo-aprenda-vox",
    body: "Com certeza, Yara! A nossa memória é patrimônio do nosso povo, não mercadoria de Big Tech.",
    author: "vx_demo_kaue",
    owner: "vx_demo_kaue",
    isLocalP2p: true,
  },
  {
    id: "demo-reply-andre-1",
    replyTo: "demo-post-lucas",
    communityId: "demo-aprenda-vox",
    body: "Falou tudo, Lucas. O que sustenta uma comunidade é a confiança mútua e a solidariedade, não o escândalo.",
    author: "vx_demo_andre",
    owner: "vx_demo_andre",
    isLocalP2p: true,
  },
];

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

export const MOCK_DEMO_LISTINGS = [
  {
    id: "demo-listing-helena",
    type: "listing",
    communityId: "demo-feira-local",
    title: "Pão artesanal de fermentação natural & geleia",
    priceLabel: "R$ 28",
    locationLabel: "Vila Madalena, SP",
    body: "Fornada fresca aos sábados. Pão rústico de 700g feito com farinha orgânica + potinho de geleia caseira de amora. Retirada no ateliê ou entrega no bairro.",
    image: "images/posts/tour-helena.jpg",
    imageAlt: "Pão artesanal rústico e geleia natural",
    author: "vx_demo_helena",
    owner: "vx_demo_helena",
    contactPix: "helena.vox@gmail.com",
    listingStatus: "available",
    likesCount: 19,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 15 * 60 * 1000,
  },
  {
    id: "demo-listing-fernanda",
    type: "listing",
    communityId: "demo-feira-local",
    title: "Bolo de rolo tradicional & doces do agreste",
    priceLabel: "R$ 45",
    locationLabel: "Bongi, Recife",
    body: "Produção artesanal da cooperativa de mulheres. Bolo de rolo com goiabada cascão e cocada cremosa. Encomendas para o fim de semana.",
    image: "images/posts/tour-fernanda.jpg",
    imageAlt: "Doces caseiros tradicionais",
    author: "vx_demo_fernanda",
    owner: "vx_demo_fernanda",
    contactPix: "+5581999887766",
    listingStatus: "available",
    likesCount: 32,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 35 * 60 * 1000,
  },
  {
    id: "demo-listing-andre",
    type: "listing",
    communityId: "demo-feira-local",
    title: "Camisetas algodão 100% orgânico — Serigrafia Coletiva",
    priceLabel: "R$ 55",
    locationLabel: "Capão Redondo, SP",
    body: "Estampa exclusiva do coletivo cultural periférico em tecido sustentável. Vários tamanhos disponíveis. Fortaleça a cultura independente.",
    image: "images/posts/tour-andre.jpg",
    imageAlt: "Camisetas com estampa artesanal",
    author: "vx_demo_andre",
    owner: "vx_demo_andre",
    contactPix: "andre.comunidade@voxbrasil.org",
    listingStatus: "available",
    likesCount: 27,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 60 * 60 * 1000,
  },
  {
    id: "demo-listing-mei",
    type: "listing",
    communityId: "demo-feira-local",
    title: "Ecobags reforçadas & arte botânica manual",
    priceLabel: "R$ 35",
    locationLabel: "Liberdade, SP",
    body: "Tecido reaproveitado de alta durabilidade, alça dupla reforçada e gravuras botânicas originais feitas à mão. Peça única.",
    image: "images/posts/tour-mei.jpg",
    imageAlt: "Ecobag artesanal estampada",
    author: "vx_demo_mei",
    owner: "vx_demo_mei",
    contactPix: "mei.arte@voxbrasil.org",
    listingStatus: "available",
    likesCount: 14,
    repliesCount: 0,
    isLocalP2p: true,
    ts: NOW - 95 * 60 * 1000,
  },
];

export const MOCK_DEMO_PROPOSALS = [
  {
    id: "demo-prop-feira",
    type: "governance-proposal",
    communityId: "demo-aprenda-vox",
    title: "Ativar feira comunitária e classificados populares",
    body: "Propomos habilitar a aba Classificados nesta comunidade para permitir a troca solidária e venda de produtos artesanais dos membros do bairro, com contato via DM e Pix direto.",
    diffText: `@@ -1,4 +1,5 @@
 category: "Tour"
- commercialEnabled: false
+ commercialEnabled: true
+ commercialRules: "Produtos artesanais, alimentos frescos e serviços locais sem taxas."`,
    author: "vx_demo_helena",
    owner: "vx_demo_helena",
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
    title: "Instituir moderação comunitária transparente via mod-action",
    body: "Estabelecer que toda ação disciplinar deve gerar um registro criptográfico assinado pelos moderadores eleitos, sem deleções silenciosas.",
    diffText: `@@ -10,3 +10,4 @@
- modPolicy: "discricionária"
+ modPolicy: "pública e auditável via mod-action"
+ appealPeriod: "72h"`,
    author: "vx_demo_juliana",
    owner: "vx_demo_juliana",
    createdAt: NOW - 72 * 3600 * 1000,
    closesAt: NOW - 12 * 3600 * 1000,
    minQuorum: 2,
    state: "merged",
    isLocalP2p: true,
  },
];

export const MOCK_DEMO_VOTES = {
  "demo-prop-feira": [
    { id: "vote-1", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_helena", owner: "vx_demo_helena", choice: "yes", ts: NOW - 20 * 3600 * 1000 },
    { id: "vote-2", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_juliana", owner: "vx_demo_juliana", choice: "yes", ts: NOW - 18 * 3600 * 1000 },
    { id: "vote-3", type: "governance-vote", proposalId: "demo-prop-feira", author: "vx_demo_lucas", owner: "vx_demo_lucas", choice: "abstain", ts: NOW - 15 * 3600 * 1000 },
  ],
  "demo-prop-mod": [
    { id: "vote-4", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_juliana", owner: "vx_demo_juliana", choice: "yes", ts: NOW - 60 * 3600 * 1000 },
    { id: "vote-5", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_raj", owner: "vx_demo_raj", choice: "yes", ts: NOW - 58 * 3600 * 1000 },
    { id: "vote-6", type: "governance-vote", proposalId: "demo-prop-mod", author: "vx_demo_yara", owner: "vx_demo_yara", choice: "yes", ts: NOW - 50 * 3600 * 1000 },
  ],
};

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
  "demo-post-helena": [MOCK_DEMO_REPLIES[0]],
  "demo-post-yara": [MOCK_DEMO_REPLIES[1]],
  "demo-post-lucas": [MOCK_DEMO_REPLIES[2]],
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
  return prof ? prof.avatar || "" : "";
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
    communityTitle: "Aprenda o Vox",
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
