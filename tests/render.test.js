import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { UF_STEREOTYPE_SEEDS } from "../client/js/data/profiles-brazil-uf.js";

const demoMg = UF_STEREOTYPE_SEEDS.find((s) => s.uf === "MG");
const demoSp = UF_STEREOTYPE_SEEDS.find((s) => s.uf === "SP");
const mgPixKey = `${demoMg.handle.replace("-", ".")}@voxbrasil.org`;

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
const mock = await import("../client/js/mock.js");

test("render - renderOAuthEnrich usa botoes de marca Google/Meta", () => {
  const container = createContainer();
  render.renderOAuthEnrich(container);
  const html = container.innerHTML;
  assert.ok(html.includes("oauth-btn--google"));
  assert.ok(html.includes("oauth-btn--meta"));
  assert.ok(html.includes('id="btn-oauth-google"'));
  assert.ok(html.includes('id="oauth-enrich-error"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('aria-label="Entrar com Google para importar nome e foto"'));
  assert.ok(html.includes("oauth-btn__icon"));
  render.closeOAuthEnrich(container);
  assert.equal(container.innerHTML, "");
});

test("render - renderPactModal injeta o modal com termos e botoes", () => {
  const container = createContainer();
  render.renderPactModal(container);

  assert.ok(container.innerHTML.includes("Bem-vindo ao Vox"));
  assert.ok(container.innerHTML.includes("btn-pact-accept"));
  assert.ok(container.innerHTML.includes("btn-pact-settings"));
  assert.ok(container.innerHTML.includes("Seus dados são seus"));
  assert.ok(container.innerHTML.includes("modal-sheet"));
  assert.ok(container.innerHTML.includes("modal-card"));
  assert.ok(container.innerHTML.includes("modal-feature"));

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
    customRelayHttpUrl: "http://192.168.1.100:3920",
    relayHttpUrl: "http://192.168.1.100:3920",
    customTurn: { urls: "turn:turn.comunidade.org:3478", username: "vox_turn", credential: "123" },
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Sua rede"));
  assert.ok(html.includes("#/status"));
  assert.ok(html.includes("Ajudando a rede"));
  assert.ok(html.includes("3 aparelhos conectados"));
  assert.ok(html.includes("advanced-settings"));
  assert.ok(html.includes("net-pause"));
  assert.ok(html.includes("net-webrtc"));
  assert.ok(html.includes("ws://192.168.1.100:3921"));
  assert.ok(html.includes("net-relay-http-url"));
  assert.ok(html.includes("192.168.1.100:3920"));
  assert.ok(html.includes("turn:turn.comunidade.org:3478"));
  assert.ok(html.includes("vox_turn"));
  // Termos de infraestrutura restritos à seção Avançado
  assert.ok(!html.includes("127.0.0.1:3920"));
  assert.ok(html.includes("Camadas de participação"));
  assert.ok(html.includes("data-layer=\"active\""));
  assert.ok(html.includes("Você está aqui"));
  assert.ok(html.includes("#net-comm-only-wrap"));
  assert.ok(html.includes("#net-relay-steward"));
  assert.ok(html.includes("btn-export-contribution-attestation"));
  assert.ok(html.includes("Baixar Comprovante de Contribuição"));
});

test("render - inferParticipationLayer mapeia commOnly e relay", () => {
  assert.equal(render.inferParticipationLayer({ enabled: false }), "passive");
  assert.equal(render.inferParticipationLayer({ enabled: true }), "active");
  assert.equal(render.inferParticipationLayer({ enabled: true, commOnly: true }), "supporter");
  assert.equal(
    render.inferParticipationLayer({ enabled: true, commOnly: true, backgroundRelay: true }),
    "steward",
  );
  assert.equal(
    render.inferParticipationLayer({ enabled: true }, { customSignalingUrl: "wss://relay.local" }),
    "steward",
  );
});

test("render - renderNetworkSettings mostra Leitura reserva quando gateway critical", () => {
  const main = createContainer();
  render.renderNetworkSettings(main, {
    settings: { enabled: true, dailyCapMb: 50 },
    metrics: {},
    cacheStats: { count: 0, sizeKb: "0" },
    relayStatus: { online: false },
    dailyUsage: { bytesServedToday: 0 },
    notifPermission: "default",
    rtcStatus: { remotePeersConnected: 0 },
    customSignalingUrl: "",
    customRelayHttpUrl: "",
    customTurn: {},
    relayHttpUrl: "http://127.0.0.1:3920",
    gatewayHealth: { state: "critical", gateways: {}, lastReserveAt: Date.now() },
  });
  assert.ok(main.innerHTML.includes("Leitura reserva"));
});

test("render - renderStewardWizard passo 1", () => {
  const main = createContainer();
  render.renderStewardWizard(main, { step: 1, draft: {} });
  assert.ok(main.innerHTML.includes("Assistente steward"));
  assert.ok(main.innerHTML.includes("sw-pledge"));
});

test("render - renderNetworkSettings destaca Apoiador com commOnly", () => {
  const main = createContainer();
  render.renderNetworkSettings(main, {
    settings: { enabled: true, commOnly: true, dailyCapMb: 50, maxMb: 25 },
    metrics: {},
    cacheStats: {},
    relayStatus: { online: false },
    dailyUsage: {},
    notifPermission: "default",
    rtcStatus: {},
    customSignalingUrl: "",
    customTurn: {},
  });
  assert.ok(main.innerHTML.includes('data-layer="supporter"'));
  assert.ok(main.innerHTML.includes("Você está aqui"));
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
  assert.ok(html.includes("community-vox-card-list"));
  assert.ok(html.includes("community-vox-enter-btn"));
});

test("render - renderCommunity fork banner for mirror demo", () => {
  const main = createContainer();
  render.renderCommunity(main, "demo-aprenda-vox-mirror", [], mock.MOCK_DEMO_COMMUNITY_FORK, {
    activeTab: "posts",
  });
  const html = main.innerHTML;
  assert.ok(html.includes("community-vox-fork-banner"));
  assert.match(html, /Espelho comunit/i);
  assert.ok(html.includes("demo-aprenda-vox"));
});

test("render - computeCommunityNeighborStats sem amostra read_origin", () => {
  const stats = render.computeCommunityNeighborStats({
    recentPeople: [{ routeId: "vx_a", name: "A" }],
    communityId: "real-praca",
    gatewayState: "all_ok",
    readOriginStats: { total: 2, localReadPct: null, sufficient: false },
  });
  assert.equal(stats.localReadPct, null);
  assert.equal(stats.readOriginInsufficient, true);
});

test("render - painel Sustentada por vizinhos e seed checklist", () => {
  const main = createContainer();
  render.renderCommunity(main, "minha-comunidade", [], { title: "Pra�a", owner: "vx_owner" }, {
    activeTab: "posts",
    recentPeople: [{ routeId: "vx_a", name: "A" }],
    neighborStats: {
      onlineDevices: 2,
      localReadPct: 42,
      readOriginInsufficient: false,
      degraded: true,
      fewSupporters: true,
      isDemoEstimate: false,
    },
    commOnly: false,
    seedChecklist: {
      state: { activeAck: false, invitesSent: 0, commOnlyNudgeSeen: false, dismissed: false },
      ctx: { topicCount: 0, peerEnabled: true, commOnly: false },
    },
  });
  const html = main.innerHTML;
  assert.ok(html.includes("community-vox-neighbor"));
  assert.ok(html.includes("Sustentada por vizinhos"));
  assert.ok(html.includes("Velocidade reduzida"));
  assert.ok(html.includes("btn-neighbor-comm-only"));
  assert.ok(html.includes("#/settings/network"));
  assert.ok(html.includes("community-vox-neighbor-foot"));
  assert.ok(html.includes("community-vox-seed"));
  assert.ok(html.includes("Primeiros passos"));
  assert.ok(!html.includes("leaderboard"));
});

test("render - renderCommunity header compacto, Entrar e layout", () => {
  const main = createContainer();
  render.renderCommunity(main, "demo-aprenda-vox", [], mock.MOCK_DEMO_COMMUNITY, {
    isMember: false,
    activeTab: "posts",
    recentPeople: [{ routeId: "vx_demo_sp", name: "Demo SP" }],
    neighborStats: render.computeCommunityNeighborStats({
      recentPeople: [{ routeId: "vx_demo_sp", name: "Demo SP" }],
      communityId: "demo-aprenda-vox",
      isDemo: true,
    }),
  });
  const html = main.innerHTML;
  assert.ok(html.includes("community-vox-page"));
  assert.ok(html.includes("community-vox-header"));
  assert.ok(html.includes("Sustentada por vizinhos"));
  assert.ok(html.includes("community-vox-chip-list"));
  assert.ok(html.includes("community-vox-toolbar"));
  assert.ok(html.includes("Entrar"));
  assert.ok(html.includes("Recado da comunidade"));
  assert.ok(html.includes("community-vox-posts-wrap"));
  assert.ok(html.includes("community-vox-feed"));
  assert.ok(html.includes("?tab=members"));
  assert.ok(html.includes("Membros</a>"));
  assert.ok(!html.includes("community-vox-aside"));
  assert.ok(!html.includes("Membros online"));

  const mainMembers = createContainer();
  render.renderCommunity(mainMembers, "demo-aprenda-vox", [], mock.MOCK_DEMO_COMMUNITY, {
    isMember: false,
    activeTab: "members",
    recentPeople: [{ routeId: "vx_demo_sp", name: "Demo SP" }],
  });
  const membersHtml = mainMembers.innerHTML;
  assert.ok(membersHtml.includes("community-vox-members-panel"));
  assert.ok(membersHtml.includes("Membros online"));
  assert.ok(membersHtml.includes("community-vox-online-grid--tab"));
  const onlineFaces = (membersHtml.match(/community-vox-online-face/g) || []).length;
  assert.ok(onlineFaces >= 9, "members tab shows expanded online grid");
  assert.ok(membersHtml.includes("27 membros") || membersHtml.includes("27&nbsp;membros"));

  const mainMember = createContainer();
  render.renderCommunity(mainMember, "demo-aprenda-vox", [], mock.MOCK_DEMO_COMMUNITY, {
    isMember: true,
    activeTab: "posts",
  });
  assert.ok(mainMember.innerHTML.includes("is-member"));
  assert.ok(mainMember.innerHTML.includes("Membro"));
});

test("render - renderCommunity Posts tab usa lista de t�picos estilo f�rum (sem hero IG)", () => {
  const main = createContainer();
  const topics = mock.MOCK_DEMO_TOPICS.slice(0, 3);
  render.renderCommunity(main, "demo-aprenda-vox", topics, mock.MOCK_DEMO_COMMUNITY, {
    activeTab: "posts",
  });
  const html = main.innerHTML;
  assert.ok(html.includes("community-vox-topic-list"));
  assert.ok(html.includes("community-topic-row"));
  assert.ok(html.includes(`#/t/${encodeURIComponent(topics[0].id)}`));
  assert.ok(html.includes("resposta"));
  assert.ok(html.includes("community-topic-row-thumb"));
  assert.ok(!html.includes("post-media-hero"));
  assert.ok(!html.includes("post-photo-bleed"));
  assert.ok(!html.includes("feed-container community-vox-feed"));
});

test("render - renderDmList e renderDmThread", () => {
  const mainList = createContainer();
  const convs = [
    { peerAddress: "addr_bob", lastText: "E aí Alice", lastTs: Date.now() },
  ];
  render.renderDmList(mainList, convs, "addr_alice");
  assert.ok(mainList.innerHTML.includes("Mensagens"));
  assert.ok(mainList.innerHTML.includes("Conversas privadas neste navegador."));
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
  assert.ok(mainThread.innerHTML.includes("Online agora"));
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
  assert.ok(main.innerHTML.includes("feed-chrome"));
  assert.ok(main.innerHTML.includes("Primeiro post"));
  assert.ok(main.innerHTML.includes("Conteudo do post"));
  assert.ok(!main.innerHTML.includes("post-community-pill"));
  assert.ok(!main.innerHTML.includes(">Geral<"));
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
    activeTab: "about",
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
  assert.ok(!html.includes("cantina-balloon-2"));
  assert.ok(!html.includes("id=\"cantina-balloon-2\""));
  assert.ok(html.includes('aria-label="Porta da Cantina"'));
  assert.ok(!html.includes("cantina-title"));
  assert.ok(!html.includes("cantina-quote"));
  assert.ok(!html.includes("cantina-easter-egg"));
  assert.ok(!html.includes("<h2"));
  assert.ok(!html.includes("Seus bots vão ter que esperar do lado de fora"));
  assert.ok(html.includes("cantina-art-img"));
  assert.ok(html.includes("cantina-gate.jpg"));
  assert.ok(html.includes("Ilustração anime"));
  assert.ok(html.includes("bartender de túnica bege"));
  assert.ok(html.includes("dois balões pintados"));
  assert.ok(html.includes("Seus bots tem que esperar lá fora"));
  assert.ok(html.includes("Aqui não servimos esse tipo"));
  assert.ok(!html.includes("404"));
  assert.ok(!html.includes("This is not the web page"));
  assert.ok(!html.includes("Lucasfilm"));
  assert.ok(html.includes("btn-cantina-enter"));
  assert.ok(html.includes("Entrar — sou humano"));
  assert.ok(html.includes("O que isso significa?"));

  render.closeCantinaGate(container);
  assert.equal(container.innerHTML, "");
});

test("render - renderFeed e renderProfile com persona mock (MG tour)", () => {
  const avatar = "https://randomuser.me/api/portraits/med/women/12.jpg";
  const mainFeed = createContainer();
  const topics = [
    { id: "demo-post-mg", title: `${demoMg.displayName} mineira demo`, body: "Texto...", image: avatar, author: "vx_demo_mg", communityId: "demo-aprenda-vox", likesCount: 48 },
  ];
  render.renderFeed(mainFeed, topics);
  assert.ok(mainFeed.innerHTML.includes(demoMg.displayName));

  const mainProf = createContainer();
  render.renderProfile(mainProf, "vx_demo_mg", [{ communityId: "demo-aprenda-vox" }], false, "", {
    handle: demoMg.handle,
    displayName: demoMg.displayName,
    profileBio: "Perfil estereotipo demo.",
    posts: topics,
  });
  assert.ok(mainProf.innerHTML.includes(`@${demoMg.handle}`));
  assert.ok(mainProf.innerHTML.includes(demoMg.displayName));
  assert.ok(mainProf.innerHTML.includes("profile-stereotype-banner"));
  assert.ok(mainProf.innerHTML.includes("profile-grid"));
  assert.ok(mainProf.innerHTML.includes("respeitoso"));
  assert.ok(mainProf.innerHTML.includes("n\u00e3o me leve a mal"));
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

test("render - formatAbsoluteDate e formatAbsoluteDateTime formatam timestamps de forma inequívoca", () => {
  const d = new Date(2026, 9, 26, 9, 30);
  const ts = d.getTime();
  assert.equal(render.formatAbsoluteDate(ts), "26/10/2026");
  assert.match(render.formatAbsoluteDateTime(ts), /^26\/10\/2026 \d{2}:\d{2}$/);
  assert.equal(render.formatIsoTimestamp(ts), d.toISOString());
  assert.equal(render.formatAbsoluteDate(null), "");
  assert.equal(render.formatAbsoluteDate("invalid"), "");
  assert.equal(render.formatAbsoluteDateTime(null), "");
  assert.equal(render.formatIsoTimestamp(null), "");
});

test("render - renderPostAuthorMetaLines inclui data absoluta no card para evitar desinformação temporal", () => {
  const d = new Date(2022, 4, 15, 14, 20);
  const oldTs = d.getTime();
  const html = render.renderPostAuthorMetaLines(
    "vx_autor_antigo",
    { primary: "Carlos", secondaryHandle: "carlos", routeTitle: "vx_autor_antigo" },
    "24mês",
    { ts: oldTs }
  );
  assert.ok(html.includes("post-time-abs"), "missing post-time-abs class");
  assert.ok(html.includes("15/05/2022"), "missing absolute date 15/05/2022");
  assert.ok(html.includes(`title="${d.toISOString()}"`), "missing ISO title on time");
});

test("render - renderCommunityTopicRow mostra data absoluta inequívoca", () => {
  const d = new Date(2022, 4, 15, 14, 20);
  const html = render.renderCommunityTopicRow({
    id: "old-topic",
    title: "Arquivo antigo",
    author: "vx_autor_antigo",
    ts: d.getTime(),
    repliesCount: 0,
  });
  assert.ok(html.includes("15/05/2022"), "missing absolute date on community row");
  assert.ok(html.includes(d.toISOString()), "missing ISO title on community row");
});

test("render - inline composer e post-toolbar no feed", () => {
  const strip = render.renderInlineComposer({ userRouteId: "vx_demo_mg" });
  assert.ok(strip.includes("inline-composer"));
  assert.ok(strip.includes("form-inline-topic"));
  assert.ok(strip.includes("inline-topic-file"));
  assert.ok(strip.includes("inline-topic-char"));
  assert.ok(strip.includes('id="btn-inline-submit" disabled'));
  assert.ok(!strip.includes("composer-strip-link"));

  const main = createContainer();
  const topics = [
    { id: "post-1", title: "Novidade na rede", ts: Date.now() - 5 * 60000, author: "vx_demo_mg" },
  ];
  render.renderFeed(main, topics, { userRouteId: "vx_demo_mg" });
  assert.ok(main.innerHTML.includes("inline-composer"));
  assert.ok(main.innerHTML.includes("stories-strip"));
  assert.ok(main.innerHTML.includes("post-toolbar"));
  assert.ok(main.innerHTML.includes("5m"));
});

test("render - layout híbrido texto vs foto vs github", () => {
  assert.equal(render.getPostFeedLayout({ title: "Só texto" }), "text");
  assert.equal(render.getPostFeedLayout({ title: "Foto", image: "images/x.jpg" }), "photo");

  const textHtml = render.renderPostItem({
    id: "t-text",
    title: "Tweet",
    body: "Corpo",
    author: "vx_demo_lucas",
  });
  assert.ok(textHtml.includes('post-layout-text'));
  assert.ok(!textHtml.includes("post-media-container"));

  const photoHtml = render.renderPostItem({
    id: "t-photo",
    title: "Foto",
    image: "https://randomuser.me/api/portraits/med/women/12.jpg",
    author: "vx_demo_mg",
  });
  assert.ok(photoHtml.includes('post-layout-photo'));
  assert.ok(photoHtml.includes("post-media-container"));
  assert.ok(photoHtml.includes("post-media-hero"));
  assert.ok(photoHtml.includes("post-ig-header"));
  assert.ok(photoHtml.includes("post-ig-toolbar"));
  assert.ok(!photoHtml.includes("post-toolbar"));

  const ghHtml = render.renderPostItem({
    id: "t-gh",
    title: "README",
    author: "vx_demo_raj",
    githubGist: { label: "README", lines: ["# linha"] },
  });
  assert.ok(ghHtml.includes("post-layout-github"));
  assert.ok(ghHtml.includes("post-github-gist"));
});

test("render - btn-comment expande post-comments no card (sem #/t)", () => {
  const html = render.renderPostItem({
    id: "demo-post-mg",
    title: "No Insta, ninguém via minhas oficinas",
    author: "vx_demo_mg",
    communityId: "demo-aprenda-vox",
    repliesCount: 1,
  });

  assert.ok(html.includes('class="action-btn btn-comment"'));
  assert.ok(!html.includes('class="action-btn btn-comment" href='));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="post-comments-demo-post-mg"'));
  assert.ok(html.includes('id="post-comments-demo-post-mg"'));
  assert.ok(html.includes("post-comments"));
  assert.ok(html.includes(" hidden"));
  assert.ok(html.includes("post-comment-composer"));
  assert.ok(html.includes("Abrir thread"));
  assert.equal(render.commentsPanelId("demo-post-mg"), "post-comments-demo-post-mg");
});

test("render - renderPostComments lista replies mock no expander", () => {
  const replies = [
    {
      id: "demo-reply-sp-mg",
      author: "vx_demo_sp",
      body: `Uai, ${demoMg.displayName}! Aqui a gente se organiza sem pedir licenca pro algoritmo.`,
    },
    {
      id: "demo-reply-pri-1",
      author: "vx_demo_mg",
      body: "Resposta local de exemplo.",
    },
  ];
  const open = render.renderPostComments("demo-post-mg", "demo-aprenda-vox", {
    replies,
    expanded: true,
  });
  assert.ok(open.includes("is-open"));
  assert.ok(!open.includes('id="post-comments-demo-post-mg" hidden'));
  assert.ok(open.includes("inline-reply-demo-reply-sp-mg"));
  assert.ok(open.includes("inline-reply-demo-reply-pri-1"));
  assert.ok(open.includes("sem pedir licenca"));
  assert.ok(open.includes(`@${demoSp.handle}`));
  assert.ok(open.includes(demoMg.displayName));
  assert.ok(open.includes("post-comment-composer"));
  assert.ok(open.includes("btn-comment-react"));
  assert.ok(open.includes("btn-comment-reply"));
  assert.ok(open.includes('class="post-comment-action btn-comment-react'));
  assert.ok(open.includes("post-comment-nested-reply"));

  const empty = render.renderCommentList([]);
  assert.ok(empty.includes("Nenhuma resposta ainda."));
});

test("render - renderProfile com Pix e métricas honestas", () => {
  const main = createContainer();
  render.renderProfile(main, "vx_me", [], true, "", {
    displayName: "Meu Perfil",
    stats: { posts: 3, followers: 4, following: 2 },
    pixKey: "12345678909",
    pixKeyMasked: "***.456.789-**",
    activeTab: "about",
  });
  const html = main.innerHTML;
  assert.ok(html.includes("profile-grid-layout"));
  assert.ok(html.includes("profile-grid-avatar-wrap"));
  assert.ok(html.includes("publica"));
  assert.ok(html.includes("seguidores"));
  assert.ok(html.includes("seguindo"));
  assert.ok(html.includes("Chave Pix:"));
  assert.ok(html.includes("***.456.789-**"));
  assert.ok(html.includes("form-pix-key"));
});

test("render - renderPixLookup perfil encontrado vs nao vinculado", () => {
  const mainFound = createContainer();
  render.renderPixLookup(mainFound, mgPixKey, {
    routeId: "vx_demo_mg",
    name: demoMg.displayName,
    handle: demoMg.handle,
    pixKey: mgPixKey,
    pixKeyMasked: mgPixKey,
  });
  assert.ok(mainFound.innerHTML.includes("Conta Localizada"));
  assert.ok(mainFound.innerHTML.includes(demoMg.displayName));
  assert.ok(mainFound.innerHTML.includes("vx_demo_mg"));
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
      id: "demo-listing-mg",
      title: "Pão artesanal & geleia",
      priceLabel: "R$ 28",
      locationLabel: "Vila Madalena, SP",
      author: "vx_demo_mg",
      contactPix: mgPixKey,
      image: "https://randomuser.me/api/portraits/med/women/12.jpg",
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
  assert.ok(htmlFeira.includes("Apoiar"));
  assert.ok(htmlFeira.includes("btn-zap-post"));
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
    image: "https://randomuser.me/api/portraits/med/women/12.jpg",
    author: "vx_demo_mg",
    likesCount: 15,
    starsCount: 8,
  };

  const html = render.renderPostItem(post, { isPinned: true });
  assert.ok(!html.includes("post-header-tags"));
  assert.ok(!html.includes("📌 Fixado"));
  assert.ok(html.includes("post_hibrido_1"));
  assert.ok(html.includes("https://randomuser.me/api/portraits/med/women/12.jpg"));
  assert.ok(html.includes("btn-like"));
  assert.ok(html.includes("btn-overlay-follow"));
  assert.ok(html.includes("btn-save"));
  assert.ok(html.includes("post-ig-toolbar"));
  assert.ok(!html.includes("post-toolbar"));

  const imgIdx = html.indexOf("post-media-container");
  const titleIdx = html.indexOf("post-ig-toolbar");
  assert.ok(imgIdx !== -1, "Deve conter post-media-container");
  assert.ok(titleIdx !== -1, "Deve conter post-photo-title");
  assert.ok(imgIdx < titleIdx, "Mídia deve preceder o título");
  assert.ok(!html.includes("post-caption-block"));
  assert.ok(html.includes("post-photo-message"));
  assert.ok(html.includes("soberania"));
});

test("render - feed nav na sidebar (Para você e Seguindo)", () => {
  const forYou = render.renderFeedNav("for-you");
  assert.ok(forYou.includes("sidebar-feed-nav"));
  assert.ok(forYou.includes("Para você"));
  assert.ok(forYou.includes("Seguindo"));
  assert.ok(forYou.includes("sidebar-feed-tab active"));
  assert.ok(!forYou.includes('m3 9 9-7 9 7v11'));

  const following = render.renderFeedNav("following");
  assert.ok(following.includes('href="#/?feed=following"'));
  assert.ok(following.includes("sidebar-feed-tab active"));
  assert.ok(following.includes("polyline points=\"16 11 18 13 22 9\""));
});

test("render - feed sem abas duplicadas no chrome", () => {
  const main = createContainer();
  const topics = [
    { id: "p1", title: "Primeiro post", author: "vx_demo_mg" },
  ];

  render.renderFeed(main, topics, { activeFeed: "for-you" });
  assert.ok(!main.innerHTML.includes("feed-segmented-nav"));
  assert.ok(main.innerHTML.includes("feed-chrome"));

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
    author: "vx_demo_sp",
  };
  const md = render.formatPostMarkdown(post);
  assert.ok(md.includes(`@${demoSp.handle}`));
  assert.ok(md.includes("> **"));
  assert.ok(md.includes("Governan"));
  assert.ok(md.includes("Proposta de delibera"));
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
    activeTab: "about",
  });

  const html = main.innerHTML;
  assert.ok(html.includes("README.md"));
  assert.ok(html.includes("Sistemas Distribuídos"));
  assert.ok(html.includes("Criptografia P-256"));
  assert.ok(html.includes("profile-github-badge"));
  assert.ok(html.includes("@raj-crypto"));
  assert.ok(html.includes("btn-watch-profile"));
  assert.ok(html.includes("Seguir"));
  assert.ok(html.includes("profile-grid-tabs"));
  assert.ok(html.includes("Sobre"));

  const mainGrid = createContainer();
  render.renderProfile(mainGrid, "vx_demo_raj", [], false, "", {
    handle: "raj",
    posts: [{ id: "post_raj", title: "Criptografia Local", author: "vx_demo_raj", image: "images/x.jpg" }],
    activeTab: "posts",
  });
  assert.ok(mainGrid.innerHTML.includes("profile-grid-item"));
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
      author: "vx_demo_mg",
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
    author: "vx_demo_sp",
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
      { author: "vx_demo_sp", choice: "yes", eligible: true, reason: "", ts: Date.now() - 3000 },
      { author: "vx_demo_raj", choice: "yes", eligible: true, reason: "", ts: Date.now() - 2000 },
      { author: "vx_demo_carlos", choice: "no", eligible: true, reason: "", ts: Date.now() - 1000 },
      { author: "vx_demo_mateus", choice: "yes", eligible: false, reason: "adesão posterior ao marco de corte", ts: Date.now() },
    ],
  };

  render.renderProposalDetail(main, proposal, tally, {
    userVote: { choice: "yes" },
    isEligible: true,
    isMember: true,
    userAddress: "vx_demo_sp",
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
  // vx_demo_mg possui pixKey no mock (ex.: alice.mg@voxbrasil.org)
  const postWithPix = {
    id: "p_helena_1",
    author: "vx_demo_mg",
    title: "Post da Helena com Pix",
    body: "Conteúdo livre",
    ts: Date.now() - 60000,
  };
  const htmlPix = render.renderPostItem(postWithPix);
  assert.ok(htmlPix.includes("btn-zap-post"));
  assert.ok(htmlPix.includes(`data-pix="${mgPixKey}"`));
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
    author: "vx_demo_mg",
    authorName: demoMg.displayName,
    pixKey: mgPixKey,
    title: "Post sobre permacultura",
    defaultAmount: 5,
  });

  const html = container.innerHTML;
  assert.ok(html.includes(`Pix Zap para ${demoMg.displayName}`));
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

