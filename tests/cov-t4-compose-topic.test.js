/**
 * @file Cobertura de `app/compose-topic.js` (lote T4): tela de novo post, ata de chat, etiquetas, esferas e publicação.
 *
 * Shell, render, identidade e cache são reais; o DOM é o de `helpers/cov-t4-dom.mjs` e os toasts
 * são lidos por `captureToasts`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument, captureToasts } from "./helpers/cov-t4-dom.mjs";

globalThis.fetch = async () => { throw new Error("offline"); };

const topic = await import("../client/js/app/compose-topic.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");

const store = new Map();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
});

const TRANSCRIPT = "[10:00] Ana: Bom dia a todos\n[10:01] Beto: Concordo com a pauta";

/**
 * Monta a tela de novo post com os campos registrados no documento falso.
 * @param {string} [communityId] Comunidade alvo.
 * @param {(dom: object, el: Record<string, FakeEl>) => void} [setup] Consultas extras programadas antes de ligar os handlers.
 * @returns {Promise<object>} Cenário com `dom`, `el` (por id), `steps`, `tagBtns` e `toasts`.
 */
async function mountTopic(communityId, setup = () => {}) {
  const dom = installFakeDocument();
  dom.doc.body.classList = new FakeEl().classList;
  const ids = ["app-root", "app-main", "form-compose-topic", "compose-social-panel", "topic-body", "topic-title",
    "topic-civic-tag", "civic-poll-builder", "chat-transcript-input", "btn-convert-chat-transcript",
    "btn-convert-and-notarize", "btn-submit-topic", "topic-comm-id", "inline-topic-comm", "inline-topic-body",
    "feed-inline-composer", "form-inline-topic"];
  const el = {};
  for (const id of ids) {
    el[id] = new FakeEl(id);
    dom.add(el[id]);
  }
  const steps = [new FakeEl("s0", { dataset: { stepKey: "where" } }), new FakeEl("s1", { dataset: { stepKey: "write" } })];
  el["form-compose-topic"].stub(".compose-step", steps);
  const tagBtns = ["[Pauta]", "[Enquete]"].map((tag) => new FakeEl("", { tag: "BUTTON", dataset: { tag } }));
  dom.doc.stub(".civic-tag-btn", tagBtns);
  dom.doc.stub('.civic-tag-btn[data-tag="[Pauta]"]', tagBtns[0]);
  setup(dom, el);
  const toasts = captureToasts(dom);
  await topic.showComposeTopic(communityId);
  return { dom, el, steps, tagBtns, toasts };
}

/**
 * Libera o cenário montado por {@link mountTopic}.
 * @param {{ dom: object, toasts: object }} ctx Cenário.
 * @returns {void}
 */
function unmount(ctx) {
  ctx.toasts.stop();
  ctx.dom.restore();
  store.clear();
}

