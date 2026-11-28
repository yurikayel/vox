/**
 * @file Foco nos modais avulsos (modal-host): fechar o Pix pelo ✕ devolve o foco ao botão que o abriu, e abrir o
 * Denunciar por um item do menu ⋯ (que fecha o menu) leva o foco para dentro do diálogo e, ao fechar, de volta ao ⋯.
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
const { engageModalHost } = await import("../client/js/render/modal-host.js");
const flow = await import("../client/js/app/report-flow.js");
const cache = await import("../client/js/cache-node.js");

await cache.saveLocalPost({ id: "f51", type: "topic", communityId: "", title: "f51", author: "vx_autor", ts: 1 });

const dentro = (host) => host.contains(doc.activeElement);

test("Pix: o foco entra no diálogo e o ✕ devolve o foco ao botão que abriu", () => {
  const opener = mount(doc, `<button id="abre-pix">⋯</button>`);
  opener.focus();
  zap.openZapModal({ pixKey: "autor@vox.org", authorName: "Autora", title: "Post" });
  const host = doc.getElementById("zap-modal-container");
  assert.ok(dentro(host), "o foco foi para dentro do Pix");
  click(host.querySelector(".btn-close-zap"));
  assert.equal(host.innerHTML, "");
  assert.equal(doc.activeElement, opener, "o foco voltou ao gatilho, não ficou no body");
});

test("Denunciar pelo item do menu ⋯: o foco entra no diálogo, mesmo com o item já escondido", () => {
  flow.attachReportHandlers(doc);
  const menu = mount(doc, `<details open><summary id="mais">⋯</summary><button class="btn-report-post" data-id="f51" data-author="vx_autor"></button></details>`);
  const item = menu.querySelector(".btn-report-post");
  item.focus();
  click(item);
  const host = doc.getElementById("report-modal-container");
  assert.ok(dentro(host), "o foco foi para dentro do Denunciar");
  assert.equal(menu.hasAttribute("open"), false, "o menu fechou");
});

test("Denunciar: Cancelar devolve o foco ao ⋯ que abriu o menu, não ao item escondido nem ao body", () => {
  const summary = doc.getElementById("mais");
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(doc.getElementById("report-modal-container").innerHTML, "");
  assert.equal(doc.activeElement, summary);
});

test("Denunciar: ao registrar, o foco continua dentro do modal (etapa 2) e Fechar volta ao ⋯", async () => {
  const menu = mount(doc, `<details open><summary id="mais2">⋯</summary><button class="btn-report-post" data-id="f51" data-author="vx_autor"></button></details>`);
  const item = menu.querySelector(".btn-report-post");
  item.focus();
  click(item);
  const form = doc.getElementById("form-report");
  form.querySelectorAll('input[name="report-reason"]')[0].checked = true;
  form.dispatchEvent({ type: "submit", target: form });
  const host = doc.getElementById("report-modal-container");
  await waitUntil(() => /Denúncia registrada/.test(host.textContent), 6000);
  assert.ok(dentro(host), "o foco não caiu no body ao trocar de etapa");
  click(doc.getElementById("btn-report-close"));
  assert.equal(doc.activeElement, doc.getElementById("mais2"));
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