import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const frames = await import("../client/js/frames.js");
const render = await import("../client/js/render.js");
const cacheNode = await import("../client/js/cache-node.js");

test("frames - parseFrame valida campos obrigatorios e regras de seguranca", () => {
  // Rejeita objeto vazio ou nulo
  assert.equal(frames.parseFrame(null).valid, false);
  assert.equal(frames.parseFrame({}).valid, false);

  // Rejeita frame sem of:accepts:vox
  const noAccepts = { kind: "poll", "of:image": "test.jpg", "of:button:1": "Opção A" };
  const resNoAccepts = frames.parseFrame(noAccepts);
  assert.equal(resNoAccepts.valid, false);
  assert.ok(resNoAccepts.error.includes("of:accepts:vox"));

  // Rejeita kinds fora da allowlist (poll, petition, clt)
  const invalidKind = { "of:accepts:vox": "vox", kind: "crypto-casino", "of:image": "test.jpg", "of:button:1": "Apostar" };
  const resInvalidKind = frames.parseFrame(invalidKind);
  assert.equal(resInvalidKind.valid, false);
  assert.ok(resInvalidKind.error.includes("allowlist"));

  // Rejeita frame sem imagem
  const noImage = { "of:accepts:vox": "vox", kind: "poll", "of:button:1": "Opção A" };
  assert.equal(frames.parseFrame(noImage).valid, false);

  // Rejeita frame sem botões
  const noButtons = { "of:accepts:vox": "vox", kind: "poll", "of:image": "test.jpg" };
  assert.equal(frames.parseFrame(noButtons).valid, false);

  // Aceita frame válido
  const validPoll = {
    "of:accepts:vox": "vox",
    kind: "poll",
    title: "Oficina Popular",
    "of:image": "images/test.jpg",
    "of:button:1": "Rádio",
    "of:button:2": "Pão",
    "of:button:3": "Marcenaria",
    initialVotes: { 1: 10, 2: 20, 3: 10 },
  };
  const resValid = frames.parseFrame(validPoll);
  assert.equal(resValid.valid, true);
  assert.equal(resValid.frame.kind, "poll");
  assert.equal(resValid.frame.buttons.length, 3);
  assert.equal(resValid.frame.buttons[0].label, "Rádio");
  assert.equal(resValid.frame.buttons[0].action, "post");
});

test("frames - fast local storage salva e recupera acao instantanea do usuario", () => {
  frames.clearUserFrameActions();
  assert.equal(frames.getUserFrameAction("post_123"), null);

  frames.saveUserFrameAction("post_123", { buttonIndex: 2, buttonLabel: "Pão", author: "vx_alice" });
  const saved = frames.getUserFrameAction("post_123");
  assert.ok(saved);
  assert.equal(saved.buttonIndex, 2);
  assert.equal(saved.buttonLabel, "Pão");

  frames.clearUserFrameActions();
  assert.equal(frames.getUserFrameAction("post_123"), null);
});

test("frames - computePollState apura votos com regra 1 membro = 1 voto e porcentagens", () => {
  const frame = {
    kind: "poll",
    buttons: [
      { index: 1, label: "A" },
      { index: 2, label: "B" },
    ],
    initialVotes: { 1: 3, 2: 7 }, // total inicial: 10
  };

  // Sem ações extras
  const state0 = frames.computePollState(frame, []);
  assert.equal(state0.totalVotes, 10);
  assert.equal(state0.options[0].count, 3);
  assert.equal(state0.options[0].percent, 30);
  assert.equal(state0.options[1].count, 7);
  assert.equal(state0.options[1].percent, 70);

  // Com ações de pares recebidas via gossip
  const actions = [
    { author: "vx_alice", buttonIndex: 1 },
    { author: "vx_bob", buttonIndex: 2 },
    // Alice muda seu voto para B:
    { author: "vx_alice", buttonIndex: 2 },
  ];
  const state1 = frames.computePollState(frame, actions);
  // Alice votou em B (1 voto), Bob votou em B (1 voto) -> total 12 (+2 em B)
  assert.equal(state1.totalVotes, 12);
  assert.equal(state1.options[0].count, 3); // 3/12 = 25%
  assert.equal(state1.options[0].percent, 25);
  assert.equal(state1.options[1].count, 9); // 9/12 = 75%
  assert.equal(state1.options[1].percent, 75);
});

test("frames - computePetitionState apura assinaturas unicas e progresso da meta", () => {
  const frame = {
    kind: "petition",
    initialSignatures: 40,
    goal: 50,
    buttons: [{ index: 1, label: "Assinar" }],
  };

  const actions = [
    { author: "vx_alice" },
    { author: "vx_bob" },
    { author: "vx_alice" }, // duplicado não conta 2 vezes
  ];

  const state = frames.computePetitionState(frame, actions);
  assert.equal(state.signaturesCount, 42); // 40 base + 2 unicos
  assert.equal(state.goal, 50);
  assert.equal(state.percent, 84); // 42/50 = 84%
  assert.equal(state.hasSigned, false);

  const localState = frames.computePetitionState(frame, actions, { author: "vx_me", buttonIndex: 1 });
  assert.equal(localState.signaturesCount, 43);
  assert.equal(localState.hasSigned, true);
});

