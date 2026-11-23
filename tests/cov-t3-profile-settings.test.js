/**
 * @file Cobertura de `app/profile-screen-settings.js`: botões de Pix, GitHub, README, compartilhamento,
 * nome, malha, moderação e passaporte de Voxels, conferidos pelo estado gravado e pelos toasts.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, settle, withToasts } from "./helpers/cov-t3-dom.mjs";

const settings = await import("../client/js/app/profile-screen-settings.js");
const localAccount = await import("../client/js/identity/index.js");
const social = await import("../client/js/social.js");
const mod = await import("../client/js/moderation.js");

const ROUTE = "vx_cov_t3_alvo";

function reloader() {
  const calls = [];
  return { calls, fn: (...args) => calls.push(args) };
}

test("Pix: campo vazio remove a chave salva e recarrega a aba", async () => {
  await withToasts(async () => {
    localAccount.setPixKey({ normalized: "a@b.co", type: "email" });
    const form = makeEl();
    const { toasts } = installDom({ ids: { "form-pix-key": form, "input-pix-key": makeEl({ value: "  " }) } });
    const r = reloader();
    settings.bindPixButtons(ROUTE, "about", true, r.fn);
    await form.fire("submit");
    assert.equal(localAccount.getPixKey(), null);
    assert.deepEqual(r.calls, [[ROUTE, "about"]]);
    assert.equal(toasts[0].text, "Chave Pix removida do perfil.");
  });
});

test("Pix: chave inválida mostra o aviso no feedback e não grava nada", async () => {
  localAccount.clearPixKey();
  const feedback = makeEl();
  const form = makeEl();
  installDom({ ids: { "form-pix-key": form, "input-pix-key": makeEl({ value: "###" }), "pix-feedback": feedback } });
  const r = reloader();
  settings.bindPixButtons(ROUTE, "about", true, r.fn);
  await form.fire("submit");
  assert.match(feedback.innerHTML, /color:var\(--danger\)/);
  assert.equal(localAccount.getPixKey(), null);
  assert.equal(r.calls.length, 0);
});

test("Pix: botão limpar apaga a chave; sem ser a própria conta nada é ligado", async () => {
  await withToasts(async () => {
    localAccount.setPixKey({ normalized: "a@b.co", type: "email" });
    const btn = makeEl();
    const form = makeEl();
    const { toasts } = installDom({ ids: { "btn-clear-pix": btn, "form-pix-key": form } });
    const r = reloader();
    settings.bindPixButtons(ROUTE, "about", false, r.fn);
    assert.equal(btn.listeners.click, undefined);
    assert.equal(form.listeners.submit, undefined);
    settings.bindPixButtons(ROUTE, "about", true, r.fn);
    await btn.fire("click");
    assert.equal(localAccount.getPixKey(), null);
    assert.equal(toasts[0].text, "Chave Pix removida.");
    assert.equal(r.calls.length, 1);
  });
});

test("GitHub: salvar e limpar gravam o handle e avisam", async () => {
  await withToasts(async () => {
    const form = makeEl();
    const btn = makeEl();
    const { toasts } = installDom({ ids: { "form-github-handle": form, "input-github-handle": makeEl({ value: " octocat " }), "btn-clear-github": btn } });
    const r = reloader();
    settings.bindGithubButtons(ROUTE, "about", true, r.fn);
    await form.fire("submit");
    assert.equal(social.getLocalGithubHandle(), "octocat");
    assert.equal(toasts[0].text, "Perfil do GitHub salvo!");
    await btn.fire("click");
    assert.equal(social.getLocalGithubHandle(), "");
    assert.equal(toasts[1].text, "GitHub removido.");
    assert.equal(r.calls.length, 2);
  });
});

test("GitHub: handle vazio no formulário diz que foi removido", async () => {
  await withToasts(async () => {
    const form = makeEl();
    const { toasts } = installDom({ ids: { "form-github-handle": form, "input-github-handle": makeEl({ value: "" }) } });
    settings.bindGithubButtons(ROUTE, "about", true, undefined);
    await form.fire("submit");
    assert.equal(toasts[0].text, "GitHub removido.");
  });
});

test("README: alterna edição, cancela e salva o texto", async () => {
  await withToasts(async () => {
    const toggle = makeEl();
    const cancel = makeEl();
    const form = makeEl({ style: { display: "none" } });
    const view = makeEl({ style: { display: "block" } });
    const { toasts } = installDom({ ids: {
      "btn-toggle-edit-readme": toggle, "btn-cancel-readme": cancel, "form-edit-readme": form,
      "readme-view": view, "input-profile-readme": makeEl({ value: "# Olá" }),
    } });
    const r = reloader();
    settings.bindReadmeButtons(ROUTE, "about", true, r.fn);
    await toggle.fire("click");
    assert.equal(form.style.display, "block");
    assert.equal(view.style.display, "none");
    await toggle.fire("click");
    assert.equal(form.style.display, "none");
    await toggle.fire("click");
    await cancel.fire("click");
    assert.equal(form.style.display, "none");
    assert.equal(view.style.display, "block");
    await form.fire("submit");
    assert.equal(social.getLocalReadme(), "# Olá");
    assert.equal(toasts[0].text, "README.md atualizado!");
    assert.deepEqual(r.calls, [[ROUTE, "about"]]);
  });
});

test("Compartilhar: copia a rota e o link de DM e abre o QR de conexão", async () => {
  await withToasts(async () => {
    const copied = [];
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: (t) => copied.push(t) }, configurable: true });
    globalThis.location = { origin: "https://vox.test", pathname: "/app/", hash: "" };
    const copyRoute = makeEl({ dataset: { route: "vx_outra" } });
    const copyDm = makeEl();
    const qrBtn = makeEl({ dataset: { qrId: "vx_qr" } });
    const { toasts, document } = installDom({
      ids: { "btn-copy-author-route": copyRoute, "btn-copy-my-dm-link": copyDm },
      all: { "[data-qr-share='connect'], #btn-qr-connect-link": [qrBtn] },
    });
    settings.bindSharingAndClipboardButtons(ROUTE);
    await copyRoute.fire("click");
    await copyDm.fire("click");
    assert.deepEqual(copied, ["vx_outra", "https://vox.test/app/#/dm/vx_cov_t3_alvo"]);
    assert.equal(toasts[0].text, "ID de rota copiado!");
    await qrBtn.fire("click");
    const sheet = document.getElementById("qr-url-sheet");
    assert.equal(sheet.hidden, false);
    assert.match(sheet.querySelector(".qr-url-href").textContent, /#\/connect\/vx_qr$/);
  });
});

test("Nome: salva o nome local e recarrega só com o endereço", async () => {
  await withToasts(async () => {
    const form = makeEl();
    const { toasts } = installDom({ ids: { "form-display-name": form, "input-display-name": makeEl({ value: "  Ana Teste " }) } });
    const r = reloader();
    settings.bindDisplayNameAndOAuthButtons(ROUTE, "about", r.fn);
    await form.fire("submit");
    assert.equal(localAccount.getDisplayName(), "Ana Teste");
    assert.equal(toasts[0].text, "Nome local atualizado!");
    assert.deepEqual(r.calls, [[ROUTE]]);
    await settle();
  });
});

test("Malha e OAuth: alternar descoberta grava a preferência; limpar enriquecimento avisa", async () => {
  await withToasts(async () => {
    const mesh = makeEl();
    const clear = makeEl();
    const { toasts } = installDom({ ids: { "profile-mesh-discoverable": mesh, "btn-clear-oauth-enrich": clear } });
    const r = reloader();
    settings.bindDisplayNameAndOAuthButtons(ROUTE, "about", r.fn);
    await mesh.fire("change", { target: { checked: true } });
    assert.equal(localAccount.getMeshDiscoverable(), true);
    await clear.fire("click");
    assert.equal(toasts.at(-1).text, "Nome/foto importados removidos.");
    assert.ok(r.calls.length >= 1);
    await settle();
  });
});

test("Moderação: bloquear e silenciar alternam o estado; a própria conta é ignorada", async () => {
  await withToasts(async () => {
    const block = makeEl({ dataset: { route: ROUTE } });
    const muteBtn = makeEl({ dataset: {} });
    const { toasts } = installDom({ ids: { "btn-toggle-block": block, "btn-toggle-mute": muteBtn } });
    const r = reloader();
    settings.bindBlockAndMuteButtons(ROUTE, "posts", true, r.fn);
    assert.equal(block.listeners.click, undefined);
    settings.bindBlockAndMuteButtons(ROUTE, "posts", false, r.fn);
    await block.fire("click");
    assert.equal(mod.isUserBlocked(ROUTE), true);
    await block.fire("click");
    assert.equal(mod.isUserBlocked(ROUTE), false);
    await muteBtn.fire("click");
    assert.equal(mod.isUserMuted(ROUTE), true);
    await muteBtn.fire("click");
    assert.equal(mod.isUserMuted(ROUTE), false);
    assert.deepEqual(toasts.map((t) => t.text), [
      "Autor bloqueado (posts ocultados e fofocas descartadas).", "Autor desbloqueado.",
      "Autor silenciado no feed.", "Autor desilenciado.",
    ]);
    assert.equal(r.calls.length, 4);
  });
});

test("Voxels: exporta o passaporte assinado e devolve o botão ao normal", async () => {
  await withToasts(async () => {
    await localAccount.ensureLocalAccount();
    const routeId = await localAccount.getRouteId();
    const downloads = [];
    globalThis.URL.createObjectURL = (b) => { downloads.push(b); return "blob:x"; };
    globalThis.URL.revokeObjectURL = () => {};
    const btn = makeEl();
    const { toasts } = installDom({ ids: { "btn-export-voxel-passport": btn } });
    settings.bindVoxelButtons(routeId, "posts", true);
    assert.equal(btn.listeners.click, undefined, "só na aba voxels");
    settings.bindVoxelButtons(routeId, "voxels", true);
    await btn.fire("click");
    assert.equal(btn.disabled, false);
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].type, "application/json");
    assert.match(toasts.at(-1).text, /Passaporte Cívico exportado/);
  });
});
