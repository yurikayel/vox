/**
 * @file Cobertura T6: delegação de eventos do disparo tático (`explode-events.js`) de ponta a ponta sobre um
 * DOM de mentira, com `window.open`, área de transferência, `fetch` e `navigator.share` observáveis.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { waitUntil } from "./helpers/wait-until.js";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);
const events = await import("../client/js/explode-events.js");
const ui = await import("../client/js/explode-ui.js");
const posse = await import("../client/js/posse-dispatch.js");

const opened = [];
const copied = [];
const posts = [];
let clipboardFails = false;
window.open = (...args) => { opened.push(args); return {}; };
Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text) => { if (clipboardFails) throw new Error("negado"); copied.push(text); } },
});
globalThis.fetch = async (url, init) => { posts.push([url, JSON.parse(init.body)]); return { ok: true }; };
doc.createElement = ((make) => (tag) => {
  const el = make(tag);
  if (tag === "canvas") Object.assign(el, { getContext: () => null, toDataURL: () => "data:image/png;base64,AAAA" });
  if (tag === "a") el.click = () => {};
  return el;
})(doc.createElement.bind(doc));

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const buttonHtml = (id) => `<button class="btn-explode-post" data-id="${id}" data-title="Título ${id}" data-body="Corpo #causa" data-author="vx_a" data-comm="geral"><span class="count-explodes"></span></button>`;
const sheet = () => doc.getElementById(ui.EXPLODE_SHEET_ID);
const act = async (name) => { click(sheet().querySelector(`[data-explode-action="${name}"]`)); await settle(); };
const lastToast = () => toasts.at(-1)?.text;

function openFor(id) {
  const btn = mount(doc, buttonHtml(id));
  click(btn);
  return btn;
}

test("clique no botão de disparo abre a folha com o post certo e foca o primário", () => {
  events.attachExplodeHandlers();
  events.attachExplodeHandlers();
  const ev = click(mount(doc, buttonHtml("e1")));
  assert.equal(ev.defaultPrevented, true);
  assert.ok(sheet().classList.contains("is-open"));
  assert.deepEqual(
    [ui.getActiveExplodePost().id, ui.getActiveExplodePost().title, ui.getActiveExplodePost().communityId],
    ["e1", "Título e1", "geral"],
  );
  assert.equal(doc.activeElement.dataset.explodeAction, "whatsapp");
  assert.match(sheet().textContent, /Título e1/);
});

test("WhatsApp: abre o link com a mensagem, conta o disparo no botão e fecha a folha", async () => {
  openFor("e2");
  opened.length = 0;
  await act("whatsapp");
  assert.equal(opened.length, 1);
  assert.match(opened[0][0], /^https:\/\/wa\.me\/\?text=/);
  assert.match(decodeURIComponent(opened[0][0]), /Título e2/);
  assert.deepEqual(opened[0].slice(1), ["_blank", "noopener,noreferrer"]);
  const btn = doc.querySelector('.btn-explode-post[data-id="e2"]');
  assert.ok(btn.classList.contains("exploded"));
  assert.equal(btn.querySelector(".count-explodes").textContent, "1");
  assert.equal(sheet().classList.contains("is-open"), false);
  assert.equal(ui.getActiveExplodePost(), null);
});

test("copiar: texto vai para a área de transferência com link e hashtag; falha de cópia não quebra", async () => {
  openFor("e3");
  copied.length = 0;
  await act("copy");
  assert.equal(copied.length, 1);
  assert.match(copied[0], /Título e3/);
  assert.match(copied[0], /#causa/);
  assert.match(copied[0], /#\/t\/e3/);
  assert.equal(lastToast(), "📋 Mensagem copiada! Cole onde quiser.");
  assert.equal(sheet().classList.contains("is-open"), false);
  openFor("e3b");
  clipboardFails = true;
  await act("copy");
  clipboardFails = false;
  assert.equal(sheet().classList.contains("is-open"), false, "fecha mesmo sem conseguir copiar");
});

test("compartilhar nativo: sem Web Share cai na cópia; com Web Share entrega título, texto e link", async () => {
  openFor("e4");
  copied.length = 0;
  await act("native");
  assert.equal(copied.length, 1);
  openFor("e4b");
  const shared = [];
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async (data) => { shared.push(data); } });
  await act("native");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].title, "Título e4b");
  assert.match(shared[0].url, /#\/t\/e4b/);
  assert.match(shared[0].text, /Título e4b/);
  assert.equal(sheet().classList.contains("is-open"), false);
  Object.defineProperty(globalThis.navigator, "share", { configurable: true, value: async () => { throw new Error("cancelado"); } });
  openFor("e4c");
  await act("native");
  assert.equal(sheet().classList.contains("is-open"), false, "cancelar o share também fecha");
  delete globalThis.navigator.share;
});

test("webhooks: sem nenhum avisa para configurar; com um envia o payload e informa o total", async () => {
  openFor("e5");
  await act("webhooks");
  assert.deepEqual([lastToast(), toasts.at(-1).type], ["Configure webhooks em Configurações → Rede.", "error"]);
  posse.savePosseWebhooks(["https://hooks.example.org/vox"]);
  openFor("e5b");
  posts.length = 0;
  await act("webhooks");
  assert.equal(posts.length, 1);
  assert.equal(posts[0][0], "https://hooks.example.org/vox");
  assert.equal(lastToast(), "Enviado para 1 webhook(s)!");
});

test("Instagram e card de Stories: copiam a legenda, baixam o card e só o Instagram abre o app", async () => {
  openFor("e6");
  opened.length = 0;
  await act("instagram");
  assert.match(lastToast(), /Card baixado \+ legenda copiada! Abra o Instagram/);
  assert.equal(opened[0][0], "https://www.instagram.com/");
  openFor("e6b");
  opened.length = 0;
  await act("story-card");
  assert.equal(opened.length, 0, "story-card só gera o card");
  openFor("e6c");
  clipboardFails = true;
  await act("tiktok");
  clipboardFails = false;
  assert.match(lastToast(), /TikTok/);
  assert.equal(opened.at(-1)[0], "https://www.tiktok.com/upload");
});

test("EXPLODE! sem canal configurado inicia a esteira e abre o primeiro passo", async () => {
  posse.savePosseWebhooks([]);
  openFor("e7");
  opened.length = 0;
  await act("burst");
  assert.equal(lastToast(), "📢 Disparo em onda iniciado! Mensagem copiada.");
  assert.ok(doc.getElementById("explode-cascade-bar"));
  assert.match(opened[0][0], /^https:\/\/wa\.me\/.*#vox-explode=1$/);
  assert.match(doc.querySelector(".explode-cascade-info").textContent, /Etapa 1\/4/);
});

test("esteira: Próximo avança e abre a rede seguinte; Fechar remove a barra; Pular segue", async () => {
  opened.length = 0;
  click(doc.querySelector(".btn-cascade-next"));
  assert.match(doc.querySelector(".explode-cascade-info").textContent, /Etapa 2\/4/);
  assert.match(opened[0][0], /twitter|x\.com/);
  click(doc.querySelector(".btn-cascade-skip"));
  assert.match(doc.querySelector(".explode-cascade-info").textContent, /Etapa 3\/4/);
  click(doc.querySelector(".btn-cascade-next"));
  assert.equal(doc.querySelector(".btn-cascade-next").textContent, "🏁 Concluir Disparo");
  click(doc.querySelector(".btn-cascade-next"));
  assert.equal(lastToast(), "🎉 Disparo em onda concluído em todas as redes!");
  assert.equal(doc.getElementById("explode-cascade-bar"), null);
  await act2("cascade");
  click(doc.querySelector(".btn-cascade-close"));
  assert.equal(doc.getElementById("explode-cascade-bar"), null);
});

async function act2(name) {
  openFor("e8");
  await act(name);
  assert.ok(doc.getElementById("explode-cascade-bar"), `${name} monta a barra`);
}

test("EXPLODE! com webhook configurado dispara a rajada e informa os destinos", async () => {
  posse.savePosseWebhooks(["https://hooks.example.org/burst"]);
  openFor("e9");
  posts.length = 0;
  await act("burst");
  assert.equal(posts.length, 1);
  assert.equal(lastToast(), "📢 Rajada disparada! (1 destino(s))");
  assert.equal(sheet().classList.contains("is-open"), false);
  posse.savePosseWebhooks([]);
});

test("Shift+clique dispara rápido sem abrir a folha e copia a mensagem", async () => {
  const btn = mount(doc, buttonHtml("e10"));
  copied.length = 0;
  click(btn, { shiftKey: true });
  await waitUntil(() => copied.length > 0 && lastToast() === "📢 Mensagem copiada! Cole nos grupos ou redes.");
  assert.equal(sheet().classList.contains("is-open"), false);
  assert.match(copied[0], /Título e10/);
  assert.equal(lastToast(), "📢 Mensagem copiada! Cole nos grupos ou redes.");
});

test("fechar: botão ✕, clique fora do painel, Escape; cliques com a folha fechada são ignorados", async () => {
  openFor("e11");
  await act("close");
  assert.equal(sheet().classList.contains("is-open"), false);
  openFor("e11b");
  const inside = click(sheet().querySelector(".explode-panel"));
  assert.equal(inside.defaultPrevented, false, "clicar no painel vazio não fecha");
  assert.ok(sheet().classList.contains("is-open"));
  click(sheet());
  assert.equal(sheet().classList.contains("is-open"), false);
  openFor("e11c");
  doc.dispatchEvent({ type: "keydown", key: "Tab" });
  assert.ok(sheet().classList.contains("is-open"), "outras teclas não fecham");
  doc.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(sheet().classList.contains("is-open"), false);
  const before = opened.length;
  const stray = click(doc.body);
  assert.equal(stray.defaultPrevented, false);
  assert.equal(opened.length, before);
});

test("ação sem post ativo e ação desconhecida não fazem nada", async () => {
  openFor("e12");
  ui.setActiveExplodePost(null);
  opened.length = 0;
  await act("whatsapp");
  assert.equal(opened.length, 0, "sem post ativo nada é aberto");
  openFor("e12b");
  const toastsBefore = toasts.length;
  sheet().querySelector(".explode-panel").insertAdjacentHTML("beforeend", `<button data-explode-action="desconhecida"></button>`);
  await act("desconhecida");
  assert.equal(toasts.length, toastsBefore, "ação desconhecida não gera aviso");
  assert.equal(sheet().classList.contains("is-open"), true);
});
