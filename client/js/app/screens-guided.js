/** @file Telas dos assistentes em etapas: rede, Senha Soberana e carteira. */
import * as render from "../render.js";
import * as peers from "../peers.js";
import * as share from "../share.js";
import * as wallet from "../wallet.js";
import * as localAccount from "../local-account.js";
import * as pixKeyHelper from "../pix-key.js";
import { renderNetworkWizard, renderBackupWizard, renderWalletWizard } from "../render/guided-setup.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { syncIdentity } from "./screens-network.js";

/** Pura: aplica as escolhas do assistente sobre as configurações atuais. */
export function applyNetworkWizardChoices(current, { enabled, cap, wifiOnly, backgroundRelay }) {
  return {
    ...current,
    enabled: enabled === "sim",
    dailyCapMb: Number(cap) || current.dailyCapMb,
    wifiOnly: Boolean(wifiOnly),
    backgroundRelay: Boolean(backgroundRelay),
  };
}

export async function showNetworkWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Configuração guiada"));
  renderNetworkWizard(main, peers.getPeerSettings());
  const form = document.getElementById("form-network-wizard");
  bindComposeStepper(form);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = applyNetworkWizardChoices(peers.getPeerSettings(), {
      enabled: document.getElementById("net-g-enabled")?.value,
      cap: document.getElementById("net-g-cap")?.value,
      wifiOnly: document.getElementById("net-g-wifi")?.checked,
      backgroundRelay: document.getElementById("net-g-bg")?.checked,
    });
    peers.savePeerSettings(next);
    share.showToast("Configuração da rede salva.");
    location.hash = "#/settings/network";
  });
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** As etapas de confirmação/teste só validam quando repetem exatamente a senha criada. */
function bindPassphraseMatch() {
  const first = document.getElementById("bk-pass");
  const sync = () => {
    const pattern = first?.value ? escapeRegex(first.value) : "(?!)";
    ["bk-pass2", "bk-pass3"].forEach((id) => document.getElementById(id)?.setAttribute("pattern", pattern));
  };
  first?.addEventListener("input", sync);
  sync();
}

export async function showBackupWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Backup da identidade"));
  renderBackupWizard(main);
  bindPassphraseMatch();
  const form = document.getElementById("form-backup-wizard");
  bindComposeStepper(form);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-backup-wizard-save");
    const out = document.getElementById("bk-result");
    if (btn) btn.disabled = true;
    try {
      const { savePassphraseVault } = await import("../oauth-vault.js");
      const res = await savePassphraseVault(document.getElementById("bk-pass")?.value || "");
      if (out) {
        out.hidden = false;
        out.textContent = res.ok
          ? "Cofre salvo. Em outro aparelho, escolha “Já tenho conta” e digite sua Senha Soberana."
          : res.reason || "Não foi possível salvar o cofre.";
      }
      share.showToast(res.ok ? "Backup da identidade concluído." : "Falha no backup.", res.ok ? "info" : "error");
    } catch (err) {
      share.showToast(`Erro no backup: ${err?.message || err}`, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function syncWalletHints() {
  const mode = document.getElementById("wg-mode")?.value || "gerar";
  document.querySelectorAll("[data-wg-hint]").forEach((el) => { el.hidden = el.dataset.wgHint !== mode; });
}

async function applyWalletChoice(mode) {
  if (mode === "gerar") await wallet.generateNewWallet();
  if (mode === "importar") await wallet.saveJwk(JSON.parse(document.getElementById("wg-jwk")?.value.trim() || ""));
  if (mode !== "manter") await syncIdentity();
}

function applyPix() {
  const raw = document.getElementById("wg-pix")?.value.trim() || "";
  if (!raw) return true;
  const v = pixKeyHelper.validatePixKey(raw);
  if (!v.ok) {
    share.showToast(`Chave Pix inválida: ${v.errorPt}`, "error");
    return false;
  }
  localAccount.setPixKey({ normalized: v.normalized, type: v.type, masked: pixKeyHelper.maskForDisplay(v.normalized, v.type) });
  return true;
}

export async function showWalletWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Configuração guiada"));
  renderWalletWizard(main, { hasWallet: wallet.hasWallet(), pix: localAccount.getPixKey?.()?.normalized || "" });
  document.getElementById("wg-mode")?.addEventListener("change", syncWalletHints);
  syncWalletHints();
  const form = document.getElementById("form-wallet-wizard");
  bindComposeStepper(form);
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!applyPix()) return;
    try {
      await applyWalletChoice(document.getElementById("wg-mode")?.value || "manter");
      share.showToast("Carteira configurada.");
      location.hash = "#/wallet";
    } catch (err) {
      share.showToast(err instanceof SyntaxError ? "JSON da chave inválido." : `Erro: ${err?.message || err}`, "error");
    }
  });
}
