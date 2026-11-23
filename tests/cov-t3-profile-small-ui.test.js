/**
 * @file Cobertura de `app/profile-identity-meta-ui.js`, `app/profile-note-ui.js` e `app/profile-vault-sync.js`:
 * chips de pronomes, editor da nota curta e botões de sincronização do cofre.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, waitFor, withToasts } from "./helpers/cov-t3-dom.mjs";

const metaUi = await import("../client/js/app/profile-identity-meta-ui.js");
const noteUi = await import("../client/js/app/profile-note-ui.js");
const vaultSync = await import("../client/js/app/profile-vault-sync.js");
const identityMeta = await import("../client/js/profile-identity-meta.js");
const profileNote = await import("../client/js/profile-note.js");
const localAccount = await import("../client/js/identity/index.js");

globalThis.CSS = { escape: (s) => String(s) };

test("identidade: chips preenchem o campo, marcam o ativo e o formulário grava e limpa", async () => {
  await withToasts(async () => {
    const input = makeEl({ value: "" });
    const chipEla = makeEl({ dataset: { pronounPreset: "ela/dela" } });
    const chipEle = makeEl({ dataset: { pronounPreset: "ele/dele" } });
    const form = makeEl();
    const clear = makeEl();
    const { toasts } = installDom({
      ids: {
        "form-identity-meta": form, "input-profile-pronouns": input, "btn-clear-identity-meta": clear,
        "input-profile-gender": makeEl({ value: "mulher" }), "input-profile-orientation": makeEl({ value: "bi" }),
      },
      all: { "[data-pronoun-preset]": [chipEla, chipEle] },
    });
    const saved = [];
    metaUi.bindIdentityMetaForm({ address: "vx_meta_t3", activeTab: "about", isSelf: true, onAfterSave: (...a) => saved.push(a) });

    await chipEla.fire("click");
    assert.equal(input.value, "ela/dela");
    assert.equal(input.focused, 1);
    assert.equal(chipEla.attrs["aria-pressed"], "true");
    assert.equal(chipEle.attrs["aria-pressed"], "false");
    assert.equal(chipEla.classList.contains("is-active"), true);

    input.value = "ele/dele";
    await input.fire("input");
    assert.equal(chipEle.attrs["aria-pressed"], "true");
    assert.equal(chipEla.classList.contains("is-active"), false);

    await form.fire("submit");
    assert.deepEqual(identityMeta.getLocalIdentityMeta("vx_meta_t3"), { pronouns: "ele/dele", gender: "mulher", orientation: "bi" });
    assert.equal(toasts[0].text, "Pronomes e identidade atualizados!");

    await clear.fire("click");
    assert.equal(identityMeta.hasAnyIdentityMeta(identityMeta.getLocalIdentityMeta("vx_meta_t3")), false);
    assert.equal(toasts[1].text, "Campos opcionais removidos.");
    assert.deepEqual(saved, [["vx_meta_t3", "about"], ["vx_meta_t3", "about"]]);
  });
});

test("identidade: perfil alheio ou sem formulário não liga nada", () => {
  const form = makeEl();
  installDom({ ids: { "form-identity-meta": form } });
  metaUi.bindIdentityMetaForm({ address: "vx_x", activeTab: "about", isSelf: false, onAfterSave() {} });
  assert.equal(form.listeners.submit, undefined);
  installDom();
  assert.doesNotThrow(() => metaUi.bindIdentityMetaForm({ address: "vx_x", activeTab: "about", isSelf: true, onAfterSave() {} }));
});

let noteEnvCache = null;

/** Ambiente único da nota: o módulo liga o ouvinte de clique uma só vez, no primeiro documento. */
async function noteEnv() {
  if (noteEnvCache) {
    globalThis.document = noteEnvCache.document;
    return noteEnvCache;
  }
  await localAccount.ensureLocalAccount();
  const me = await localAccount.getRouteId();
  const { document, toasts } = installDom({ ids: { "profile-note-input": makeEl() } });
  noteUi.attachProfileNoteHandlers();
  noteUi.attachProfileNoteHandlers();
  assert.equal(document.listeners.click.length, 1, "liga uma única vez");
  const bubble = makeEl({ dataset: { noteOwn: "1", noteRoute: me } });
  bubble.querySelector = () => makeEl();
  const hit = makeEl({ closestMap: { ".profile-note-bubble": bubble } });
  const click = (target) => document.listeners.click[0]({ target, preventDefault() {} });
  noteEnvCache = { document, toasts, me, click, openSheet: () => click(hit) };
  return noteEnvCache;
}

