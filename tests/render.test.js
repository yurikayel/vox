import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

// Mock de DOM
function createContainer() {
  return {
    innerHTML: "",
  };
}

globalThis.document = {
  getElementById: (id) => {
    return { id, innerHTML: "", appendChild() {} };
  },
};

const render = await import("../client/js/render.js");

test("render - renderPactModal injeta o modal com termos e botoes", () => {
  const container = createContainer();
  render.renderPactModal(container);

  assert.ok(container.innerHTML.includes("Bem-vindo ao Vox"));
  assert.ok(container.innerHTML.includes("btn-pact-accept"));
  assert.ok(container.innerHTML.includes("btn-pact-settings"));
  assert.ok(container.innerHTML.includes("Seus dados são seus"));

  render.closePactModal(container);
  assert.equal(container.innerHTML, "");
});

test("render - renderNetworkSettings gera painel completo com WebRTC", () => {
  const main = createContainer();
  const settings = {
    enabled: true,
    maxMb: 25,
    dailyCapMb: 50,
    wifiOnly: true,
    webrtcEnabled: true,
  };
  const metrics = { blobsServed: 10, blobsServedRtc: 4, bytesServed: 50000 };
  const cacheStats = { count: 12, sizeKb: "120.5" };
  const relayStatus = { online: true, data: { cachedCount: 5 } };
  const dailyUsage = { bytesServedToday: 10 * 1024 * 1024 };
  const rtcStatus = { remotePeersConnected: 3 };

  render.renderNetworkSettings(main, {
    settings,
    metrics,
    cacheStats,
    relayStatus,
    dailyUsage,
    notifPermission: "granted",
    rtcStatus,
    customSignalingUrl: "ws://192.168.1.100:3921",
    customTurn: { urls: "turn:turn.comunidade.org:3478", username: "vox_turn", credential: "123" },
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Sua rede"));
  assert.ok(html.includes("Ajudando a rede"));
  assert.ok(html.includes("3 aparelhos conectados"));
  assert.ok(html.includes("advanced-settings"));
  assert.ok(html.includes("net-pause"));
  assert.ok(html.includes("net-webrtc"));
  assert.ok(html.includes("ws://192.168.1.100:3921"));
  assert.ok(html.includes("turn:turn.comunidade.org:3478"));
  assert.ok(html.includes("vox_turn"));
  // Termos de infraestrutura restritos à seção Avançado
  assert.ok(!html.includes("127.0.0.1:3920"));
});

test("render - renderHome renderiza cards de comunidade", () => {
  const main = createContainer();
  const items = [
    { id: "c1", title: "Tecnologia Livre", description: "Descricao 1", category: "Tech" },
    { id: "c2", title: "Cultura Brasileira", description: "Descricao 2", category: "Cultura" },
  ];

  render.renderHome(main, items);
  const html = main.innerHTML;

  assert.ok(html.includes("Tecnologia Livre"));
  assert.ok(html.includes("Cultura Brasileira"));
  assert.ok(html.includes("#/c/c1"));
  assert.ok(html.includes("#/c/c2"));
});

test("render - renderDmList e renderDmThread", () => {
  const mainList = createContainer();
  const convs = [
    { peerAddress: "addr_bob", lastText: "E aí Alice", lastTs: Date.now() },
  ];
  render.renderDmList(mainList, convs, "addr_alice");
  assert.ok(mainList.innerHTML.includes("Mensagens"));
  assert.ok(mainList.innerHTML.includes("Privadas. Só neste aparelho."));
  assert.ok(mainList.innerHTML.includes("addr_bob"));
  assert.ok(mainList.innerHTML.includes("E aí Alice"));

  const mainThread = createContainer();
  const msgs = [
    { id: "1", from: "addr_alice", text: "Oi Bob", ts: Date.now(), status: "delivered" },
    { id: "2", from: "addr_bob", text: "Oi Alice!", ts: Date.now(), status: "received" },
  ];
  render.renderDmThread(mainThread, "addr_bob", msgs, "addr_alice", {
    isRtcOnline: true,
    hasDmPub: true,
  });
  assert.ok(mainThread.innerHTML.includes("Conectado"));
  assert.ok(mainThread.innerHTML.includes("Oi Bob"));
  assert.ok(mainThread.innerHTML.includes("Oi Alice!"));
  assert.ok(mainThread.innerHTML.includes("btn-send-dm"));
});

test("render - renderFeed renderiza timeline com posts", () => {
  const main = createContainer();
  const topics = [
    { id: "t1", title: "Primeiro post", body: "Conteudo do post", owner: "addr_autor", communityId: "geral", communityTitle: "Geral" },
  ];
  render.renderFeed(main, topics);
  assert.ok(main.innerHTML.includes("Para você"));
  assert.ok(main.innerHTML.includes("Primeiro post"));
  assert.ok(main.innerHTML.includes("Conteudo do post"));
  assert.ok(main.innerHTML.includes(">Geral<"));
  assert.ok(!main.innerHTML.includes(">c/geral<"));
});

test("render - renderNetworkChip status e rotulagem", () => {
  const chipActive = render.renderNetworkChip({ blobsServed: 5 }, { remotePeersConnected: 2 }, { enabled: true });
  assert.ok(chipActive.includes("2 aparelhos"));
  assert.ok(chipActive.includes("network-chip active"));

  const chipPaused = render.renderNetworkChip({}, {}, { enabled: false });
  assert.ok(chipPaused.includes("Só leitura"));
  assert.ok(chipPaused.includes("network-chip paused"));
});

test("render - renderProfile com handle e renderHandleConflict", () => {
  const mainProf = createContainer();
  render.renderProfile(mainProf, "addr_maria", [], true, "", {
    handle: "maria",
    isConflict: true,
    claimants: [{ owner: "addr_maria" }, { owner: "addr_outra_maria" }],
  });
  assert.ok(mainProf.innerHTML.includes("@maria"));
  assert.ok(mainProf.innerHTML.includes("Conflito de Handle"));
  assert.ok(mainProf.innerHTML.includes("form-claim-handle"));

  const mainConf = createContainer();
  render.renderHandleConflict(mainConf, "maria", [
    { owner: "addr_1", txId: "tx_1" },
    { owner: "addr_2", txId: "tx_2" },
  ]);
  assert.ok(mainConf.innerHTML.includes("@maria"));
  assert.ok(mainConf.innerHTML.includes("Ambiguidade"));
  assert.ok(mainConf.innerHTML.includes("addr_1"));
  assert.ok(mainConf.innerHTML.includes("addr_2"));
});

test("render - renderCantinaGate e closeCantinaGate", () => {
  const container = createContainer();
  render.renderCantinaGate(container);

  const html = container.innerHTML;
  assert.ok(html.includes("Porta da Cantina"));
  assert.ok(html.includes("Seus bots vão ter que esperar do lado de fora"));
  assert.ok(html.includes("Droides e scripts ficam na calçada"));
  assert.ok(html.includes("Não é o bot que você procura"));
  assert.ok(html.includes("btn-cantina-enter"));
  assert.ok(html.includes("Entrar — sou humano"));
  assert.ok(html.includes("O que isso significa?"));

  render.closeCantinaGate(container);
  assert.equal(container.innerHTML, "");
});

test("render - renderFeed e renderProfile com persona mock (Helena)", () => {
  const mainFeed = createContainer();
  const topics = [
    { id: "demo-post-helena", title: "Comunidades livres em vez de reféns do algoritmo", body: "Texto...", image: "images/posts/tour-helena.jpg", author: "vx_demo_helena", communityId: "demo-aprenda-vox", likesCount: 48 },
  ];
  render.renderFeed(mainFeed, topics);
  assert.ok(mainFeed.innerHTML.includes("Helena"));
  assert.ok(mainFeed.innerHTML.includes("@helena"));
  assert.ok(mainFeed.innerHTML.includes("Comunidades livres"));
  assert.ok(mainFeed.innerHTML.includes("images/avatars/helena.jpg"));
  assert.ok(mainFeed.innerHTML.includes("images/posts/tour-helena.jpg"));
  assert.ok(mainFeed.innerHTML.includes("btn-like"));
  assert.ok(mainFeed.innerHTML.includes("btn-save"));
  assert.ok(mainFeed.innerHTML.includes("48"));

  const mainProf = createContainer();
  render.renderProfile(mainProf, "vx_demo_helena", [{ communityId: "demo-aprenda-vox" }], false, "", {
    handle: "helena",
    displayName: "Helena",
    profileBio: "Artesã e educadora popular.",
    posts: topics,
  });
  assert.ok(mainProf.innerHTML.includes("Helena (@helena)"));
  assert.ok(mainProf.innerHTML.includes("images/avatars/helena.jpg"));
  assert.ok(mainProf.innerHTML.includes("Artesã e educadora popular."));
  assert.ok(mainProf.innerHTML.includes("profile-stats"));
  assert.ok(mainProf.innerHTML.includes("Posts do autor (1)"));
  assert.ok(mainProf.innerHTML.includes("Comunidades livres"));
});

test("render - formatTimeAgo retorna strings relativas concisas", () => {
  const now = Date.now();
  assert.equal(render.formatTimeAgo(now - 10 * 1000), "agora");
  assert.equal(render.formatTimeAgo(now - 15 * 60 * 1000), "15m");
  assert.equal(render.formatTimeAgo(now - 2 * 3600 * 1000), "2h");
  assert.equal(render.formatTimeAgo(now - 28 * 3600 * 1000), "1d");
  assert.equal(render.formatTimeAgo(null), "recente");
  assert.equal(render.formatTimeAgo("invalido"), "recente");
});

test("render - renderComposerStrip e post-toolbar no feed", () => {
  const strip = render.renderComposerStrip();
  assert.ok(strip.includes("composer-strip"));
  assert.ok(strip.includes("#/compose/topic"));

  const main = createContainer();
  const topics = [
    { id: "post-1", title: "Novidade na rede", ts: Date.now() - 5 * 60000, author: "vx_demo_helena" },
  ];
  render.renderFeed(main, topics);
  assert.ok(main.innerHTML.includes("composer-strip"));
  assert.ok(main.innerHTML.includes("post-toolbar"));
  assert.ok(main.innerHTML.includes("5m"));
});

test("render - renderProfile com Pix e métricas honestas", () => {
  const main = createContainer();
  render.renderProfile(main, "vx_me", [], true, "", {
    displayName: "Meu Perfil",
    stats: { posts: 3, peersConnected: 4, communities: 2 },
    pixKey: "12345678909",
    pixKeyMasked: "***.456.789-**",
  });
  const html = main.innerHTML;
  assert.ok(html.includes("profile-cover"));
  assert.ok(html.includes("profile-avatar-wrap"));
  assert.ok(html.includes("3"));
  assert.ok(html.includes("posts"));
  assert.ok(html.includes("4"));
  assert.ok(html.includes("aparelhos próximos"));
  assert.ok(html.includes("Chave Pix:"));
  assert.ok(html.includes("***.456.789-**"));
  assert.ok(html.includes("form-pix-key"));
});

test("render - renderPixLookup perfil encontrado vs nao vinculado", () => {
  const mainFound = createContainer();
  render.renderPixLookup(mainFound, "helena.vox@gmail.com", {
    routeId: "vx_demo_helena",
    name: "Helena",
    handle: "helena",
    pixKey: "helena.vox@gmail.com",
    pixKeyMasked: "helena.vox@gmail.com",
  });
  assert.ok(mainFound.innerHTML.includes("Conta Localizada"));
  assert.ok(mainFound.innerHTML.includes("Helena"));
  assert.ok(mainFound.innerHTML.includes("vx_demo_helena"));
  assert.ok(mainFound.innerHTML.includes("Aviso de Conformidade"));

  const mainEmpty = createContainer();
  render.renderPixLookup(mainEmpty, "chave_desconhecida", null);
  assert.ok(mainEmpty.innerHTML.includes("Chave Pix não vinculada"));
  assert.ok(mainEmpty.innerHTML.includes("chave_desconhecida"));
});

test("render - renderCommunity tabs Posts e Classificados com feira ativada e desativada", () => {
  // 1. Feira ativada (demo-feira-local) na aba Classificados
  const mainFeira = createContainer();
  const feiraMeta = {
    id: "demo-feira-local",
    title: "Feira do Bairro",
    commercialEnabled: true,
  };
  const listings = [
    {
      id: "demo-listing-helena",
      title: "Pão artesanal & geleia",
      priceLabel: "R$ 28",
      locationLabel: "Vila Madalena, SP",
      author: "vx_demo_helena",
      contactPix: "helena.vox@gmail.com",
      image: "images/posts/tour-helena.jpg",
      listingStatus: "available",
      body: "Fornada fresca aos sábados.",
    },
  ];

  render.renderCommunity(mainFeira, "demo-feira-local", [], feiraMeta, {
    activeTab: "listings",
    listings,
  });

  const htmlFeira = mainFeira.innerHTML;
  assert.ok(htmlFeira.includes("community-tabs"));
  assert.ok(htmlFeira.includes("Classificados"));
  assert.ok(htmlFeira.includes("Nova oferta"));
  assert.ok(htmlFeira.includes("Pão artesanal &amp; geleia"));
  assert.ok(htmlFeira.includes("R$ 28"));
  assert.ok(htmlFeira.includes("Vila Madalena, SP"));
  assert.ok(htmlFeira.includes("Copiar Pix"));
  assert.ok(htmlFeira.includes("Conversar no DM"));
  assert.ok(htmlFeira.includes("btn-share-listing"));

  // 2. Feira desativada (Aprenda o Vox) visitando aba Classificados
  const mainGov = createContainer();
  const learnMeta = {
    id: "demo-aprenda-vox",
    title: "Aprenda o Vox",
    commercialEnabled: false,
  };
  render.renderCommunity(mainGov, "demo-aprenda-vox", [], learnMeta, {
    activeTab: "listings",
    listings: [],
  });

  const htmlGov = mainGov.innerHTML;
  assert.ok(htmlGov.includes("Feira comunitária não ativada"));
  assert.ok(htmlGov.includes("opt-in por votação") || htmlGov.includes("proposta comunitária de governança"));
  assert.ok(!htmlGov.includes("Nova oferta"));
});

test("render - renderComposeListing gera formulário de oferta com disclaimer", () => {
  const main = createContainer();
  render.renderComposeListing(main, "demo-feira-local", "Feira do Bairro", {
    defaultPix: "minha-chave@vox.org",
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Nova Oferta — Feira do Bairro"));
  assert.ok(html.includes("form-compose-listing"));
  assert.ok(html.includes("listing-title"));
  assert.ok(html.includes("listing-price"));
  assert.ok(html.includes("listing-location"));
  assert.ok(html.includes("listing-pix"));
  assert.ok(html.includes("minha-chave@vox.org"));
  assert.ok(html.includes("Publicar na Feira"));
  assert.ok(html.includes("O Vox não intermedia pagamento"));
});

test("render - post v3 híbrido (mídia antes do texto, star, copy-md e pinned)", () => {
  const post = {
    id: "post_hibrido_1",
    title: "Foto do mutirão na praça",
    body: "Hoje nos reunimos para plantar mudas nativas e conversar sobre soberania.",
    image: "images/posts/tour-helena.jpg",
    author: "vx_demo_helena",
    likesCount: 15,
    starsCount: 8,
  };

  const html = render.renderPostItem(post, { isPinned: true });
  assert.ok(html.includes("📌 Fixado"));
  assert.ok(html.includes("post_hibrido_1"));
  assert.ok(html.includes("images/posts/tour-helena.jpg"));
  assert.ok(html.includes("btn-like"));
  assert.ok(html.includes("btn-star"));
  assert.ok(html.includes("count-stars"));
  assert.ok(html.includes("btn-copy-md"));
  assert.ok(html.includes("btn-save"));

  // Valida que a tag de mídia aparece ANTES do título do post no DOM (hierarquia híbrida InstaTwitter)
  const imgIdx = html.indexOf("post-media-container");
  const titleIdx = html.indexOf("post-title");
  assert.ok(imgIdx !== -1, "Deve conter post-media-container");
  assert.ok(titleIdx !== -1, "Deve conter post-title");
  assert.ok(imgIdx < titleIdx, "Mídia deve preceder o título na hierarquia visual v3");
});

test("render - feed com abas segmentadas Para você e Seguindo", () => {
  const main = createContainer();
  const topics = [
    { id: "p1", title: "Primeiro post", author: "vx_demo_helena" },
  ];

  // Aba 'Para você'
  render.renderFeed(main, topics, { activeFeed: "for-you" });
  assert.ok(main.innerHTML.includes("feed-segmented-nav"));
  assert.ok(main.innerHTML.includes("Para você"));
  assert.ok(main.innerHTML.includes("Seguindo"));
  assert.ok(main.innerHTML.includes("feed-tab active"));

  // Aba 'Seguindo' vazia
  const mainFollowingEmpty = createContainer();
  render.renderFeed(mainFollowingEmpty, [], { activeFeed: "following" });
  assert.ok(mainFollowingEmpty.innerHTML.includes("following-empty"));
  assert.ok(mainFollowingEmpty.innerHTML.includes("Você ainda não acompanha ninguém"));
  assert.ok(mainFollowingEmpty.innerHTML.includes("Acompanhar (Watch)"));
});

test("render - formatPostMarkdown formata citação padrão com link", () => {
  const post = {
    id: "post_md_test",
    title: "Governança Direta",
    body: "Proposta de deliberação comunitária.",
    author: "vx_demo_juliana",
  };
  const md = render.formatPostMarkdown(post);
  assert.ok(md.includes("> **Juliana**"));
  assert.ok(md.includes("@juliana"));
  assert.ok(md.includes("> **Governança Direta**"));
  assert.ok(md.includes("Proposta de deliberação comunitária."));
  assert.ok(md.includes("/#/t/post_md_test"));
});

test("render - renderProfile com README.md, GitHub badge e botão Watch", () => {
  const main = createContainer();
  render.renderProfile(main, "vx_demo_raj", [], false, "", {
    displayName: "Raj",
    handle: "raj",
    githubHandle: "raj-crypto",
    readme: "### Raj — Sistemas Distribuídos\n- Criptografia P-256 no browser\n- Local-first sem servidores",
    posts: [
      { id: "post_raj", title: "Criptografia Local", author: "vx_demo_raj" },
    ],
  });

  const html = main.innerHTML;
  assert.ok(html.includes("README.md"));
  assert.ok(html.includes("Sistemas Distribuídos"));
  assert.ok(html.includes("Criptografia P-256"));
  assert.ok(html.includes("profile-github-badge"));
  assert.ok(html.includes("@raj-crypto"));
  assert.ok(html.includes("btn-watch-profile"));
  assert.ok(html.includes("Acompanhar (Watch)"));
  assert.ok(html.includes("profile-tabs"));
  assert.ok(html.includes("Estrelados"));
});

test("render - renderCommunity tab Governança e renderProposalItem", () => {
  const main = createContainer();
  const proposals = [
    {
      id: "prop_1",
      communityId: "demo-aprenda-vox",
      title: "Ativar feira comunitária popular",
      body: "Proposta para abrir feira solidária.",
      diffText: "@@ -1,2 +1,3 @@\n- commercialEnabled: false\n+ commercialEnabled: true",
      author: "vx_demo_helena",
      createdAt: Date.now() - 3600000,
      state: "open",
    },
  ];

  render.renderCommunity(main, "demo-aprenda-vox", [], { title: "Aprenda o Vox" }, {
    activeTab: "governance",
    proposals,
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Governança (1)"));
  assert.ok(html.includes("Deliberações Comunitárias"));
  assert.ok(html.includes("Ativar feira comunitária popular"));
  assert.ok(html.includes("Em votação"));
  assert.ok(html.includes("Contém diff unificado"));
  assert.ok(html.includes("Ver proposta & votos →"));
});

test("render - renderProposalDetail com diff, apuração e votos", () => {
  const main = createContainer();
  const proposal = {
    id: "prop_diff_test",
    communityId: "demo-aprenda-vox",
    title: "Moderação transparente",
    body: "**Regra:** Toda moderação deve ser pública.",
    diffText: "@@ -1,2 +1,3 @@\n- modPolicy: secreta\n+ modPolicy: pública",
    author: "vx_demo_juliana",
    createdAt: Date.now() - 7200000,
    state: "open",
  };
  const tally = {
    yes: 2,
    no: 1,
    abstain: 0,
    totalEligible: 3,
    ineligibleCount: 1,
    state: "open",
    votesDetail: [
      { author: "vx_demo_juliana", choice: "yes", eligible: true, reason: "", ts: Date.now() - 3000 },
      { author: "vx_demo_raj", choice: "yes", eligible: true, reason: "", ts: Date.now() - 2000 },
      { author: "vx_demo_carlos", choice: "no", eligible: true, reason: "", ts: Date.now() - 1000 },
      { author: "vx_demo_mateus", choice: "yes", eligible: false, reason: "adesão posterior ao marco de corte", ts: Date.now() },
    ],
  };

  render.renderProposalDetail(main, proposal, tally, {
    userVote: { choice: "yes" },
    isEligible: true,
    isMember: true,
    userAddress: "vx_demo_juliana",
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Moderação transparente"));
  assert.ok(html.includes("Patch proposto (Diff unificado)"));
  assert.ok(html.includes("diff-line-add"));
  assert.ok(html.includes("+ modPolicy: pública"));
  assert.ok(html.includes("diff-line-del"));
  assert.ok(html.includes("- modPolicy: secreta"));
  assert.ok(html.includes("Apuração de Votos (1 membro = 1 voto)"));
  assert.ok(html.includes("Sim:</strong> 2"));
  assert.ok(html.includes("Não:</strong> 1"));
  assert.ok(html.includes("Descartados pós-corte:</strong> 1"));
  assert.ok(html.includes("vote-btn-yes selected"));
  assert.ok(html.includes("Transparência de Votos (4)"));
  assert.ok(html.includes("Não computado (adesão posterior ao marco de corte)"));
});

test("render - renderComposeProposal gera formulário de proposta", () => {
  const main = createContainer();
  render.renderComposeProposal(main, "demo-aprenda-vox", "Aprenda o Vox");

  const html = main.innerHTML;
  assert.ok(html.includes("Nova Proposta — Aprenda o Vox"));
  assert.ok(html.includes("form-compose-proposal"));
  assert.ok(html.includes("prop-title"));
  assert.ok(html.includes("prop-body"));
  assert.ok(html.includes("prop-diff"));
  assert.ok(html.includes("Publicar Proposta Assinada"));
});

test("render - renderPostItem exibe botao de Pix Zap se o autor tiver chave", () => {
  // vx_demo_helena possui pixKey no mock (helena.vox@gmail.com)
  const postWithPix = {
    id: "p_helena_1",
    author: "vx_demo_helena",
    title: "Post da Helena com Pix",
    body: "Conteúdo livre",
    ts: Date.now() - 60000,
  };
  const htmlPix = render.renderPostItem(postWithPix);
  assert.ok(htmlPix.includes("btn-zap-post"));
  assert.ok(htmlPix.includes("data-pix=\"helena.vox@gmail.com\""));
  assert.ok(htmlPix.includes("Apoiar"));

  // Autor sem pix
  const postNoPix = {
    id: "p_unknown_1",
    author: "vx_demo_desconhecido",
    title: "Post sem Pix",
    body: "Sem chave",
    ts: Date.now() - 60000,
  };
  const htmlNoPix = render.renderPostItem(postNoPix);
  assert.ok(htmlNoPix.includes("btn-zap-post disabled"));
  assert.ok(htmlNoPix.includes("disabled"));
});

test("render - renderZapModal gera payload BR Code e aviso regulatorio", () => {
  const container = createContainer();
  render.renderZapModal(container, {
    author: "vx_demo_helena",
    authorName: "Helena Silva",
    pixKey: "helena.vox@gmail.com",
    title: "Post sobre permacultura",
    defaultAmount: 5,
  });

  const html = container.innerHTML;
  assert.ok(html.includes("Pix Zap para Helena Silva"));
  assert.ok(html.includes("Post sobre permacultura"));
  assert.ok(html.includes("btn-zap-val"));
  assert.ok(html.includes("R$ 2"));
  assert.ok(html.includes("R$ 5"));
  assert.ok(html.includes("R$ 10"));
  assert.ok(html.includes("Outro"));
  assert.ok(html.includes("zap-payload-area"));
  // Valida que o payload gerado é BR Code EMV (inicia com 000201010211)
  assert.ok(html.includes("000201010211"));
  assert.ok(html.includes("btn-copy-zap-payload"));
  assert.ok(html.includes("O Vox não é PSP"));
  assert.ok(html.includes("100% offline"));

  render.closeZapModal(container);
  assert.equal(container.innerHTML, "");
});