test("render - renderStoriesStrip gera faixa horizontal com anéis de stories e personas do tour", () => {
  const html = render.renderStoriesStrip();
  assert.ok(html.includes("stories-strip"));
  assert.ok(html.includes("story-ring"));
  assert.ok(html.includes("story-avatar"));
  assert.ok(html.includes("#/u/vx_demo_mg"));
  assert.ok(html.includes(demoMg.displayName));
  assert.ok(html.includes("#/u/vx_demo_sp"));
  assert.ok(html.includes("vx_demo_sp"));
});

test("render - renderPostItem pilha vertical foto com header sobre m�dia, toolbar tripartida e caption block", () => {
  const post = {
    id: "post_meta_stack_1",
    title: "Título do Post Meta",
    body: "Corpo com #fotografia e #arte em publica��o com foto",
    image: "https://randomuser.me/api/portraits/med/women/12.jpg",
    author: "vx_demo_mg",
    likesCount: 10,
    starsCount: 4,
    repliesCount: 2,
    ts: Date.now(),
  };

  const html = render.renderPostItem(post);
  assert.ok(html.includes("post-media-header"));
  assert.ok(!html.includes("post-overlay-author"));
  assert.ok(html.includes("post-ig-toolbar"));
  assert.ok(html.includes("btn-overlay-follow"));
  assert.ok(!html.includes("post-caption-block"));
  assert.ok(!html.includes("post-toolbar"));
  assert.ok(html.includes("post-media-hero"));
  assert.ok(html.includes("post-media-lightbox-trigger"));
  assert.ok(html.includes("btn-like"));
  assert.ok(html.includes("btn-comment"));
  assert.ok(html.includes("btn-share-post"));
  assert.ok(html.includes("btn-save"));
  assert.ok(!html.includes("post-photo-title"));
  assert.ok(!html.includes("btn-star") || html.indexOf("btn-star") > html.indexOf("post-comments"));

  const mediaIdx = html.indexOf("post-media-container");
  const actionsIdx = html.indexOf("post-ig-toolbar");
  const commentsIdx = html.indexOf('class="post-comments');

  assert.ok(mediaIdx < html.indexOf("post-ig-header") && html.indexOf("post-ig-header") < actionsIdx);
  assert.ok(actionsIdx < commentsIdx);
  const mediaSlice = html.slice(html.indexOf("post-media-container"), commentsIdx);
  assert.ok(mediaSlice.includes("post-ig-toolbar"));
  assert.ok(!mediaSlice.includes("post-comments-surface"), "Comentários não no hero");
  assert.ok(html.includes("post-comments-surface"));
  assert.ok(html.includes("post-photo-message"));
  assert.ok(html.includes("#fotografia"));
});

