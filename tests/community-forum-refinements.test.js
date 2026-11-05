import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

function createMockEl(tag = "div") {
  return {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    innerHTML: "",
    value: "",
    attributes: {},
    style: {},
    children: [],
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    remove() {},
  };
}

const mockRoot = createMockEl("div");
mockRoot.id = "app-root";
const mockMain = createMockEl("main");
mockMain.id = "app-main";

globalThis.document = {
  body: createMockEl("body"),
  createElement: (tag) => createMockEl(tag),
  getElementById: (id) => {
    if (id === "app-root") return mockRoot;
    if (id === "app-main") return mockMain;
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
};

const localAccount = await import("../client/js/local-account.js");
const screensCompose = await import("../client/js/app/screens-compose.js");
const screensCommunity = await import("../client/js/app/screens-community.js");
const screensHome = await import("../client/js/app/screens-home.js");
const cacheNode = await import("../client/js/cache-node.js");
const profileDirectory = await import("../client/js/profile-directory.js");
const render = await import("../client/js/render.js");
const welcomeProfile = await import("../client/js/vox-welcome-profile.js");

test("community-forum-refinements - persistLocalReply rejeita envio para tópico encerrado/trancado", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();

  const lockedTopic = {
    id: "top_locked_debate",
    type: "topic",
    communityId: "vox",
    title: "Debate Trancado",
    body: "Este debate foi encerrado.",
    author: "vx_moderador",
    isLocked: true,
  };
  await cacheNode.saveLocalPost(lockedTopic);

  await assert.rejects(
    async () => {
      await screensCompose.persistLocalReply("top_locked_debate", "vox", "Minha réplica tardia");
    },
    /encerrado/i,
    "Deve lançar erro impedindo respostas a tópicos encerrados"
  );

  localAccount.wipeLocalAccount();
});

test("community-forum-refinements - showComposeReply renderiza aviso de encerramento em tópico trancado", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();

  const lockedTopic = {
    id: "top_locked_ui",
    type: "topic",
    communityId: "vox",
    title: "Debate Trancado UI",
    body: "Discussão fechada.",
    author: "vx_mod",
    isLocked: true,
  };
  await cacheNode.saveLocalPost(lockedTopic);

  mockMain.innerHTML = "";
  await screensCompose.showComposeReply("top_locked_ui", "vox");

  assert.ok(mockMain.innerHTML.includes("Discussão Encerrada") || mockMain.innerHTML.includes("🔒"));
  assert.equal(mockMain.innerHTML.includes('id="form-compose-reply"'), false, "Formulário não deve ser renderizado para tópico encerrado");

  localAccount.wipeLocalAccount();
});

