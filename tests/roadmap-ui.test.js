import test from "node:test";
import assert from "node:assert/strict";
import * as render from "../client/js/render.js";
import * as polis from "../client/js/polis.js";

function createContainer() {
  return { innerHTML: "" };
}

test("roadmap-ui: renderPolisReportHtml renderiza pontes de consenso e pontos divisivos", () => {
  const statements = [
    { id: "s_bridge", text: "Proteger recursos hídricos municipais" },
    { id: "s_divisive", text: "Privatizar saneamento básico" },
  ];
  const votes = [
    // s_bridge: Ambos os grupos concordam
    { statementId: "s_bridge", voter: "a1", vote: 1 },
    { statementId: "s_bridge", voter: "a2", vote: 1 },
    { statementId: "s_bridge", voter: "b1", vote: 1 },
    { statementId: "s_bridge", voter: "b2", vote: 1 },

    // s_divisive: Grupo A concorda, Grupo B discorda
    { statementId: "s_divisive", voter: "a1", vote: 1 },
    { statementId: "s_divisive", voter: "a2", vote: 1 },
    { statementId: "s_divisive", voter: "b1", vote: -1 },
    { statementId: "s_divisive", voter: "b2", vote: -1 },
  ];

  const report = polis.computePolisReport(statements, votes);
  const html = render.renderPolisReportHtml(report);

  assert.ok(html.includes("Deliberação Pol.is-lite"));
  assert.ok(html.includes("4 participantes"));
  assert.ok(html.includes("2 afirmações"));
  assert.ok(html.includes("Ponte de Consenso"));
  assert.ok(html.includes("Ponto Divisivo"));
  assert.ok(html.includes("Proteger recursos hídricos municipais"));
  assert.ok(html.includes("Privatizar saneamento básico"));
  assert.ok(html.includes("polis-statement-card"));
  assert.ok(html.includes("polis-vote-bar"));
});

test("roadmap-ui: renderProfile exibe backup de identidade para conta própria", () => {
  const main = createContainer();
  render.renderProfile(main, "vx_me", [], true, "", {
    displayName: "Minha Conta",
    activeTab: "about",
  });
  const html = main.innerHTML;
  assert.ok(html.includes("Arquivo de soberania") || html.includes("profile-sovereignty-export"));
  assert.ok(html.includes("btn-export-account"));
  assert.ok(html.includes("file-import-account"));
  assert.ok(html.includes("accept=\".json,.voxid,application/json\""));
  assert.ok(html.includes("deste aparelho"));
  assert.ok(html.includes("IndexedDB"));
  assert.ok(html.includes("seguidores"));
  assert.ok(!html.includes("btn-toggle-block"));
});

test("roadmap-ui: renderProfile exibe moderação local para outro autor", () => {
  const mainOther = createContainer();
  render.renderProfile(mainOther, "vx_outro_usuario", [], false, "", {
    displayName: "Outro Usuário",
    isBlocked: false,
    isMuted: false,
  });
  const htmlOther = mainOther.innerHTML;
  assert.ok(htmlOther.includes("btn-toggle-block"));
  assert.ok(htmlOther.includes("btn-toggle-mute"));
  assert.ok(htmlOther.includes("Bloquear"));
  assert.ok(htmlOther.includes("Silenciar"));

  const mainBlocked = createContainer();
  render.renderProfile(mainBlocked, "vx_outro_usuario", [], false, "", {
    displayName: "Outro Usuário",
    isBlocked: true,
    isMuted: true,
  });
  const htmlBlocked = mainBlocked.innerHTML;
  assert.ok(htmlBlocked.includes("Desbloquear"));
  assert.ok(htmlBlocked.includes("Desilenciar"));
});

test("roadmap-ui: renderNetworkSettings inclui seção de moderação local e regras", () => {
  const main = createContainer();
  render.renderNetworkSettings(main, {
    settings: { enabled: true },
    metrics: {},
    cacheStats: { count: 0 },
    relayStatus: { online: false },
    dailyUsage: {},
    notifPermission: "denied",
    rtcStatus: { remotePeersConnected: 0 },
    blockedUsers: ["vx_bad_actor_123"],
    mutedUsers: ["vx_noisy_user_456"],
  });

  const html = main.innerHTML;
  assert.ok(html.includes("Moderação Local &amp; Filtros") || html.includes("Moderação Local & Filtros"));
  assert.ok(html.includes("Autores Bloqueados (1)"));
  assert.ok(html.includes("Autores Silenciados (1)"));
  assert.ok(html.includes("btn-export-moderation"));
  assert.ok(html.includes("file-import-moderation"));
  assert.ok(html.includes("btn-unblock-item"));
  assert.ok(html.includes("btn-unmute-item"));
});

test("roadmap-ui: getPostFeedLayout e renderPostItem suportam mediaRef P2P", () => {
  const postWithMediaRef = {
    id: "tx-media-ref-1",
    author: "vx_author_media",
    title: "Foto Desacoplada",
    body: "Post com mediaRef content-addressed",
    mediaRef: {
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      mime: "image/webp",
      byteLength: 4096,
    },
  };

  assert.equal(render.getPostFeedLayout(postWithMediaRef), "photo");

  const postHtml = render.renderPostItem(postWithMediaRef);
  assert.ok(postHtml.includes("post-media-container"));
  assert.ok(postHtml.includes("post-media-lazy"));
  assert.ok(postHtml.includes("data-media-hash=\"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\""));
});