test("frames - computeCltState simula ferias, 13o e rescisao pelo salario minimo", () => {
  const frame = {
    kind: "clt",
    title: "Simulador CLT",
    buttons: [
      { index: 1, label: "Férias" },
      { index: 2, label: "13º" },
      { index: 3, label: "Rescisão" },
    ],
  };

  // Inicial
  const s0 = frames.computeCltState(frame, [], null);
  assert.equal(s0.activeIndex, 0);
  assert.ok(s0.detail.includes("1.518,00"));

  // Opção 1: Férias
  const s1 = frames.computeCltState(frame, [], { buttonIndex: 1 });
  assert.equal(s1.activeIndex, 1);
  assert.equal(s1.result, "R$ 2.024,00");
  assert.ok(s1.title.includes("Férias"));

  // Opção 2: 13º
  const s2 = frames.computeCltState(frame, [], { buttonIndex: 2 });
  assert.equal(s2.activeIndex, 2);
  assert.equal(s2.result, "R$ 1.518,00");
  assert.ok(s2.title.includes("13º"));

  // Opção 3: Rescisão
  const s3 = frames.computeCltState(frame, [], { buttonIndex: 3 });
  assert.equal(s3.activeIndex, 3);
  assert.ok(s3.result.includes("2.732,40"));
  assert.ok(s3.title.includes("Rescisão"));
});

test("frames - buildFrameActionPayload produz payload canonico correto", () => {
  const payload = frames.buildFrameActionPayload({
    postId: "post_xyz",
    frameKind: "poll",
    buttonIndex: 2,
    buttonLabel: "Opção B",
    userAddress: "vx_test_user",
  });

  assert.equal(payload.type, "frame-action");
  assert.equal(payload.postId, "post_xyz");
  assert.equal(payload.frameKind, "poll");
  assert.equal(payload.buttonIndex, 2);
  assert.equal(payload.buttonLabel, "Opção B");
  assert.equal(payload.author, "vx_test_user");
  assert.ok(payload.id.startsWith("fa_post_xyz_vx_test_user_"));
  assert.ok(typeof payload.ts === "number");
});

test("frames - renderPostItem injeta mini-app .vox-frame quando post possui frame", () => {
  const postWithoutFrame = {
    id: "post_plain",
    title: "Post Comum",
    body: "Sem mini-app",
    author: "vx_author",
    ts: Date.now(),
  };
  const htmlNoFrame = render.renderPostItem(postWithoutFrame);
  assert.ok(!htmlNoFrame.includes("vox-frame"));

  const postWithPoll = {
    id: "post_with_poll",
    title: "Post com Enquete",
    body: "Participe da enquete",
    author: "vx_author",
    ts: Date.now(),
    frame: {
      "of:accepts:vox": "vox",
      kind: "poll",
      title: "Enquete de Teste",
      "of:image": "images/test.jpg",
      "of:button:1": "Sim",
      "of:button:2": "Não",
      initialVotes: { 1: 5, 2: 5 },
    },
  };
  const htmlWithPoll = render.renderPostItem(postWithPoll);
  assert.ok(htmlWithPoll.includes("vox-frame"));
  assert.ok(htmlWithPoll.includes("POLL"));
  assert.ok(htmlWithPoll.includes('data-post-id="post_with_poll"'));
  assert.ok(htmlWithPoll.includes("btn-frame-action"));
  assert.ok(htmlWithPoll.includes("Sim"));
  assert.ok(htmlWithPoll.includes("Não"));
  assert.ok(htmlWithPoll.includes("Sem iframes"));
});

test("frames - cacheNode salva e recupera acoes de frame com filtro postId", async () => {
  const action1 = {
    id: "fa_test_post_1",
    type: "frame-action",
    postId: "test_post_100",
    frameKind: "poll",
    buttonIndex: 1,
    buttonLabel: "Opção A",
    author: "vx_user_1",
    ts: Date.now(),
  };
  const action2 = {
    id: "fa_test_post_2",
    type: "frame-action",
    postId: "test_post_200",
    frameKind: "petition",
    buttonIndex: 1,
    buttonLabel: "Assinar",
    author: "vx_user_2",
    ts: Date.now(),
  };

  await cacheNode.saveLocalPost(action1);
  await cacheNode.saveLocalPost(action2);

  const filtered = await cacheNode.getLocalPosts({ type: "frame-action", postId: "test_post_100" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "fa_test_post_1");
  assert.equal(filtered[0].buttonLabel, "Opção A");
});
