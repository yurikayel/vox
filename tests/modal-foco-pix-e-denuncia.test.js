/**
 * @file Foco nos modais avulsos (modal-host): fechar o Pix pelo ✕ devolve o foco ao botão que o abriu, e abrir o
 * Denunciar por um item do menu ⋯ (que fecha o menu) leva o foco para dentro do diálogo, no primeiro controle, e, ao
 * fechar, de volta ao ⋯. O gatilho guardado vale uma abertura só. Cada teste monta a sua tela.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";
import { waitUntil } from "./helpers/wait-until.js";

const doc = installFakeDom();
captureToasts(doc);
globalThis.fetch = async () => { throw new Error("offline"); };

const zap = await import("../client/js/app/zap-modal.js");
const { engageModalHost, modalHost } = await import("../client/js/render/modal-host.js");
const { focusableIn } = await import("../client/js/render/focus-trap.js");
const flow = await import("../client/js/app/report-flow.js");
const cache = await import("../client/js/cache-node.js");

await cache.saveLocalPost({ id: "f51", type: "topic", communityId: "", title: "f51", author: "vx_autor", ts: 1 });
flow.attachReportHandlers(doc);

let seq = 0;
const dentro = (host) => host.contains(doc.activeElement);

/** Menu ⋯ novo com o item Denunciar; devolve o `summary` e o item. */
function menuDenunciar() {
  const id = `mais-${++seq}`;
  const menu = mount(doc, `<details open><summary id="${id}">⋯</summary><button class="btn-report-post" data-id="f51" data-author="vx_autor"></button></details>`);
  return { menu, summary: doc.getElementById(id), item: menu.querySelector(".btn-report-post") };
}

/** Abre o Denunciar pelo item do menu, com o foco no item, como o teclado faz. */
function abrirDenuncia() {
  const m = menuDenunciar();
  m.item.focus();
  click(m.item);
  return { ...m, host: doc.getElementById("report-modal-container") };
}

test("Pix: o foco entra no primeiro controle do diálogo e o ✕ devolve o foco ao botão que abriu", () => {
  const opener = mount(doc, `<button id="abre-pix">⋯</button>`);
  opener.focus();
  zap.openZapModal({ pixKey: "autor@vox.org", authorName: "Autora", title: "Post" });
  const host = doc.getElementById("zap-modal-container");
  assert.ok(dentro(host), "o foco foi para dentro do Pix");
  assert.equal(doc.activeElement, focusableIn(host)[0], "no primeiro controle, não no último");
  click(host.querySelector(".btn-close-zap"));
  assert.equal(host.innerHTML, "");
  assert.equal(doc.activeElement, opener, "o foco voltou ao gatilho, não ficou no body");
});

test("Denunciar pelo item do menu ⋯: o foco entra no primeiro controle, mesmo com o item já escondido", () => {
  const { menu, host } = abrirDenuncia();
  assert.ok(dentro(host), "o foco foi para dentro do Denunciar");
  assert.equal(doc.activeElement, focusableIn(host)[0], "no primeiro controle, não no último");
  assert.equal(menu.hasAttribute("open"), false, "o menu fechou");
  click(doc.getElementById("btn-report-cancel"));
});

test("Denunciar: Cancelar devolve o foco ao ⋯ que abriu o menu, não ao item escondido nem ao body", () => {
  const { summary, host } = abrirDenuncia();
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(host.innerHTML, "");
  assert.equal(doc.activeElement, summary);
});

test("Denunciar: ao registrar, o foco continua dentro do modal (etapa 2) e Fechar volta ao ⋯", async () => {
  const { summary, host } = abrirDenuncia();
  const form = doc.getElementById("form-report");
  form.querySelectorAll('input[name="report-reason"]')[0].checked = true;
  form.dispatchEvent({ type: "submit", target: form });
  await waitUntil(() => /Denúncia registrada/.test(host.textContent), 6000);
  assert.ok(dentro(host), "o foco não caiu no body ao trocar de etapa");
  click(doc.getElementById("btn-report-close"));
  assert.equal(doc.activeElement, summary);
});

test("com o modal já aberto, outro gatilho não troca para onde o foco volta", () => {
  const origem = mount(doc, `<button id="origem">⋯</button>`);
  const outro = mount(doc, `<button id="outro">x</button>`);
  origem.focus();
  flow.openReportFlow({ postId: "f51" }, { returnFocus: origem });
  engageModalHost(doc.getElementById("report-modal-container"), { returnFocus: outro });
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(doc.activeElement, origem);
  origem.focus();
  flow.openReportFlow({ postId: "f51" });
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(doc.activeElement, origem, "o gatilho recusado não ficou guardado para a próxima abertura");
});

test("o gatilho usado vale uma abertura só: a seguinte, sem gatilho, volta ao foco de quando abriu", () => {
  const velho = mount(doc, `<button id="gatilho-velho">⋯</button>`);
  const atual = mount(doc, `<button id="gatilho-atual">⋯</button>`);
  velho.focus();
  flow.openReportFlow({ postId: "f51" }, { returnFocus: velho });
  click(doc.getElementById("btn-report-cancel"));
  atual.focus();
  flow.openReportFlow({ postId: "f51" });
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(doc.activeElement, atual, "não volta ao ⋯ do post anterior");
});

test("gatilho entregue a um contêiner vazio não fica guardado para a abertura seguinte", () => {
  const velho = mount(doc, `<button id="gatilho-orfao">⋯</button>`);
  const atual = mount(doc, `<button id="gatilho-novo">⋯</button>`);
  const host = modalHost("report-modal-container");
  assert.equal(host.innerHTML, "", "o contêiner está vazio");
  engageModalHost(host, { returnFocus: velho });
  atual.focus();
  flow.openReportFlow({ postId: "f51" });
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(doc.activeElement, atual, "o gatilho sem modal aberto foi descartado");
});
