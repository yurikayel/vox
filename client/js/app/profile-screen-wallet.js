/**
 * @file Submódulo de carteira Arweave, chave DM e registro de handle on-chain.
 * @module app/profile-screen-wallet
 */

import * as render from "../render.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as handles from "../handles.js";
import * as featureFlags from "../feature-flags.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { syncIdentity } from "./screens-network.js";

/**
 * Valida se upload Arweave está habilitado e se existe carteira configurada.
 *
 * @param {string} missingWalletMsg Mensagem de erro caso a carteira não exista.
 * @returns {boolean} True se a carteira e o upload estiverem disponíveis.
 */
export function requireArweaveUpload(missingWalletMsg) {
  if (!featureFlags.isFeatureEnabled("arweaveUpload")) {
    share.showToast(featureFlags.disabledMessage("arweaveUpload"), "error");
    return false;
  }
  if (!wallet.hasWallet()) {
    share.showToast(missingWalletMsg, "error");
    return false;
  }
  return true;
}

function bindPublishDmPubButton(isSelf, dmPub) {
  const btnPub = document.getElementById("btn-publish-dmpub");
  if (!btnPub || !isSelf || !dmPub) return;
  btnPub.addEventListener("click", async () => {
    if (!requireArweaveUpload("Conecte uma carteira Arweave para anunciar on-chain.")) return;
    btnPub.disabled = true;
    btnPub.textContent = "Anunciando on-chain…";
    try {
      const pubStr = JSON.stringify(dmPub);
      const tags = upload.buildTags("profile-key", { "Dm-Pub": pubStr });
      await upload.postData({ type: "profile-key", dmPub: pubStr }, tags);
      share.showToast("Chave pública anunciada com sucesso!");
      btnPub.textContent = "✓ Anunciada";
    } catch (err) {
      share.showToast(`Erro ao anunciar: ${err.message}`, "error");
      btnPub.disabled = false;
      btnPub.textContent = "🌐 Publicar Chave on-chain";
    }
  });
}

async function executeClaimHandle(slug, user, onReload) {
  const tags = upload.buildTags("handle", { Handle: slug, "Owner-Addr": user });
  await upload.postData({ handle: slug, owner: user }, tags);
  handles.cacheHandleMapping(slug, user);
  share.showToast(`Handle @${slug} gravado com sucesso!`);
  if (onReload) onReload(user);
}

function bindClaimHandleButton(isSelf, user, onReload) {
  const formClaim = document.getElementById("form-claim-handle");
  if (!formClaim || !isSelf) return;
  formClaim.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireArweaveUpload("Conecte uma carteira Arweave para reivindicar handle on-chain.")) return;
    const raw = document.getElementById("input-handle-slug")?.value.trim();
    const check = handles.validateSlug(raw);
    if (!check.valid) {
      share.showToast(check.error, "error");
      return;
    }
    const btn = document.getElementById("btn-submit-handle");
    btn.disabled = true;
    btn.textContent = "Gravando handle…";
    try {
      await executeClaimHandle(check.slug, user, onReload);
    } catch (err) {
      share.showToast(`Erro ao gravar handle: ${err.message}`, "error");
      btn.disabled = false;
      btn.textContent = "Salvar @handle";
    }
  });
}

function bindWalletGenerateAndDisconnect(address, onReload) {
  const btnGenWallet = document.getElementById("btn-generate-wallet");
  if (btnGenWallet) {
    btnGenWallet.addEventListener("click", async () => {
      btnGenWallet.disabled = true;
      btnGenWallet.textContent = "Gerando carteira…";
      try {
        await wallet.generateNewWallet();
        await syncIdentity();
        share.showToast("Carteira Arweave gerada com sucesso!");
        if (onReload) onReload(address);
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btnGenWallet.disabled = false;
        btnGenWallet.textContent = "⚡ Gerar Carteira Arweave";
      }
    });
  }

  const btnDiscWallet = document.getElementById("btn-disconnect-wallet");
  if (btnDiscWallet) {
    btnDiscWallet.addEventListener("click", () => {
      if (confirm("Desconectar carteira Arweave deste navegador?")) {
        wallet.removeWallet();
        share.showToast("Carteira desconectada.");
        if (onReload) onReload(address);
      }
    });
  }
}

/**
 * Associa eventos dos botões de carteira e chave pública DM.
 *
 * @param {string} address Endereço alvo.
 * @param {boolean} isSelf Indica se é a própria conta.
 * @param {unknown} dmPub Chave JWK pública para DM.
 * @param {string} user Endereço da conta ativa.
 * @param {(addr?: string) => void} [onReload] Callback para recarregar o perfil.
 * @returns {void}
 */
export function bindWalletAndDmButtons(address, isSelf, dmPub, user, onReload) {
  bindWalletGenerateAndDisconnect(address, onReload);

  const btnCopy = document.getElementById("btn-copy-dmpub");
  if (btnCopy && dmPub) {
    btnCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(JSON.stringify(dmPub));
      share.showToast("Chave pública Dm-Pub copiada!");
    });
  }

  bindPublishDmPubButton(isSelf, dmPub);
  bindClaimHandleButton(isSelf, user, onReload);
}

function bindWalletGenerateAction(onReload) {
  const btnGen = document.getElementById("btn-generate-wallet");
  if (!btnGen) return;
  btnGen.addEventListener("click", async () => {
    btnGen.disabled = true;
    btnGen.textContent = "Gerando par de chaves Arweave…";
    try {
      await wallet.generateNewWallet();
      await syncIdentity();
      share.showToast("Carteira criada com sucesso!");
      if (onReload) onReload();
    } catch (err) {
      share.showToast(`Erro ao gerar: ${err.message}`, "error");
      btnGen.disabled = false;
      btnGen.textContent = "⚡ Gerar Nova Carteira";
    }
  });
}

function bindWalletImportAndDisconnect(onReload) {
  const formImport = document.getElementById("form-import-wallet");
  if (formImport) {
    formImport.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("wallet-jwk-input")?.value.trim();
      try {
        const jwk = JSON.parse(input);
        await wallet.saveJwk(jwk);
        await syncIdentity();
        share.showToast("Carteira importada e salva localmente!");
        if (onReload) onReload();
      } catch {
        share.showToast("JSON JWK inválido. Verifique o formato.", "error");
      }
    });
  }

  const btnDisc = document.getElementById("btn-disconnect-wallet");
  if (btnDisc) {
    btnDisc.addEventListener("click", () => {
      if (confirm("Remover a carteira deste navegador? Certifique-se de ter backup.")) {
        wallet.removeWallet();
        share.showToast("Carteira removida do navegador.");
        if (onReload) onReload();
      }
    });
  }
}

/**
 * Monta e renderiza tela da carteira Arweave.
 *
 * @returns {Promise<void>}
 */
export async function showWallet() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Carteira"));

  let balance = "0.000";
  if (user) {
    try {
      balance = await wallet.getBalance(user);
    } catch {
      balance = "Indisponível";
    }
  }

  render.renderWallet(main, { address: user, balance, hasWallet: wallet.hasWallet() });
  bindWalletGenerateAction(showWallet);
  bindWalletImportAndDisconnect(showWallet);
}