function sheetButton(sheet, action) {
  const btn = { dataset: { noteAction: action } };
  return makeEl({ dataset: btn.dataset, closestMap: { "[data-note-action]": btn, "#profile-note-sheet": sheet } });
}

test("nota: clicar na bolha própria abre o sheet com a nota; guardar e limpar agem", async () => {
  await withToasts(async () => {
    const env = await noteEnv();
    profileNote.setNote(env.me, "nota antiga");
    env.openSheet();
    const sheet = env.document.getElementById("profile-note-sheet");
    const input = env.document.getElementById("profile-note-input");
    assert.equal(sheet.hidden, false);
    assert.equal(sheet.classList.contains("is-open"), true);
    assert.equal(input.value, "nota antiga");
    assert.equal(input.focused, 1);

    input.value = "  nova nota  ";
    env.click(sheetButton(sheet, "save"));
    await waitFor(() => env.toasts.length > 0);
    assert.equal(profileNote.getNote(env.me).text, "nova nota");
    assert.equal(sheet.hidden, true);
    assert.equal(env.toasts.at(-1).text, "Nota guardada neste aparelho.");

    env.openSheet();
    env.click(sheetButton(sheet, "clear"));
    await waitFor(() => env.toasts.length > 1);
    assert.equal(profileNote.getNote(env.me), null);
    assert.equal(env.toasts.at(-1).text, "Nota limpa.");
  });
});

test("nota: cancelar, clicar no fundo e clicar fora fecham ou ignoram como esperado", async () => {
  const env = await noteEnv();
  const sheet = env.document.getElementById("profile-note-sheet");
  env.openSheet();
  env.click(sheetButton(sheet, "cancel"));
  assert.equal(sheet.hidden, true);

  env.openSheet();
  env.click(makeEl({ closestMap: { "#profile-note-sheet": sheet } }));
  assert.equal(sheet.hidden, false, "clique dentro do painel, fora dos botões, mantém aberto");
  sheet.closestMap = { "#profile-note-sheet": sheet };
  env.click(sheet);
  assert.equal(sheet.hidden, true, "clique no fundo fecha");
  env.click(makeEl());
  assert.equal(sheet.hidden, true);
});

test("cofre: needsNoEmailConfirm só pede quando a conta tem saída por e-mail e o campo está vazio", () => {
  assert.equal(vaultSync.needsNoEmailConfirm("", { email: 1 }), true);
  assert.equal(vaultSync.needsNoEmailConfirm("a@b.co", { email: 1 }), false);
  assert.equal(vaultSync.needsNoEmailConfirm("", {}), false);
});

test("cofre: buildSyncUrl codifica o cofre no fragmento do link", () => {
  const url = vaultSync.buildSyncUrl({ a: 1 }, (r) => `ENC ${JSON.stringify(r)}`, { origin: "https://vox.test", pathname: "/app/" });
  assert.equal(url, `https://vox.test/app/#/sync?b=${encodeURIComponent('ENC {"a":1}')}`);
});

