import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const fb = await import("../client/js/app-feedback.js");
const flow = await import("../client/js/app/feedback-flow.js");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

test("apontamento: exige um dos 3 tipos e corta a nota", () => {
  assert.throws(() => fb.buildFeedback({ screen: "home", kind: "spam" }), /Escolha/);
  const rec = fb.buildFeedback({ screen: "home", kind: "confuso", note: ` ${"x".repeat(400)} `, version: "vox-pwa-v7.44" }, 1000);
  assert.equal(rec.note.length, fb.MAX_NOTE_LEN);
  assert.deepEqual({ ...rec, note: "" }, { screen: "home", kind: "confuso", note: "", version: "vox-pwa-v7.44", ts: 1000 });
});

test("apontamento: a tela é só o nome da rota, nunca endereço ou ID", () => {
  assert.equal(fb.normalizeScreen("Community"), "community");
  for (const bad of ["#/perfil/vx_abc123", "t/top_9", "", null, "a".repeat(41)]) {
    assert.equal(fb.normalizeScreen(bad), "desconhecida", String(bad));
  }
});

test("apontamento: guarda no aparelho e mantém só os mais recentes", () => {
  const storage = memoryStorage();
  for (let i = 0; i < fb.MAX_FEEDBACK + 5; i++) {
    fb.saveFeedback(fb.buildFeedback({ screen: "home", kind: "quebrou", note: String(i) }, i), storage);
  }
  const list = fb.listFeedback(storage);
  assert.equal(list.length, fb.MAX_FEEDBACK);
  assert.equal(list[0].note, "5");
  storage.setItem(fb.FEEDBACK_STORAGE_KEY, "{quebrado");
  assert.deepEqual(fb.listFeedback(storage), []);
});

test("apontamento: resumo por tela e texto para compartilhar", () => {
  const list = [
    fb.buildFeedback({ screen: "community", kind: "confuso" }, Date.UTC(2026, 10, 9)),
    fb.buildFeedback({ screen: "community", kind: "confuso", note: "não achei o botão" }, Date.UTC(2026, 10, 9)),
    fb.buildFeedback({ screen: "home", kind: "quebrou", version: "vox-pwa-v7.44" }, Date.UTC(2026, 10, 10)),
  ];
  assert.deepEqual(fb.summarizeByScreen(list), [
    { screen: "community", kind: "confuso", count: 2 },
    { screen: "home", kind: "quebrou", count: 1 },
  ]);
  const text = fb.formatFeedbackForShare(list);
  assert.match(text, /^Apontamentos do Vox \(3\) · vox-pwa-v7\.44/);
  assert.match(text, /2× community \(Não entendi\)/);
  assert.match(text, /2026-11-09 · tela community · Não entendi · "não achei o botão"/);
  assert.equal(fb.formatFeedbackForShare([]), "Nenhum apontamento salvo neste aparelho.");
});

test("apontamento: modal oferece os 3 tipos e lembra que denúncia é outro caminho", () => {
  const html = flow.renderFeedbackFormHtml("home");
  for (const k of fb.FEEDBACK_KINDS) assert.ok(html.includes(`value="${k.id}"`), k.id);
  assert.match(html, /denunciar um post/);
  assert.match(flow.renderFeedbackDoneHtml(4), /só neste aparelho<\/strong> \(4 no total\)/);
});

test("apontamento: versão vem do cache do Service Worker em uso", async () => {
  const caches = { keys: async () => ["outra", "vox-pwa-v7.43-x", "vox-pwa-v7.44-x"] };
  assert.equal(await flow.currentAppVersion(caches), "vox-pwa-v7.44-x");
  assert.equal(await flow.currentAppVersion({ keys: async () => { throw new Error("x"); } }), "");
  assert.equal(await flow.currentAppVersion(undefined), "");
});