test("render - Seguir no hero oculto em post pr�prio e Vox oficial", () => {
  const own = render.renderPostItem({
    id: "own1",
    title: "Meu post",
    image: "https://example.com/a.jpg",
    author: "vx_me",
    isOwnLocalPost: true,
    ts: Date.now(),
  });
  assert.ok(!own.includes("btn-overlay-follow"));

  const official = render.renderPostItem({
    id: "vox1",
    title: "Novidade",
    image: "https://example.com/b.jpg",
    author: "vx_voxbrasil_welcome",
    ts: Date.now(),
  });
  assert.ok(!official.includes("btn-overlay-follow"));
  assert.ok(official.includes("post-media-header-verified"));
});

test("render - resolvePostAuthorLabels evita ID truncado duplicado", () => {
  const route = "vx_1QvABCDEFGHIJKpX7a";
  const labels = render.resolvePostAuthorLabels(route);
  assert.equal(labels.primary, render.shortId(route));
  assert.equal(labels.secondaryHandle, "");
  assert.equal(labels.routeTitle, route);
});

test("render - resolvePostAuthorLabels nome + handle distintos", () => {
  const labels = render.resolvePostAuthorLabels("vx_demo_mg");
  assert.equal(labels.primary, demoMg.displayName);
  assert.equal(labels.secondaryHandle, demoMg.handle);
});