test("cofre: gravar sem senha mostra o aviso e reabilita o botão (link e QR)", async () => {
  await withToasts(async () => {
    const save = makeEl();
    const qr = makeEl();
    const { toasts } = installDom({
      ids: { "btn-save-sovereign-vault": save, "btn-sync-qr-device": qr, "input-sovereignty-passphrase": makeEl({ value: "" }) },
    });
    vaultSync.bindProfileVaultSync();
    await save.fire("click");
    await qr.fire("click");
    assert.deepEqual(toasts.map((t) => t.text), [
      "Digite sua Senha Soberana no campo acima.",
      "Digite sua Senha Soberana no campo acima para gerar o QR Code.",
    ]);
    assert.equal(save.disabled, false);
    assert.equal(qr.disabled, false);
  });
});

test("cofre: conta com saída por e-mail e campo vazio pede confirmação; recusar não grava", async () => {
  await withToasts(async () => {
    await localAccount.ensureLocalAccount();
    const me = await localAccount.getRouteId();
    const exits = await import("../client/js/identity/account-exit.js");
    exits.markAccountExit("email", me);
    assert.equal(vaultSync.needsNoEmailConfirm(""), true);
    const asked = [];
    globalThis.confirm = (msg) => { asked.push(msg); return false; };
    const save = makeEl();
    const { toasts } = installDom({
      ids: { "btn-save-sovereign-vault": save, "input-sovereignty-passphrase": makeEl({ value: "senha longa de teste" }), "input-sovereignty-email": makeEl({ value: "" }) },
    });
    vaultSync.bindProfileVaultSync();
    await save.fire("click");
    assert.equal(asked.length, 1);
    assert.match(asked[0], /saída por e-mail/);
    assert.equal(toasts.length, 0, "cancelado: sem erro nem sucesso");
  });
});

/** Servidor de memória falso: guarda o cofre por endereço. */
function installMemoryServer() {
  const realFetch = globalThis.fetch;
  const store = new Map();
  globalThis.fetch = async (url, opts = {}) => {
    const key = String(url).split("/memory/vault/")[1];
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    if (opts.method === "POST") {
      store.set(key, JSON.parse(opts.body).record);
      return { ok: true, json: async () => ({ status: "saved" }) };
    }
    const record = store.get(key);
    return record ? { ok: true, json: async () => ({ status: "ok", record }) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { store, restore: () => { globalThis.fetch = realFetch; } };
}

test("cofre: com servidor de memória, grava o cofre, avisa e mostra o link; o QR abre o sheet", async () => {
  await withToasts(async () => {
    const server = installMemoryServer();
    const store = server.store;
    try {
      localStorage.clear();
      localAccount.wipeLocalAccount();
      await localAccount.ensureLocalAccount();
      const save = makeEl();
      const qr = makeEl();
      const feedback = makeEl({ hidden: true });
      const prev = makeEl({ value: "" });
      const { document, toasts } = installDom({
        ids: {
          "btn-save-sovereign-vault": save, "btn-sync-qr-device": qr, "sovereignty-sync-feedback": feedback,
          "input-sovereignty-passphrase": makeEl({ value: "minha senha inicial ok" }),
          "input-sovereignty-email": makeEl({ value: "" }), "input-sovereignty-prev-passphrase": prev,
        },
      });
      globalThis.location = { origin: "https://vox.test", pathname: "/", hash: "" };
      vaultSync.bindProfileVaultSync();
      await save.fire("click");
      assert.equal(toasts.at(-1).text, "Cofre gravado.");
      assert.equal(feedback.hidden, false);
      const link = feedback.children.find((c) => c.href);
      assert.match(link.href, /^https:\/\/vox\.test\/#\/sync\?b=/);
      assert.equal(link.rel, "noopener");
      assert.equal(store.size > 0, true);

      await qr.fire("click");
      const sheet = document.getElementById("qr-url-sheet");
      assert.equal(sheet.hidden, false);
      assert.equal(toasts.at(-1).type, "info", "o QR abriu sem erro");
    } finally {
      server.restore();
      localStorage.clear();
    }
  });
});
