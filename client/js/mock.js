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
    bio: "Artesã e educadora. Quero uma rede onde eu não preciso pagar pra ser vista.",
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
    bio: "Advogada. Quero saber por que um post some — e quem decidiu.",
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
    bio: "Ativista. Nossas histórias ficam com a gente, não viram treino de IA.",
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
    bio: "Designer. Quero ler em paz, sem vídeo tocando sozinho.",
    pinnedPostId: "demo-post-mei",
    readme: "### Mei — Design Consciente & Tipografia 🎨\n\nCrio identidades visuais e ilustrações com foco em leitura calma e interfaces humanizadas.\n\n- 👜 Arte têxtil e ecobags manuais na Feira do Bairro.\n- 📖 Design ético que respeita a atenção do usuário.",
    stats: { posts: 1, peersConnected: 2, communities: 1, followers: 18, stars: 15, isTourDemo: true },
  },
  vx_demo_fernanda: {
    routeId: "vx_demo_fernanda",
    handle: "fernanda",
    name: "Fernanda",
    avatar: "images/avatars/fernanda.jpg",
    bio: "Comunicadora no Nordeste. Foco no que é real entre vizinhos, sem anúncio disfarçado.",
    pinnedPostId: "demo-post-fernanda",
    readme: "### Fernanda — Comunicação Popular no Bongi ☀️\n\nRadialista comunitária e produtora de doces artesanais em Recife.\n\n- 🍰 **Feira do Bairro:** Valorização do trabalho autônomo e da economia solidária.\n- 📻 Informação que nasce da rua e volta para a rua.",
    stats: { posts: 1, peersConnected: 5, communities: 1, followers: 51, stars: 33, isTourDemo: true },
  },
  vx_demo_salma: {
    routeId: "vx_demo_salma",
    handle: "salma",
    name: "Salma",
    avatar: "images/avatars/salma.jpg",
    bio: "Jornalista e tradutora. Minha conta vive nas minhas chaves, não na mão de um robô.",
    pinnedPostId: "demo-post-salma",
    readme: "### Salma — Jornalismo Independente & Tradução 🗞️\n\nCobro direitos humanos, trabalho precarizado e tecnologia soberana.\n\n- ✍️ Reportagens de fôlego sem caça-cliques.\n- 🔑 Autenticação criptográfica de fontes sem censura central.",
    stats: { posts: 1, peersConnected: 3, communities: 1, followers: 27, stars: 24, isTourDemo: true },
  },
  vx_demo_lucas: {
    routeId: "vx_demo_lucas",
    handle: "lucas",
    name: "Lucas",
    avatar: "images/avatars/lucas.jpg",
    bio: "Professor de história. Dá pra discordar sem um algoritmo empurrando briga.",
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
    bio: "Coletivo cultural na periferia. A gente se fala direto, e o Pix vai pra quem faz.",
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
    bio: "Estudante. Registro o que o interior conta, numa rede que a gente mesmo cuida.",
    pinnedPostId: "demo-post-kaue",
    readme: "### Kaue — Saberes Tradicionais & Mídias Livres 🌾\n\nEstudante universitário e documentarista comunitário.\n\n- 🎙️ Histórias orais de mestres da tradição.\n- 🌐 Protocolos P2P para preservar a memória coletiva.",
    stats: { posts: 1, peersConnected: 2, communities: 1, followers: 23, stars: 17, isTourDemo: true },
  },
  vx_demo_raj: {
    routeId: "vx_demo_raj",
    handle: "raj",
    name: "Raj",
    avatar: "images/avatars/raj.jpg",
    bio: "Engenheiro. Meus dados ficam no meu celular.",
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
    title: "No Insta, ninguém via minhas oficinas",
    body: "Eu postava oficina atrás de oficina e o Instagram só mostrava se eu pagasse. Aqui a conversa fica na comunidade. Quem quer ver, vê — sem eu impulsionar.",
    image: "images/posts/tour-helena.jpg",
    imageAlt: "Pessoas reunidas à mesa, conversando e dividindo comida",
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
    title: "Meu comentário sumiu. Sem motivo.",
    body: "Já perdi a conta de relato meu que sumiu no Facebook sem ninguém explicar. No Vox a moderação é pública: a gente vê a regra e quem aplicou. Sem tribunal secreto.",
    image: "images/posts/tour-juliana.jpg",
    imageAlt: "Mulher negra lendo o celular, encostada numa parede rosa",
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
    title: "Nossa história não é treino de IA",
    body: "Plataforma grande sugou nossos relatos pra treinar inteligência artificial, sem pedir. No Vox os dados ficam no meu celular. Eu limito banda e pauso quando quero.",
    image: "images/posts/tour-yara.jpg",
    imageAlt: "Grupo diverso junta as mãos em volta de uma mesa",
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
    title: "Cansei do vídeo que toca sozinho",
    body: "Eu abria o Reels e já vinha um vídeo gritando. Dava ansiedade. O Vox é pra ler em paz: sem autoplay, sem som sozinho, sem rolagem te puxando.",
    image: "images/posts/tour-mei.jpg",
    imageAlt: "Mulher no metrô olhando o celular com fone, em silêncio",
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
    title: "Meu feed era só anúncio e número falso",
    body: "Eu abria a rede e só via propaganda disfarçada e gente ostentando milhão de seguidor comprado. No Vox não tem anúncio no meio da conversa. As contas são de aparelho real, perto de você.",
    image: "images/posts/tour-fernanda.jpg",
    imageAlt: "Mulher sorrindo numa banca de rua em São Paulo",
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
    title: "Um robô derrubou meu canal",
    body: "Um filtro automático confundiu árabe com violação e suspendeu meu canal de tradução. Sem aviso. No Vox a identidade nasce no meu aparelho. Ninguém em outro país aperta um botão e me apaga.",
    image: "images/posts/tour-salma.jpg",
    imageAlt: "Mulher escrevendo no notebook no sofá de casa",
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
    title: "No X, briga ganha mais alcance",
    body: "Lá o algoritmo premia agressão porque ódio segura o clique. Aqui a gente discorda em comunidade, sem um cassino lucrando com a briga.",
    image: "images/posts/tour-lucas.jpg",
    imageAlt: "Pessoas conversando e apertando as mãos em volta de uma mesa",
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
    title: "Quando o Zap cai, o coletivo para",
    body: "Já aconteceu do grupo inteiro ficar mudo porque o WhatsApp caiu ou baniu por engano. No Vox a mensagem vai de celular pra celular. Se a pessoa tá offline, espera até 72 horas. E no perfil dá pra apoiar com Pix direto.",
    image: "images/posts/tour-andre.jpg",
    imageAlt: "Grupo em volta do notebook, um homem com o celular na mão",
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
    title: "Nossa cultura não precisa virar meme",
    body: "Nas redes grandes, história do interior só aparece se virar espetáculo. Aqui a gente mesmo abre a comunidade. Os registros ficam nos celulares do grupo, sem pedir licença pra sede lá fora.",
    image: "images/posts/tour-kaue.jpg",
    imageAlt: "Jovem sorrindo na praia, de frente para a câmera",
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
    title: "Minha conversa não precisa ir pra Virgínia",
    body: "Por que papo entre brasileiro fica gravado em servidor estrangeiro? No Vox a mensagem mora no meu navegador e nos aparelhos da comunidade. Se eu quiser, mando pra um arquivo permanente. Se não quiser, não mando.",
    image: "images/posts/tour-raj.jpg",
    imageAlt: "Homem de óculos em um corredor, conversa no próprio aparelho",
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
    body: "É isso, Helena. Aqui a gente se organiza sem pedir licença pro algoritmo.",
    author: "vx_demo_juliana",
    owner: "vx_demo_juliana",
    isLocalP2p: true,
  },
  {
    id: "demo-reply-kaue-1",
    replyTo: "demo-post-yara",
    communityId: "demo-aprenda-vox",
    body: "Fechado, Yara. Memória nossa não é mercadoria.",
    author: "vx_demo_kaue",
    owner: "vx_demo_kaue",
    isLocalP2p: true,
  },
  {
    id: "demo-reply-andre-1",
    replyTo: "demo-post-lucas",
    communityId: "demo-aprenda-vox",
    body: "Falou tudo. Comunidade se segura na confiança, não no escândalo.",
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
    imageAlt: "Mesa compartilhada com pão e comida caseira",
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
    imageAlt: "Mulher artesã sorrindo numa banca de rua",
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
    imageAlt: "Coletivo reunido em volta de um notebook",
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
    imageAlt: "Mulher no transporte com o celular na mão",
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