test("render - renderPostOwnerMenu só aparece em posts isOwnLocalPost", () => {
  const own = {
    id: "p_own",
    title: "Meu post",
    body: "Texto",
    author: "vx_me",
    isOwnLocalPost: true,
    type: "topic",
    ts: Date.now(),
  };
  const tour = {
    id: "demo-post-mg",
    title: "Tour",
    author: "vx_demo_mg",
    isLocalP2p: true,
    type: "topic",
    ts: Date.now(),
  };
  const ownHtml = render.renderPostItem(own);
  const tourHtml = render.renderPostItem(tour);
  assert.ok(ownHtml.includes("btn-post-edit"));
  assert.ok(ownHtml.includes("btn-post-delete"));
  assert.ok(ownHtml.includes("post-local-sync-hint"));
  assert.ok(ownHtml.includes("btn-text-quiet"));
  assert.ok(!ownHtml.includes("Local imediato; com pares online"));
  assert.ok(!tourHtml.includes("btn-post-edit"));
  assert.ok(!tourHtml.includes("btn-post-delete"));
});

test("render - post header limpo sem chips e title no autor", () => {
  const route = "vx_1QvABCDEFGHIJKpX7a";
  const html = render.renderPostItem({
    id: "p_hdr",
    title: "T",
    body: "B",
    author: route,
    isLocalP2p: true,
    communityId: "demo-aprenda-vox",
    communityTitle: "Aprenda o Vox",
    type: "topic",
    ts: Date.now(),
  });
  assert.ok(!html.includes("post-header-tags"));
  assert.ok(!html.includes("Na rede"));
  assert.ok(!html.includes("Aprenda o Vox"));
  assert.ok(html.includes(`title="${route}"`));
  const handleMatches = html.match(/class="post-handle"/g) || [];
  assert.equal(handleMatches.length, 0, "sem @handle duplicado quando só há ID");
});