test("compose-topic — tela renderiza o formulário e liga etapas e envio", async () => {
  const ctx = await mountTopic("geral");
  try {
    assert.ok(ctx.el["app-main"].innerHTML.includes('id="form-compose-topic"'));
    assert.deepEqual([...ctx.el["form-compose-topic"].listeners.keys()].sort(), ["click", "submit"]);
    assert.equal(ctx.el["form-compose-topic"].dataset.stepperBound, "1");
    assert.equal(ctx.el["btn-convert-chat-transcript"].listeners.get("click").length, 1);
    assert.equal(ctx.el["btn-convert-and-notarize"].listeners.get("click").length, 1);
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — citação guardada preenche corpo e título padrão e é consumida", async () => {
  store.set("vox_quote_prefill", "“Texto citado”");
  const ctx = await mountTopic();
  try {
    assert.equal(ctx.el["topic-body"].value, "“Texto citado”");
    assert.equal(ctx.el["topic-title"].value, "Debate Cívico Soberano");
    assert.equal(store.has("vox_quote_prefill"), false);
  } finally {
    unmount(ctx);
  }
  store.set("vox_quote_prefill", "Outra");
  const dom = installFakeDocument();
  const withTitle = new FakeEl("topic-title", { value: "Meu título" });
  dom.add(new FakeEl("app-root"), new FakeEl("app-main"), withTitle, new FakeEl("topic-body"));
  await topic.showComposeTopic("geral");
  assert.equal(withTitle.value, "Meu título", "título já escrito é preservado");
  dom.restore();
  store.clear();
});

test("compose-topic — converter transcrição acrescenta a ata ao corpo e sugere o título", async () => {
  const ctx = await mountTopic();
  try {
    const { el } = ctx;
    el["chat-transcript-input"].value = TRANSCRIPT;
    el["topic-body"].value = "Introdução";
    await el["btn-convert-chat-transcript"].fire("click");
    assert.ok(el["topic-body"].value.startsWith("Introdução\n\n> 📋 **Ata importada"));
    assert.ok(el["topic-body"].value.includes("- **Ana** *(10:00)*: Bom dia a todos"));
    assert.ok(el["topic-title"].value.startsWith("Ata do Coletivo ("));
    assert.ok(el["topic-title"].value.includes("Ana, Beto"));
    assert.equal(ctx.toasts.list().at(-1).text, "Ata formatada (2 intervenções)!");
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — transcrição vazia avisa e deixa corpo e título intactos", async () => {
  const ctx = await mountTopic();
  try {
    ctx.el["chat-transcript-input"].value = "   ";
    await ctx.el["btn-convert-chat-transcript"].fire("click");
    assert.deepEqual(ctx.toasts.list().at(-1), { text: "Cole uma conversa do Slack ou Discord para converter.", type: "error" });
    assert.equal(ctx.el["topic-body"].value, "");
    assert.equal(ctx.el["topic-title"].value, "");
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — converter e selar acrescenta o selo do cartório com hash e testemunhas", async () => {
  const ctx = await mountTopic();
  try {
    const { el } = ctx;
    el["chat-transcript-input"].value = TRANSCRIPT;
    el["topic-title"].value = "Ata da assembleia";
    await el["btn-convert-and-notarize"].fire("click");
    const body = el["topic-body"].value;
    assert.match(body, /Cartório Cívico Arweave/);
    assert.match(body, /Hash SHA-256: `[0-9a-f]{64}`/);
    assert.ok(body.includes("Testemunhas registradas: Ana, Beto"));
    assert.equal(el["topic-title"].value, "Ata da assembleia", "título digitado não é trocado");
    assert.equal(ctx.toasts.list().at(-1).text, "Ata formatada e selada com Cartório Cívico!");
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — escolher etiqueta marca o botão, grava o valor e mostra a enquete só para Enquete", async () => {
  const ctx = await mountTopic();
  try {
    const [pauta, enquete] = ctx.tagBtns;
    pauta.click();
    assert.equal(ctx.el["topic-civic-tag"].value, "[Pauta]");
    assert.equal(pauta.getAttribute("aria-pressed"), "true");
    assert.equal(enquete.getAttribute("aria-pressed"), "false");
    assert.equal(ctx.el["civic-poll-builder"].hidden, true);
    enquete.click();
    assert.equal(ctx.el["topic-civic-tag"].value, "[Enquete]");
    assert.equal(pauta.classList.contains("active"), false);
    assert.equal(enquete.classList.contains("active"), true);
    assert.equal(ctx.el["civic-poll-builder"].hidden, false);
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — esfera Cívico escolhe Pauta por padrão, vai à etapa 2 e Social volta à etapa 1", async () => {
  const civic = new FakeEl();
  const social = new FakeEl();
  const back = new FakeEl();
  const ctx = await mountTopic("geral", (dom, el) => {
    dom.doc.stub('[data-sphere="civic"]', civic);
    dom.doc.stub('[data-sphere="social"]', social);
    el["compose-social-panel"].stub("[data-sphere-back]", back);
  });
  try {
    const { el, steps } = ctx;
    await civic.fire("click");
    assert.equal(el["topic-civic-tag"].value, "[Pauta]");
    assert.deepEqual(steps.map((st) => st.hidden), [true, false]);
    el["topic-civic-tag"].value = "[Enquete]";
    await civic.fire("click");
    assert.equal(el["topic-civic-tag"].value, "[Enquete]", "etiqueta já escolhida é mantida");
    await social.fire("click");
    assert.equal(el["form-compose-topic"].hidden, true);
    assert.equal(el["compose-social-panel"].hidden, false);
    assert.equal(el["inline-topic-comm"].value, "geral");
    assert.equal(el["inline-topic-body"].focusCalls >= 1, true, "foco no texto do composer");
    await back.fire("click");
    assert.equal(el["compose-social-panel"].hidden, true);
    assert.equal(el["form-compose-topic"].hidden, false);
    assert.deepEqual(steps.map((st) => st.hidden), [false, true]);
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — esfera Social liga o composer uma única vez e o callback leva à comunidade", async () => {
  await cacheNode.clearLocalPosts();
  const social = new FakeEl();
  const ctx = await mountTopic("praça", (dom) => dom.doc.stub('[data-sphere="social"]', social));
  try {
    const { el } = ctx;
    await social.fire("click");
    await social.fire("click");
    assert.equal(el["form-inline-topic"].listeners.get("submit").length, 1, "handlers do composer ligados uma vez");
    el["inline-topic-body"].value = "Olá do composer";
    await el["form-inline-topic"].fire("submit", { preventDefault() {} });
    assert.equal(location.hash, "#/c/pra%C3%A7a");
    assert.equal((await cacheNode.getLocalPosts({ type: "topic" })).length, 1);
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — esfera Social sem comunidade volta para o início depois de publicar", async () => {
  await cacheNode.clearLocalPosts();
  const social = new FakeEl();
  const ctx = await mountTopic(undefined, (dom) => dom.doc.stub('[data-sphere="social"]', social));
  try {
    await social.fire("click");
    assert.equal(ctx.el["inline-topic-comm"].value, "", "sem comunidade, campo intacto");
    ctx.el["inline-topic-body"].value = "Sem comunidade";
    location.hash = "#/compose";
    await ctx.el["form-inline-topic"].fire("submit", { preventDefault() {} });
    assert.equal(location.hash, "#/");
  } finally {
    unmount(ctx);
  }
});

/**
 * Deixa a última etapa visível e preenche os campos do post, para o submit chegar ao envio.
 * @param {{ el: Record<string, FakeEl>, steps: FakeEl[] }} ctx Cenário de {@link mountTopic}.
 * @param {Record<string, string>} values Valores por id de campo.
 * @returns {object} Evento de submit simulado (com contadores).
 */
function prepareSubmit(ctx, values) {
  ctx.steps[0].hidden = true;
  ctx.steps[1].hidden = false;
  for (const [id, value] of Object.entries(values)) ctx.el[id].value = value;
  return { prevented: 0, stopped: 0, preventDefault() { this.prevented++; }, stopImmediatePropagation() { this.stopped++; } };
}

test("compose-topic — publicar assina, guarda, avisa, abre a folha de ecoar e navega ao tópico", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Gil");
  const ctx = await mountTopic();
  try {
    const ev = prepareSubmit(ctx, { "topic-comm-id": " Praça ", "topic-civic-tag": "[Pauta]", "topic-title": "Reforma", "topic-body": "Texto da pauta" });
    await ctx.el["form-compose-topic"].fire("submit", ev);
    assert.equal(ev.prevented, 1);
    const [saved] = await cacheNode.getLocalPosts({ type: "topic" });
    assert.equal(saved.communityId, "praça");
    assert.equal(saved.title, "[Pauta] Reforma");
    assert.equal(saved.civicTag, "[Pauta]");
    assert.equal(saved.body, "Texto da pauta");
    assert.equal(saved.authorDisplay, "Gil");
    assert.ok(saved.sig);
    assert.equal(location.hash, `#/t/${encodeURIComponent(saved.id)}?c=${encodeURIComponent("praça")}`);
    assert.equal(ctx.el["btn-submit-topic"].textContent, "Publicando…");
    assert.equal(ctx.toasts.list().at(-1).text, "Post publicado na rede de seguidores!");
    assert.equal(ctx.dom.doc.body.classList.contains("post-more-sheet-open"), true, "folha de ecoar aberta");
  } finally {
    unmount(ctx);
    localAccount.wipeLocalAccount();
  }
});

test("compose-topic — a comunidade da rota vence o campo e a enquete anexa as opções ao corpo", async () => {
  await cacheNode.clearLocalPosts();
  const ctx = await mountTopic("geral");
  try {
    ctx.dom.doc.stub("#civic-poll-options .civic-poll-input", [{ value: " Sim " }, { value: "Não" }, { value: "" }]);
    const ev = prepareSubmit(ctx, { "topic-comm-id": "outra", "topic-civic-tag": "[Enquete]", "topic-title": "", "topic-body": "Aprovam?" });
    await ctx.el["form-compose-topic"].fire("submit", ev);
    const [saved] = await cacheNode.getLocalPosts({ type: "topic" });
    assert.equal(saved.communityId, "geral");
    assert.equal(saved.title, "[Enquete]", "sem título, a etiqueta vira o título");
    assert.equal(saved.body, "Aprovam?\n\n- Sim\n- Não");
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — corpo vazio não publica nem trava o botão", async () => {
  await cacheNode.clearLocalPosts();
  const ctx = await mountTopic();
  try {
    const ev = prepareSubmit(ctx, { "topic-body": "" });
    ctx.el["btn-submit-topic"].textContent = "Publicar Post";
    await ctx.el["form-compose-topic"].fire("submit", ev);
    assert.equal(ev.stopped, 1, "etapa inválida: o guarda do stepper corta o envio");
    assert.equal((await cacheNode.getLocalPosts({ type: "topic" })).length, 0);
    assert.equal(ctx.el["btn-submit-topic"].disabled, false);
  } finally {
    unmount(ctx);
  }
});

test("compose-topic — falha ao assinar mostra o erro e devolve o botão ao estado inicial", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const ctx = await mountTopic();
  const subtle = globalThis.crypto.subtle;
  const realSign = subtle.sign;
  subtle.sign = async () => { throw new Error("sem chave"); };
  try {
    const ev = prepareSubmit(ctx, { "topic-body": "texto" });
    await ctx.el["form-compose-topic"].fire("submit", ev);
    assert.deepEqual(ctx.toasts.list().at(-1), { text: "Erro: sem chave", type: "error" });
    assert.equal(ctx.el["btn-submit-topic"].disabled, false);
    assert.equal(ctx.el["btn-submit-topic"].textContent, "Publicar Post");
    assert.equal((await cacheNode.getLocalPosts({ type: "topic" })).length, 0);
  } finally {
    subtle.sign = realSign;
    unmount(ctx);
    localAccount.wipeLocalAccount();
  }
});
