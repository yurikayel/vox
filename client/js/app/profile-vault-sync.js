/**
 * @file Perfil, cartão "Soberania & Sincronização": gravar o cofre e montar o link ou o QR para outro aparelho.
 *
 * - **E-mail (ADR-032 Emenda 1):** quem criou a conta com e-mail grava o cofre com o mesmo e-mail, que entra na
 *   derivação do endereço e da chave. Sem ele, o cofre ia para um endereço que sai só da senha. Conta com saída
 *   por e-mail e campo vazio pede confirmação antes.
 * - **Link (PM-92):** leva o cofre cifrado só pela senha (`syncBundle`, que não sai do aparelho); a senha é
 *   digitada no outro aparelho.
 * - **QR:** leva um cofre mínimo (conta, semente e o nome, se couber), também só pela senha, para caber no QR
 *   versão 11 (321 bytes). Pix e o resto vêm pelo link ou pelo cofre guardado.
 *
 * @module app/profile-vault-sync
 */

import * as share from "../share.js";
import { openQrUrlSheet } from "../qr-url.js";
import { QR_MAX_BYTES } from "../qr-url-codec.js";
import { getAccountExits } from "../account-exit.js";
import { getCachedRouteIdSync } from "../local-account.js";

const NO_EMAIL_CONFIRM =
  "Esta conta tem saída por e-mail. Sem o e-mail, o cofre fica num endereço que sai só da senha, mais fácil de adivinhar. Gravar mesmo assim?";

function readField(id) {
  return (document.getElementById(id)?.value || "").trim();
}

/**
 * Precisa confirmar a gravação sem e-mail? Só quando a conta já tem saída por e-mail e o campo ficou vazio.
 * @param {string} email o que a pessoa digitou
 * @param {Record<string, number>} [exits] saídas da conta ativa
 * @returns {boolean}
 */
export function needsNoEmailConfirm(email, exits = getAccountExits(getCachedRouteIdSync())) {
  return Boolean(exits?.email) && !email;
}

/**
 * Link `#/sync?b=…` com o cofre cifrado no fragmento.
 * @param {object} record cofre cifrado
 * @param {(record: object) => string} encodeFn codificador do cofre para URL
 * @param {{ origin: string, pathname: string }} [loc]
 * @returns {string}
 */
export function buildSyncUrl(record, encodeFn, loc = window.location) {
  return `${loc.origin}${loc.pathname}#/sync?b=${encodeURIComponent(encodeFn(record))}`;
}

async function saveVault(missingPassText) {
  const pass = readField("input-sovereignty-passphrase");
  const email = readField("input-sovereignty-email");
  if (!pass) return { error: missingPassText };
  if (needsNoEmailConfirm(email) && !confirm(NO_EMAIL_CONFIRM)) return { cancelled: true };
  const vault = await import("../oauth-vault.js");
  const res = await vault.savePassphraseVault(pass, email);
  return res.ok ? { pass, res, vault } : { error: res.reason || "Não deu para gravar o cofre." };
}

async function linkUrl(missingPassText) {
  const out = await saveVault(missingPassText);
  if (!out.res) return out;
  return { url: buildSyncUrl(out.res.syncBundle || out.res.bundle, out.vault.encodeVaultBundleForUrl) };
}

async function qrUrl(missingPassText) {
  const out = await saveVault(missingPassText);
  if (!out.res) return out;
  const prefix = buildSyncUrl(null, () => "");
  const qr = await out.vault.buildQrSyncRecord(out.pass, QR_MAX_BYTES - prefix.length);
  if (!qr.ok) return { error: qr.reason };
  return { url: buildSyncUrl(qr.record, out.vault.encodeVaultBundleForUrl) };
}

function showSyncLink(url) {
  const el = document.getElementById("sovereignty-sync-feedback");
  if (!el) return;
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = url;
  link.style.wordBreak = "break-all";
  el.hidden = false;
  el.style.color = "var(--accent)";
  el.replaceChildren("Pronto para outro aparelho. Abra este link lá e digite a senha. Mande o link e a senha por caminhos diferentes: ", link);
}

function bindVaultButton(id, missingPassText, makeUrl, onUrl) {
  const btn = document.getElementById(id);
  btn?.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const out = await makeUrl(missingPassText);
      if (out.error) share.showToast(out.error, "error");
      else if (out.url) onUrl(out.url);
    } catch (err) {
      share.showToast(`Não deu para gravar o cofre: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/** Liga "Sincronizar em outro aparelho" (link) e "QR Code para celular" do cartão do Perfil. */
export function bindProfileVaultSync() {
  bindVaultButton("btn-save-sovereign-vault", "Digite sua Senha Soberana no campo acima.", linkUrl, (url) => {
    share.showToast("Cofre gravado.");
    showSyncLink(url);
  });
  bindVaultButton("btn-sync-qr-device", "Digite sua Senha Soberana no campo acima para gerar o QR Code.", qrUrl, openQrUrlSheet);
}