test("render - renderTopic inclui menu Editar/Apagar para post próprio", () => {
  const main = createContainer();
  const topic = {
    id: "top_own_detail",
    title: "Meu post",
    body: "Texto na thread",
    author: "vx_me",
    isOwnLocalPost: true,
    type: "topic",
    ts: Date.now(),
  };
  render.renderTopic(main, "top_own_detail", topic, []);
  assert.ok(main.innerHTML.includes("btn-post-edit"));
  assert.ok(main.innerHTML.includes("btn-post-delete"));
  assert.ok(main.innerHTML.includes('data-id="top_own_detail"'));
});

test("render - compositor inline inclui microcopy honesta de edit/apagar local", () => {
  const html = render.renderInlineComposer({ userRouteId: "vx_me", displayName: "Eu" });
  assert.ok(html.includes("inline-composer-local-hint"));
  assert.ok(html.includes("gossip"));
});

test("render - compositor inline inclui hatch civic wallet (T-15)", () => {
  const html = render.renderInlineComposer({ userRouteId: "vx_me", displayName: "Eu" });
  assert.match(html, /href="#\/wallet"/);
  assert.match(html, /Criar ou importar chave/);
});

test("render - renderPeopleSearch seções e paste connect", () => {
  const main = createContainer();
  render.renderPeopleSearch(main, {
    sections: {
      contacts: [{ routeId: "vx_c", name: "Contato", source: "contact" }],
      mesh: [{ routeId: "vx_m", name: "Malha", source: "mesh-card" }],
      tour: [],
    },
    results: [],
    query: "",
  });
  assert.ok(main.innerHTML.includes("Contatos"));
  assert.ok(main.innerHTML.includes("Na malha"));
  assert.ok(main.innerHTML.includes("form-people-paste-link"));
});

