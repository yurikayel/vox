/**
 * @file Cobertura de `app/profile-screen-wallet.js` e `render/profile-wallet.js`: carteira Arweave,
 * chave DM, handle on-chain, consulta Pix e conflito de handle.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, settle, withToasts } from "./helpers/cov-t3-dom.mjs";

const walletUi = await import("../client/js/app/profile-screen-wallet.js");
const renderWallet = await import("../client/js/render/profile-wallet.js");
const wallet = await import("../client/js/wallet.js");
const flags = await import("../client/js/feature-flags.js");
const localAccount = await import("../client/js/identity/index.js");

const realFetch = globalThis.fetch;

function offline() {
  globalThis.fetch = async () => { throw new Error("sem rede"); };
}

async function storeSomeWallet() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  await wallet.saveJwk(await crypto.subtle.exportKey("jwk", pair.privateKey));
}

test("render: consulta Pix achada mostra nome, handle, chave mascarada e links", () => {
  const main = makeEl();
  renderWallet.renderPixLookup(main, "x", { routeId: "vx_abc", name: "Ana <b>", handle: "ana", pixKeyMasked: "***@x.co" });
  assert.match(main.innerHTML, /Conta Localizada/);
  assert.match(main.innerHTML, /Ana &lt;b&gt;/);
  assert.match(main.innerHTML, /@ana/);
  assert.match(main.innerHTML, /\*\*\*@x\.co/);
  assert.match(main.innerHTML, /href="#\/dm\/vx_abc"/);
});

test("render: consulta Pix sem perfil escapa a chave buscada", () => {
  const main = makeEl();
  renderWallet.renderPixLookup(main, "<script>");
  assert.match(main.innerHTML, /Chave Pix não vinculada/);
  assert.match(main.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(main.innerHTML, /<script>/);
});

test("render: conflito de handle lista cada reivindicante com link para o perfil", () => {
  const main = makeEl();
  renderWallet.renderHandleConflict(main, "ana", [{ owner: "vx_dono1", txId: "tx1" }, { owner: "vx_dono2", txId: "tx2" }]);
  assert.match(main.innerHTML, /Múltiplas contas reivindicam @ana/);
  assert.equal((main.innerHTML.match(/class="card"/g) || []).length, 2);
  assert.match(main.innerHTML, /href="#\/u\/vx_dono2"/);
});

test("render: carteira conectada mostra saldo, endereço e a chave Pix soberana", () => {
  localAccount.setPixKey({ normalized: "ana@x.co", type: "email", masked: "an***@x.co" });
  const main = makeEl({ innerHTML: "" });
  renderWallet.renderWallet(main, { address: "ARADDR", balance: "1.5", hasWallet: true, error: "falhou <i>" });
  assert.match(main.innerHTML, /1\.5 AR/);
  assert.match(main.innerHTML, /ARADDR/);
  assert.match(main.innerHTML, /Chave Pix soberana · email/);
  assert.match(main.innerHTML, /an\*\*\*@x\.co/);
  assert.match(main.innerHTML, /id="btn-disconnect-wallet"/);
  assert.match(main.innerHTML, /<div class="error">falhou &lt;i&gt;<\/div>/);
  localAccount.clearPixKey();
});

test("render: sem carteira oferece gerar uma e sem Pix convida a configurar", () => {
  localAccount.clearPixKey();
  const main = makeEl({ innerHTML: "" });
  renderWallet.renderWallet(main);
  assert.match(main.innerHTML, /id="btn-generate-wallet"/);
  assert.match(main.innerHTML, /agora-wallet-pix--empty/);
  assert.match(main.innerHTML, /id="form-import-wallet"/);
  assert.doesNotMatch(main.innerHTML, /class="error"/);
});

test("requireArweaveUpload: recusa com a flag desligada e depois sem carteira", async () => {
  await withToasts(async () => {
    wallet.removeWallet();
    const { toasts } = installDom();
    flags.applyFlags({});
    assert.equal(walletUi.requireArweaveUpload("falta carteira"), false);
    assert.equal(toasts[0].text, flags.disabledMessage("arweaveUpload"));
    flags.applyFlags({ flags: { arweaveUpload: true } });
    assert.equal(walletUi.requireArweaveUpload("falta carteira"), false);
    assert.equal(toasts[1].text, "falta carteira");
    assert.equal(toasts[1].type, "error");
    await storeSomeWallet();
    assert.equal(walletUi.requireArweaveUpload("falta carteira"), true);
    wallet.removeWallet();
    flags.applyFlags({});
  });
});

test("DM e handle: copiar a chave pública e desconectar a carteira (com confirmação)", async () => {
  await withToasts(async () => {
    await storeSomeWallet();
    const copied = [];
    Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: (t) => copied.push(t) }, configurable: true });
    const copy = makeEl();
    const disc = makeEl();
    const { toasts } = installDom({ ids: { "btn-copy-dmpub": copy, "btn-disconnect-wallet": disc } });
    const reloads = [];
    walletUi.bindWalletAndDmButtons("vx_a", true, { kty: "EC" }, "vx_a", (a) => reloads.push(a));
    await copy.fire("click");
    assert.deepEqual(copied, ['{"kty":"EC"}']);
    globalThis.confirm = () => false;
    await disc.fire("click");
    assert.equal(wallet.hasWallet(), true, "cancelar mantém a carteira");
    globalThis.confirm = () => true;
    await disc.fire("click");
    assert.equal(wallet.hasWallet(), false);
    assert.deepEqual(reloads, ["vx_a"]);
    assert.equal(toasts.at(-1).text, "Carteira desconectada.");
  });
});

test("Anunciar chave: sem carteira o botão não muda; com falha de rede volta ao texto original", async () => {
  await withToasts(async () => {
    offline();
    flags.applyFlags({ flags: { arweaveUpload: true } });
    wallet.removeWallet();
    const pub = makeEl({ textContent: "🌐 Publicar Chave on-chain" });
    const { toasts } = installDom({ ids: { "btn-publish-dmpub": pub } });
    walletUi.bindWalletAndDmButtons("vx_a", true, { kty: "EC" }, "vx_a", undefined);
    await pub.fire("click");
    assert.equal(pub.disabled, false);
    assert.equal(toasts[0].type, "error");
    await storeSomeWallet();
    await pub.fire("click");
    assert.equal(pub.disabled, false);
    assert.equal(pub.textContent, "🌐 Publicar Chave on-chain");
    assert.match(toasts.at(-1).text, /^Erro ao anunciar: /);
    wallet.removeWallet();
    flags.applyFlags({});
    globalThis.fetch = realFetch;
  });
});

test("Reivindicar handle: slug inválido avisa; slug válido sem rede restaura o botão", async () => {
  await withToasts(async () => {
    offline();
    flags.applyFlags({ flags: { arweaveUpload: true } });
    await storeSomeWallet();
    const form = makeEl();
    const input = makeEl({ value: "x" });
    const btn = makeEl({ textContent: "Salvar @handle" });
    const { toasts } = installDom({ ids: { "form-claim-handle": form, "input-handle-slug": input, "btn-submit-handle": btn } });
    walletUi.bindWalletAndDmButtons("vx_a", true, null, "vx_a", undefined);
    await form.fire("submit");
    assert.equal(toasts.at(-1).type, "error");
    assert.equal(btn.disabled, false);
    input.value = "ana-teste";
    await form.fire("submit");
    assert.match(toasts.at(-1).text, /^Erro ao gravar handle: /);
    assert.equal(btn.textContent, "Salvar @handle");
    assert.equal(btn.disabled, false);
    wallet.removeWallet();
    flags.applyFlags({});
    globalThis.fetch = realFetch;
  });
});

test("showWallet: monta a tela e rejeita JSON JWK inválido sem criar carteira", async () => {
  await withToasts(async () => {
    offline();
    wallet.removeWallet();
    const main = makeEl({ innerHTML: "" });
    const gen = makeEl();
    const form = makeEl();
    const disc = makeEl();
    const { toasts } = installDom({
      ids: {
        "app-root": makeEl(), "app-main": main, "btn-generate-wallet": gen,
        "form-import-wallet": form, "wallet-jwk-input": makeEl({ value: "não é json" }), "btn-disconnect-wallet": disc,
      },
    });
    await walletUi.showWallet();
    assert.match(main.innerHTML, /Carteira Soberana/);
    assert.match(main.innerHTML, /id="btn-generate-wallet"/);
    await form.fire("submit");
    assert.equal(toasts.at(-1).text, "JSON JWK inválido. Verifique o formato.");
    assert.equal(wallet.hasWallet(), false);
    globalThis.fetch = realFetch;
  });
});

test("showWallet: gerar nova carteira grava no aparelho e remover pede confirmação", async () => {
  await withToasts(async () => {
    wallet.removeWallet();
    const gen = makeEl();
    const disc = makeEl();
    const { toasts } = installDom({
      ids: { "app-root": makeEl(), "app-main": makeEl(), "btn-generate-wallet": gen, "btn-disconnect-wallet": disc },
    });
    await walletUi.showWallet();
    await gen.fire("click");
    await settle();
    assert.equal(wallet.hasWallet(), true);
    assert.equal(toasts.some((t) => t.text === "Carteira criada com sucesso!"), true);
    globalThis.confirm = () => true;
    await disc.fire("click");
    assert.equal(wallet.hasWallet(), false);
    assert.equal(toasts.at(-1).text, "Carteira removida do navegador.");
  });
});
