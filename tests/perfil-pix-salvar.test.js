/**
 * @file Salvar a chave Pix no Perfil (`app/profile-screen-settings.js`, `bindPixButtons`).
 *
 * Regressão: o handler lia `validation.valid`/`validation.error`, mas `validatePixKey` devolve `ok`/`errorPt`;
 * toda chave válida caía no ramo de erro com "undefined". E `setPixKey` recebia o texto em vez do registro
 * `{ normalized, type, masked }`, gravando a chave vazia.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installDom, makeEl, withToasts } from "./helpers/cov-t3-dom.mjs";

const settings = await import("../client/js/app/profile-screen-settings.js");
const localAccount = await import("../client/js/identity/index.js");

const ROUTE = "vx_pix_salvar";

/**
 * Liga o formulário com o valor digitado e envia.
 * @param {string} value Texto do campo.
 * @returns {Promise<{ feedback: object, reloads: unknown[][], toasts: Array<{ text: string }> }>}
 */
async function submitPix(value) {
  const form = makeEl();
  const feedback = makeEl();
  const { toasts } = installDom({
    ids: { "form-pix-key": form, "input-pix-key": makeEl({ value }), "pix-feedback": feedback },
  });
  const reloads = [];
  settings.bindPixButtons(ROUTE, "about", true, (...args) => reloads.push(args));
  await form.fire("submit");
  return { feedback, reloads, toasts };
}

test("Pix do Perfil: chave de e-mail válida é gravada como registro, avisa e recarrega a aba", async () => {
  localAccount.clearPixKey();
  await withToasts(async () => {
    const { feedback, reloads, toasts } = await submitPix("Ana@Exemplo.com.br");
    const saved = localAccount.getPixKey();
    assert.equal(saved?.normalized, "ana@exemplo.com.br");
    assert.equal(saved?.type, "email");
    assert.ok(saved?.masked, "a chave mascarada para exibição é gravada");
    assert.doesNotMatch(String(feedback.innerHTML ?? ""), /undefined/);
    assert.equal(toasts[0]?.text, "Chave Pix salva no seu perfil local!");
    assert.deepEqual(reloads, [[ROUTE, "about"]]);
  });
  localAccount.clearPixKey();
});

test("Pix do Perfil: chave inválida mostra o motivo real, não 'undefined'", async () => {
  localAccount.clearPixKey();
  const { feedback, reloads } = await submitPix("###");
  assert.match(feedback.innerHTML, /Formato de chave Pix não reconhecido/);
  assert.equal(localAccount.getPixKey(), null);
  assert.equal(reloads.length, 0);
});