test("render - renderNetworkSettings inclui toggle malha", () => {
  const main = createContainer();
  render.renderNetworkSettings(main, {
    settings: { enabled: true, maxMb: 25, dailyCapMb: 50, wifiOnly: true, webrtcEnabled: true },
    metrics: {},
    cacheStats: { count: 0, sizeKb: "0" },
    relayStatus: { online: false },
    dailyUsage: { bytesServedToday: 0 },
    notifPermission: "default",
    rtcStatus: { remotePeersConnected: 0 },
    customSignalingUrl: "",
    customRelayHttpUrl: "",
    relayHttpUrl: "",
    customTurn: {},
    meshDiscoverable: true,
  });
  assert.ok(main.innerHTML.includes("net-mesh-discoverable"));
  assert.ok(main.innerHTML.includes("busca da malha"));
});

test("render - modal pós-pacto connect", () => {
  const container = createContainer();
  render.renderPostPactConnectModal(container, "vx_testroute123456");
  assert.ok(container.innerHTML.includes("post-pact-connect-overlay"));
  assert.ok(container.innerHTML.includes("#/connect/"));
  assert.ok(container.innerHTML.includes("modal-card"));
  assert.ok(!container.innerHTML.includes('class="modal-dialog card"'));
  render.closePostPactConnectModal(container);
  assert.equal(container.innerHTML, "");
});

