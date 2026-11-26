/**
 * @file Cobertura T6: fluxo de denúncia (`app/report-flow.js`) sobre um DOM de mentira: formulário em duas
 * etapas, registro local com quarentena, envio à moderação, canais oficiais e o gatilho `.btn-report-post`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";
import { waitUntil } from "./helpers/wait-until.js";

const doc = installFakeDom();
const toasts = captureToasts(doc);
globalThis.fetch = async () => { throw new Error("offline"); };

const flow = await import("../client/js/app/report-flow.js");
const report = await import("../client/js/report.js");
const moderation = await import("../client/js/moderation.js");
const cache = await import("../client/js/cache-node.js");
const updates = await import("../client/js/community-updates.js");
const ageGate = await import("../client/js/age-gate.js");

await cache.saveLocalPost({ id: updates.canonicalCommunityPostId("c-rep"), type: "community", communityId: "c-rep", title: "Bairro", author: "vx_mod", ts: 1 });
for (const id of ["r1", "r2", "r3"]) await cache.saveLocalPost({ id, type: "topic", communityId: "c-rep", title: id, author: "vx_autor", ts: 1 });

const modal = () => doc.getElementById("report-modal-container");

async function submit(ctx, reason, detail = "") {
  flow.openReportFlow(ctx);
  const form = doc.getElementById("form-report");
  const radio = form.querySelectorAll('input[name="report-reason"]').find((r) => r.value === reason);
  radio.checked = true;
  form.querySelector("#report-detail").value = detail;
  form.dispatchEvent({ type: "submit", target: form });
  await waitUntil(() => /Denúncia registrada/.test(modal().textContent), 6000);
}

test("abrir sem postId não faz nada; com postId mostra o formulário e Cancelar limpa o modal", () => {
  flow.openReportFlow({});
  assert.equal(modal(), null);
  flow.openReportFlow({ postId: "r1" });
  assert.equal(modal().querySelectorAll('input[name="report-reason"]').length, report.REPORT_REASONS.length);
  click(doc.getElementById("btn-report-cancel"));
  assert.equal(modal().innerHTML, "");
});

test("sem entrada completa: registra local, põe em quarentena e diz que não há moderador acionável", async () => {
  await submit({ postId: "r1", authorRoute: "vx_autor", communityId: "" }, "spam", "venda de pix");
  const [rec] = report.listReports().filter((r) => r.postId === "r1");
  assert.equal(rec.reason, "spam");
  assert.equal(rec.communityId, "c-rep", "comunidade vem do post");
  assert.equal(rec.detail, "venda de pix");
  assert.equal(moderation.isPostQuarantined("r1"), true);
  assert.match(modal().textContent, /Denúncia registrada/);
  assert.match(modal().textContent, /não tem moderador conhecido/);
  assert.equal(doc.getElementById("btn-report-to-mod"), null);
  click(doc.getElementById("btn-report-close"));
  assert.equal(modal().innerHTML, "");
});

test("com entrada completa: tenta entregar à moderação; sem chave mostra o botão para mandar pela conversa", async () => {
  localStorage.setItem("vox-cantina-v1", "true");
  localStorage.setItem("vox-pact-accepted", "true");
  ageGate.confirmAdult();
  await submit({ postId: "r2", authorRoute: "vx_autor", communityId: "" }, "assedio");
  assert.match(modal().textContent, /Não deu para entregar a denúncia à moderação agora/);
  const link = doc.getElementById("btn-report-to-mod");
  assert.match(link.getAttribute("href"), /^#\/dm\/vx_mod/);
  assert.equal(link.textContent, "Enviar aos moderadores (mensagem cifrada)");
  click(link);
  assert.equal(modal().innerHTML, "");
});

test("motivo grave mostra os canais oficiais e nenhum aviso a moderador natural", async () => {
  await submit({ postId: "r3", authorRoute: "vx_autor", communityId: "" }, "intimo");
  assert.match(modal().textContent, /Caso grave/);
  assert.ok(modal().querySelectorAll("a").some((a) => /safernet/.test(a.getAttribute("href"))));
});

test("erro ao registrar vira toast em vez de quebrar; gatilho .btn-report-post abre o formulário e fecha o details", async () => {
  flow.attachReportHandlers(doc);
  flow.attachReportHandlers(doc);
  const details = mount(doc, `<details open><summary>⋯</summary><button class="btn-report-post" data-id="r1" data-author="vx_autor" data-comm="c-rep"></button></details>`);
  click(details.querySelector(".btn-report-post"));
  assert.equal(details.hasAttribute("open"), false);
  assert.ok(doc.getElementById("form-report"));
  click(doc.body);
  const form = doc.getElementById("form-report");
  form.dispatchEvent({ type: "submit", target: { querySelector: () => { throw new Error("falha simulada"); } } });
  await waitUntil(() => toasts.at(-1)?.text === "falha simulada");
  assert.deepEqual([toasts.at(-1).text, toasts.at(-1).type], ["falha simulada", "error"]);
  assert.ok(doc.getElementById("form-report"), "o formulário continua aberto para tentar de novo");
});
