/**
 * @file Open Frames na página (4ª varredura de QA): a apuração desenhada conta as ações de outras pessoas, o botão
 * volta ao normal depois do voto e, quando alguém muda o voto, vale o mais recente. Os testes do botão e do voto mais
 * recente falham no `develop` de antes da correção; os outros cobrem o módulo novo (`app/frame-ui.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const frames = await import("../client/js/frames.js");
const cacheNode = await import("../client/js/cache-node.js");
const init = await import("../client/js/app/init.js");
const frameUi = await import("../client/js/app/frame-ui.js");

const PETITION = { kind: "petition", title: "Praça", "of:accepts:vox": "v1", "of:image": "https://exemplo.org/f.png", "of:button:1": "Assinar", goal: 10 };
const POLL = { kind: "poll", title: "Praça", "of:accepts:vox": "v1", "of:image": "https://exemplo.org/f.png", "of:button:1": "Sim", "of:button:2": "Não" };

function action(postId, author, buttonIndex, ts) {
  return { id: `fa_${postId}_${author}_${ts}`, type: "frame-action", postId, frameKind: "petition", buttonIndex, author, owner: author, ts };
}

/** `document` falso só com os elementos dados (por id); devolve a função que desfaz. */
function withElements(elements) {
  const before = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] || null, querySelectorAll: () => [] };
  return () => {
    globalThis.document = before;
  };
}

/** Botões falsos de um cartão: `closest` leva ao grupo, `classList` guarda `active`. */
function fakeButtons(postId, labels) {
  const group = { querySelectorAll: () => buttons };
  const buttons = labels.map((label, i) => {
    const classes = new Set();
    return {
      dataset: { postId, index: String(i + 1), label },
      textContent: label,
      disabled: false,
      closest: (sel) => (sel === ".vox-frame-buttons" ? group : null),
      classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
    };
  });
  return buttons;
}

test("frame - depois do voto o botão volta ao normal e a escolha fica marcada", async () => {
  await cacheNode.saveLocalPost({ id: "p_fui_botao", type: "topic", title: "Enquete", body: "b", frame: POLL, ts: 1 });
  const [sim, nao] = fakeButtons("p_fui_botao", ["Sim", "Não"]);
  const undo = withElements({ "frame-content-p_fui_botao": { innerHTML: "" } });
  try {
    await init.handleFrameActionClick(nao);
  } finally {
    undo();
  }
  assert.equal(nao.disabled, false, "não fica desabilitado");
  assert.equal(nao.textContent, "Não", "não fica em Gravando…");
  assert.ok(nao.classList.contains("active"));
  assert.ok(!sim.classList.contains("active"));
});

test("frame - apuração conta as assinaturas que chegaram de outras pessoas", async () => {
  await cacheNode.saveLocalPost(action("p_fui_outros", "vx_outra_a", 1, 10));
  await cacheNode.saveLocalPost(action("p_fui_outros", "vx_outra_b", 1, 11));
  const content = { innerHTML: "" };
  const doc = { getElementById: (id) => (id === "frame-content-p_fui_outros" ? content : null) };
  assert.equal(await frameUi.refreshFrameContent(doc, "p_fui_outros", PETITION, null), true);
  assert.match(content.innerHTML, /<strong>2<\/strong> assinaturas/);
});

test("frame - quem muda o voto conta pelo voto mais recente, mesmo com as ações da mais nova para a mais velha", () => {
  const parsed = frames.parseFrame(POLL);
  const newestFirst = [action("p", "vx_ana", 2, 20), action("p", "vx_ana", 1, 10)];
  const state = frames.getFrameState(parsed.frame, newestFirst, null);
  const count = (i) => state.options.find((o) => o.index === i).count;
  assert.equal(count(2), 1);
  assert.equal(count(1), 0);
});

test("frame - tallyFrameCards apura cada cartão que entrou na página uma vez", async () => {
  await cacheNode.saveLocalPost(action("p_fui_card", "vx_outra_c", 1, 30));
  const content = { innerHTML: "" };
  let resolved = 0;
  const card = {
    dataset: { postId: "p_fui_card" },
    ownerDocument: { getElementById: (id) => (id === "frame-content-p_fui_card" ? content : null) },
  };
  const root = { matches: () => false, querySelectorAll: () => [card] };
  const resolvePost = async () => {
    resolved++;
    return { id: "p_fui_card", frame: PETITION };
  };
  await frameUi.tallyFrameCards(root, resolvePost);
  await frameUi.tallyFrameCards(root, resolvePost);
  assert.match(content.innerHTML, /<strong>1<\/strong> assinaturas/);
  assert.equal(resolved, 1, "o mesmo cartão não é apurado de novo");
});

test("frame - tallyFrameCards ignora cartão de post sem frame e elemento sem cartões", async () => {
  const content = { innerHTML: "intacto" };
  const card = { dataset: { postId: "p_fui_sem" }, ownerDocument: { getElementById: () => content } };
  await frameUi.tallyFrameCards({ matches: () => true, ...card }, async () => null);
  await frameUi.tallyFrameCards({ nodeType: 1 }, async () => null);
  assert.equal(content.innerHTML, "intacto");
});