test("community-forum-refinements - renderComposeReply exibe contexto do comentário pai quando parentId presente", () => {
  const main = createMockEl("div");
  render.renderComposeReply(main, "top_1", "vox", {
    parentId: "rep_456",
    parentAuthor: "lucia_democracia",
    parentExcerpt: "Texto do comentário pai sobre soberania",
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Respondendo a @lucia_democracia"));
  assert.ok(html.includes("Texto do comentário pai sobre soberania"));
  assert.ok(html.includes('id="form-compose-reply"'));
});

test("community-forum-refinements - renderComposeTopic inclui campo de título opcional para novos debates", () => {
  const main = createMockEl("div");
  render.renderComposeTopic(main, "vox");

  const html = main.innerHTML;
  assert.ok(html.includes('id="topic-title"'), "Deve incluir input topic-title");
  assert.ok(html.includes('id="topic-body"'), "Deve incluir textarea topic-body");
});

test("community-forum-refinements - tópico oficial manifesto existe e é fixado na comunidade vox", async () => {
  const { topic } = await screensCommunity.resolveTopicContent(
    welcomeProfile.OFFICIAL_WELCOME_TOPIC_ID,
    "vox",
    null
  );
  assert.ok(topic, "Tópico de boas-vindas oficial deve ser resolvido");
  assert.equal(topic.communityId, "vox");
  assert.equal(topic.isPinned, true);
  assert.equal(topic.isOfficial, true);
});

test("community-forum-refinements - checkCommunityMembership valida regras da comunidade vox e soberania", async () => {
  await cacheNode.clearLocalPosts();
  const user = "vx_cidadao_livre";

  // Usuário nunca saiu: padrão para 'vox' é true
  const isDefaultMem = await screensCommunity.checkCommunityMembership("vox", user);
  assert.equal(isDefaultMem, true, "Qualquer usuário é membro padrão de vox");

  // Se o usuário registrar saída voluntária
  await cacheNode.saveLocalPost({
    id: "leave_vox_1",
    type: "membership_leave",
    communityId: "vox",
    author: user,
    owner: user,
    leftAt: Date.now(),
    ts: Date.now(),
  });

  const hasLeft = await screensCommunity.checkCommunityMembership("vox", user);
  assert.equal(hasLeft, false, "Usuário que saiu soberanamente não é mais membro");

  // Se o usuário entrar de novo depois da saída
  await cacheNode.saveLocalPost({
    id: "join_vox_2",
    type: "membership",
    communityId: "vox",
    author: user,
    owner: user,
    joinedAt: Date.now() + 1000,
    ts: Date.now() + 1000,
  });

  const reJoined = await screensCommunity.checkCommunityMembership("vox", user);
  assert.equal(reJoined, true, "Usuário que retornou após saída volta a ser membro");
});

test("community-forum-refinements - filterClosedCommunityTopics bloqueia vazamento de tópicos de comunidades fechadas no feed para não-membros", async () => {
  await cacheNode.clearLocalPosts();

  // Salva uma comunidade fechada no cache local
  await cacheNode.saveLocalPost({
    id: "comm_secreta",
    type: "community",
    title: "Grupo Fechado de Debate",
    visibility: "closed",
    owner: "vx_lider",
    ts: Date.now(),
  });

  const topics = [
    { id: "top_aberto", communityId: "vox", title: "Pauta Aberta" },
    { id: "top_sem_comm", title: "Post Geral" },
    { id: "top_fechado", communityId: "comm_secreta", title: "Pauta Restrita" },
  ];

  // Visitante não-membro: não deve ver 'top_fechado'
  const outAnon = await screensHome.filterClosedCommunityTopics(topics, null);
  assert.deepEqual(outAnon.map((t) => t.id), ["top_aberto", "top_sem_comm"]);

  const userNaoMembro = "vx_visitante_curioso";
  const outNaoMembro = await screensHome.filterClosedCommunityTopics(topics, userNaoMembro);
  assert.deepEqual(outNaoMembro.map((t) => t.id), ["top_aberto", "top_sem_comm"]);

  // Usuário membro: entra no grupo fechado
  const userMembro = "vx_membro_efetivo";
  await cacheNode.saveLocalPost({
    id: "mem_secreta_1",
    type: "membership",
    communityId: "comm_secreta",
    author: userMembro,
    owner: userMembro,
    joinedAt: Date.now(),
    ts: Date.now(),
  });

  const outMembro = await screensHome.filterClosedCommunityTopics(topics, userMembro);
  assert.deepEqual(outMembro.map((t) => t.id), ["top_aberto", "top_sem_comm", "top_fechado"]);
});

test("community-forum-refinements - buildCommunityRecentPeople traz diretório de pessoas detectáveis para comunidade vox", async () => {
  await cacheNode.clearLocalPosts();
  profileDirectory.__resetProfileCardsForTests();

  // Cadastra pessoas conhecidas no diretório
  profileDirectory.setProfileCard("vx_participante_1", {
    name: "Carlos Participante",
    handle: "carlos_part",
    discoverable: true,
  });
  profileDirectory.setProfileCard("vx_participante_2", {
    name: "Denise Democrata",
    handle: "denise_dem",
    discoverable: true,
  });

  const meta = { id: "vox", owner: "vx_voxbrasil_welcome" };
  const recent = await screensCommunity.buildCommunityRecentPeople([], meta, null, false, "members", "vox");

  const routeIds = recent.map((p) => p.routeId);
  assert.ok(routeIds.includes("vx_voxbrasil_welcome"), "Dono da comunidade deve estar na lista");
  assert.ok(routeIds.includes("vx_participante_1"), "Participante 1 deve ser descoberto");
  assert.ok(routeIds.includes("vx_participante_2"), "Participante 2 deve ser descoberto");

  profileDirectory.__resetProfileCardsForTests();
});

test("community-forum-refinements - renderTopicDetailText renderiza título do tópico com h1", () => {
  const html = render.renderTopicDetailText("top_123", "Título da Proposta Cívica", "Corpo da mensagem sobre governança popular");
  assert.ok(html.includes("topic-detail-title"), "Deve conter classe topic-detail-title");
  assert.ok(html.includes("Título da Proposta Cívica"), "Deve exibir o título formatado");
  assert.ok(html.includes("Corpo da mensagem sobre governança popular"));
});

test("community-forum-refinements - renderTopic exibe link de retorno para início se commId ausente", () => {
  const container = { innerHTML: "" };
  const topic = {
    id: "top_solto",
    title: "Tópico Sem Comunidade Explícita",
    body: "Conteúdo do post direto",
    author: "vx_autor",
  };
  render.renderTopic(container, "top_solto", topic, [], { isMod: false, communityId: "" });
  assert.ok(container.innerHTML.includes("href=\"#/\""), "Deve conter link para início #/");
  assert.ok(container.innerHTML.includes("Voltar ao início"));
});

test("community-forum-refinements - renderTopicRepliesBlock omite botão responder quando tópico trancado", () => {
  const container = { innerHTML: "" };
  const topic = {
    id: "top_trancado_total",
    title: "Debate Encerrado",
    body: "Conteúdo congelado",
    author: "vx_autor",
    isLocked: true,
  };
  const replies = [
    { id: "rep_1", body: "Comentário anterior ao trancamento", author: "vx_user_1", ts: 1000 },
  ];
  render.renderTopic(container, "top_trancado_total", topic, replies, { isMod: false, communityId: "vox" });
  assert.equal(container.innerHTML.includes("btn-reply-to-reply"), false, "Não deve conter botões de responder nas respostas de tópico trancado");
  assert.ok(container.innerHTML.includes("🔒 Esta discussão foi encerrada"));
});
