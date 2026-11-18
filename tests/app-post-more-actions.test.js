/**
 * Ações do sheet ⋯ (`app/post-more-actions.js`): rótulos, visibilidade por contexto,
 * salvar local, republicar sem post, e roteador desviado (`app/navigation.js`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const actions = await import("../client/js/app/post-more-actions.js");
const nav = await import("../client/js/app/navigation.js");
const social = await import("../client/js/social.js");

function fakeSheet(names) {
  const els = Object.fromEntries(names.map((n) => [n, { hidden: false, textContent: "" }]));
  return { els, querySelector: (sel) => els[sel.match(/"(.+)"/)[1]] || null };
}

test("refreshSaveLabel: rótulo segue o estado salvo e tolera sheet ausente", () => {
  const sheet = fakeSheet(["save"]);
  actions.refreshSaveLabel(sheet, "p_save_1");
  assert.equal(sheet.els.save.textContent, "Salvar");
  social.toggleSave("p_save_1");
  actions.refreshSaveLabel(sheet, "p_save_1");
  assert.equal(sheet.els.save.textContent, "Remover dos salvos");
  assert.doesNotThrow(() => actions.refreshSaveLabel(null, "p_save_1"));
  social.toggleSave("p_save_1");
});

test("refreshSheetExtras: marcar só em post próprio com imagem; apoiar só com Pix", () => {
  const sheet = fakeSheet(["save", "tag", "zap", "repost"]);
  actions.refreshSheetExtras(sheet, { postId: "p_x", isOwn: true, hasImage: true, pix: "chave" });
  assert.equal(sheet.els.tag.hidden, false);
  assert.equal(sheet.els.zap.hidden, false);
  assert.equal(sheet.els.repost.textContent, "Republicar");
  actions.refreshSheetExtras(sheet, { postId: "p_x", isOwn: false, hasImage: true, pix: "" });
  assert.equal(sheet.els.tag.hidden, true, "post de outra pessoa não marca");
  assert.equal(sheet.els.zap.hidden, true, "sem Pix não apoia");
  actions.refreshSheetExtras(sheet, { postId: "p_x", isOwn: true, hasImage: false });
  assert.equal(sheet.els.tag.hidden, true, "sem imagem não marca");
});

test("refreshSheetExtras: sheet sem os botões opcionais não quebra", () => {
  assert.doesNotThrow(() => actions.refreshSheetExtras(fakeSheet(["save"]), { postId: "p_y" }));
});

test("toggleSaveFromMenu: alterna o estado salvo local", () => {
  assert.equal(social.isSaved("p_tog"), false);
  actions.toggleSaveFromMenu("p_tog");
  assert.equal(social.isSaved("p_tog"), true);
  actions.toggleSaveFromMenu("p_tog");
  assert.equal(social.isSaved("p_tog"), false);
});

test("apoiarFromMenu: sem chave Pix não abre modal (nem toca no DOM)", () => {
  delete globalThis.document;
  assert.doesNotThrow(() => actions.apoiarFromMenu({ title: "Autor" }));
  assert.doesNotThrow(() => actions.apoiarFromMenu({ pix: "" }));
});

test("marcarFromMenu: ignora post alheio ou sem imagem", () => {
  delete globalThis.document;
  assert.doesNotThrow(() => actions.marcarFromMenu({ postId: "p", isOwn: false, hasImage: true }));
  assert.doesNotThrow(() => actions.marcarFromMenu({ postId: "p", isOwn: true, hasImage: false }));
});

test("republicarFromMenu: contexto sem id não republica nem muda a rota", async () => {
  globalThis.location.hash = "#/post/abc";
  await actions.republicarFromMenu({});
  assert.equal(globalThis.location.hash, "#/post/abc");
});

test("navigation: route() chama a função registrada por setRoute", async () => {
  let calls = 0;
  nav.setRoute(async () => { calls += 1; });
  await nav.route();
  await nav.route();
  assert.equal(calls, 2);
  nav.setRoute(async () => {});
});
