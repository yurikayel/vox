/**
 * Regressões achadas pela varredura de cobertura de 2026-11-16 (Antigravity) e conferidas à mão: cada teste
 * falha no `develop` de antes da correção. O nome sem import em `screens-community.js` (escapeHtml, brcode,
 * listing) fica guardado pela regra `no-undef` do ESLint, não por teste.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const pix = await import("../client/js/pix-key.js");
const render = await import("../client/js/render.js");
const frames = await import("../client/js/frames.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");
const init = await import("../client/js/app/init.js");

/** Troca `document` por um com só os elementos dados (por id); devolve a função que desfaz. */
function withElements(elements) {
  const before = globalThis.document;
  globalThis.document = { getElementById: (id) => elements[id] || null, querySelectorAll: () => [] };
  return () => {
    globalThis.document = before;
  };
}

function fakeContainer() {
  return { innerHTML: "", querySelector: () => null, addEventListener: () => {} };
}

test("pix - a chave guardada é um registro; storedPixValue devolve o texto normalizado", () => {
  assert.equal(pix.storedPixValue({ normalized: "ana@exemplo.org", type: "email", masked: "a**@exemplo.org" }), "ana@exemplo.org");
  assert.equal(pix.storedPixValue("ana@exemplo.org"), "ana@exemplo.org", "dado antigo em texto continua valendo");
  assert.equal(pix.storedPixValue(null), "");
  assert.equal(pix.storedPixValue({}), "");
});

test("moderação - autores bloqueados e silenciados guardados como registro mostram o id, não [object Object]", () => {
  const main = { innerHTML: "" };
  const blocked = [{ routeId: "vx_bloqueado00000000a", reason: "", blockedAt: 1 }];
  const muted = [{ routeId: "vx_silenciado0000000b", mutedAt: 1 }];
  render.renderNetworkSettings(main, { settings: {}, blockedUsers: blocked, mutedUsers: muted });
  assert.ok(!main.innerHTML.includes("[object Object]"));
  assert.ok(main.innerHTML.includes('data-route="vx_bloqueado00000000a"'), "Desbloquear leva o routeId");
  assert.ok(main.innerHTML.includes('data-route="vx_silenciado0000000b"'), "Desilenciar leva o routeId");
});

test("frame - o botão desenhado (data-index) registra o voto e redesenha a apuração", async () => {
  const frame = { kind: "poll", title: "Praça", "of:accepts:vox": "v1", "of:image": "https://exemplo.org/f.png", "of:button:1": "Sim", "of:button:2": "Não" };
  await cacheNode.saveLocalPost({ id: "p_frame_achado", type: "topic", title: "Enquete", body: "b", frame, ts: 1 });
  const content = fakeContainer();
  const undo = withElements({ "frame-content-p_frame_achado": content });
  try {
    const btn = { dataset: { postId: "p_frame_achado", index: "1", label: "Sim" }, textContent: "Sim", disabled: false };
    await init.handleFrameActionClick(btn);
  } finally {
    undo();
  }
  assert.equal(frames.getUserFrameAction("p_frame_achado")?.buttonIndex, 1, "o voto fica salvo com buttonIndex");
  assert.ok(content.innerHTML.length > 0, "a apuração foi redesenhada no frame-content-…");
});

test("editar post - o modal abre no #modal-container com o formulário de edição", async () => {
  const me = await localAccount.getRouteId();
  const signed = await localAccount.signPayload({ id: "p_edit_achado", type: "topic", title: "Título", body: "Corpo do post", author: me, ts: 1 });
  await cacheNode.saveLocalPost(signed);
  const modal = fakeContainer();
  const undo = withElements({ "modal-container": modal });
  try {
    await init.openPostEditModal("p_edit_achado");
  } finally {
    undo();
  }
  assert.ok(modal.innerHTML.includes('id="form-post-edit"'));
  assert.ok(modal.innerHTML.includes("Corpo do post"));
});
