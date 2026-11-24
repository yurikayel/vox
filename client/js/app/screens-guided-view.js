/** @file Implementação sob demanda (PM-01) das telas dos assistentes em etapas: rede, Senha Soberana, carteira e guia celular. */
import * as render from "../render.js";
import * as peers from "../peers.js";
import * as share from "../share.js";
import * as wallet from "../wallet.js";
import * as localAccount from "../identity/index.js";
import * as pixKeyHelper from "../pix-key.js";
import { renderNetworkWizard, renderBackupWizard, renderWalletWizard, renderMobileGuideWizard } from "../render/guided-setup.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { syncIdentity } from "./screens-network.js";
import {
  MOBILE_GUIDE_STEPS,
  buildLocalFieldReport,
  collectMobileEnvironment,
  createGuideState,
  formatLocalFieldReportJson,
  formatLocalFieldReportMarkdown,
  markGuideStep,
  updateGuideEnv,
} from "./mobile-test-guide.js";

/**
 * Monta assistente de configuração de rede.
 *
 * @param {(current: object, choices: object) => object} applyChoices Função pura que mescla as escolhas.
 * @returns {Promise<void>}
 */
export async function showNetworkWizard(applyChoices) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "network", "Configuração guiada"));
  renderNetworkWizard(main, peers.getPeerSettings());
  const form = document.getElementById("form-network-wizard");
  bindComposeStepper(form);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = applyChoices(peers.getPeerSettings(), {
      enabled: choiceValue("net-g-enabled"),
      cap: document.getElementById("net-g-cap")?.value,
      wifiOnly: document.getElementById("net-g-wifi")?.checked,
      backgroundRelay: document.getElementById("net-g-bg")?.checked,
    });
    peers.savePeerSettings(next);
    share.showToast("Configuração da rede salva.");
    location.hash = "#/settings/network";
  });
}

/** Valor do rádio marcado num grupo de cartões de opção (`renderChoiceCards`). */
function choiceValue(id) {
  return document.querySelector(`#${id} input[type="radio"]:checked`)?.value || "";
}

/**
 * Escapa os caracteres especiais de expressão regular.
 *
 * @param {string} s Texto a escapar.
 * @returns {string}
 */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** As etapas de confirmação/teste só validam quando repetem exatamente a senha criada. */
function bindPassphraseMatch() {
  const first = document.getElementById("bk-pass");
  /**
   * Atualiza o padrão das confirmações da senha para exigir a senha criada.
   */
  const sync = () => {
    const pattern = first?.value ? escapeRegex(first.value) : "(?!)";
    ["bk-pass2", "bk-pass3"].forEach((id) => document.getElementById(id)?.setAttribute("pattern", pattern));
  };
  first?.addEventListener("input", sync);
  sync();
}

/** ADR-032: só vale como saída o que está fora deste navegador. Sem servidor que guardou, oferece o arquivo cifrado. */
function reportVaultResult(out, res, pass) {
  if (!out) return;
  out.hidden = false;
  if (!res.ok) {
    out.textContent = res.reason || "Não foi possível salvar o cofre.";
    return;
  }
  const locked = res.locked ? " Neste aparelho, a chave agora só sai com essa senha." : "";
  if (res.remote > 0) {
    out.textContent = `Cofre guardado em ${res.remote} servidor(es) de memória. Em outro aparelho, escolha “Já tenho conta” e digite sua Senha Soberana.${locked}`;
    return;
  }
  out.innerHTML = `<p>Nenhum servidor de memória guardou o cofre: por enquanto ele só está neste navegador.${locked}</p>
    <p>Baixe o arquivo cifrado e guarde fora do aparelho (pen drive, nuvem, e-mail para você mesmo). Só abre com a sua senha.</p>
    <button type="button" class="agora-btn agora-btn--primary" id="btn-backup-wizard-file">Baixar arquivo cifrado</button>`;
  document.getElementById("btn-backup-wizard-file")?.addEventListener("click", () => void downloadWrappedFile(pass));
}

/**
 * Baixa o arquivo cifrado da conta com a senha dada.
 *
 * @param {string} pass Senha do arquivo.
 */
async function downloadWrappedFile(pass) {
  try {
    const { exportAccountBundle } = await import("../identity/index.js");
    const jsonStr = await exportAccountBundle(pass, { asFile: true });
    share.downloadBlob(new Blob([jsonStr], { type: "application/json" }), `vox-soberania-${JSON.parse(jsonStr).routeId}.voxid`);
    share.showToast("Arquivo cifrado baixado. Guarde fora deste aparelho.");
  } catch (err) {
    share.showToast(`Não deu para gerar o arquivo: ${err?.message || err}`, "error");
  }
}

/**
 * Lê e-mail e senha anterior do assistente de backup.
 *
 * @returns {string|{email: string, prevPassphrase: string}}
 */
function readBackupVaultOptions() {
  const email = document.getElementById("bk-email")?.value || "";
  const prevPassphrase = document.getElementById("bk-prev-pass")?.value || "";
  return prevPassphrase ? { email, prevPassphrase } : email;
}

/**
 * Grava o cofre pelo assistente de backup e mostra o resultado.
 */
async function submitBackupWizard() {
  const btn = document.getElementById("btn-backup-wizard-save");
  const out = document.getElementById("bk-result");
  if (btn) btn.disabled = true;
  try {
    const { savePassphraseVault } = await import("../vault/index.js");
    const pass = document.getElementById("bk-pass")?.value || "";
    const res = await savePassphraseVault(pass, readBackupVaultOptions());
    reportVaultResult(out, res, pass);
    const toast = !res.ok ? "Falha no backup." : res.remote > 0 ? "Backup da identidade concluído." : "Cofre só neste navegador: baixe o arquivo cifrado.";
    share.showToast(toast, res.ok ? "info" : "error");
  } catch (err) {
    share.showToast(`Erro no backup: ${err?.message || err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Monta assistente de backup.
 *
 * @returns {Promise<void>}
 */
export async function showBackupWizard() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Backup da identidade"));
  renderBackupWizard(main);
  bindPassphraseMatch();
  const form = document.getElementById("form-backup-wizard");
  bindComposeStepper(form);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    void submitBackupWizard();
  });
}

/**
 * Mostra só a dica da opção de carteira escolhida.
 */
function syncWalletHints() {
  const mode = choiceValue("wg-mode") || "gerar";
  document.querySelectorAll("[data-wg-hint]").forEach((el) => { el.hidden = el.dataset.wgHint !== mode; });
}

/**
 * Aplica a opção de carteira do assistente (gerar, importar ou manter).
 *
 * @param {string} mode `gerar`, `importar` ou `manter`.
 */
async function applyWalletChoice(mode) {
  if (mode === "gerar") await wallet.generateNewWallet();
  if (mode === "importar") await wallet.saveJwk(JSON.parse(document.getElementById("wg-jwk")?.value.trim() || ""));
  if (mode !== "manter") await syncIdentity();
}

/**
 * Valida e aplica a chave Pix do assistente; vazia é permitida.
 *
 * @returns {boolean}
 */
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

/**
 * Monta assistente de carteira.
 *
 * @returns {Promise<void>}
 */
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
      await applyWalletChoice(choiceValue("wg-mode") || "manter");
      share.showToast("Carteira configurada.");
      location.hash = "#/wallet";
    } catch (err) {
      share.showToast(err instanceof SyntaxError ? "JSON da chave inválido." : `Erro: ${err?.message || err}`, "error");
    }
  });
}

/**
 * Copia texto do relatório local para a área de transferência (sem rede).
 * @param {string} text Conteúdo formatado.
 * @param {string} label Nome do formato para o aviso.
 */
async function copyLocalReport(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    share.showToast(`Relatório ${label} copiado localmente.`);
  } catch {
    share.showToast(`Não foi possível copiar o relatório ${label}.`, "error");
  }
}

/**
 * Baixa o relatório local como arquivo JSON ou Markdown (sem rede).
 * @param {string} text Conteúdo formatado.
 * @param {string} mime Tipo MIME.
 * @param {string} filename Nome do arquivo.
 */
function downloadLocalReport(text, mime, filename) {
  share.downloadBlob(new Blob([text], { type: mime }), filename);
  share.showToast(`Arquivo ${filename} baixado localmente.`);
}

/**
 * Conecta os eventos de entrada e exportação do guia de teste no celular (PM-73).
 * @param {object} initialState Estado inicial do roteiro.
 * @returns {{ getReport: () => object }}
 */
function bindMobileGuideControls(initialState) {
  let state = initialState;
  const preview = document.getElementById("mg-preview");
  const syncPreview = () => {
    const report = buildLocalFieldReport(state);
    if (preview) preview.textContent = formatLocalFieldReportMarkdown(report);
    return report;
  };
  document.getElementById("mg-device")?.addEventListener("input", (e) => {
    state = updateGuideEnv(state, { deviceModel: e.target?.value });
    syncPreview();
  });
  document.getElementById("mg-network")?.addEventListener("change", (e) => {
    state = updateGuideEnv(state, { networkType: e.target?.value });
    syncPreview();
  });
  document.querySelectorAll("[data-mobile-step]").forEach((el) => {
    el.addEventListener("change", () => {
      state = markGuideStep(state, el.dataset.mobileStep, Boolean(el.checked));
      syncPreview();
    });
  });
  syncPreview();
  return { getReport: () => buildLocalFieldReport(state) };
}

/**
 * Conecta botões de cópia/download e submit do guia de teste no celular.
 * @param {() => object} getReport Gera o relatório local atual.
 */
function bindMobileGuideExport(getReport) {
  document.getElementById("btn-mg-copy-json")?.addEventListener("click", () => void copyLocalReport(formatLocalFieldReportJson(getReport()), "JSON"));
  document.getElementById("btn-mg-copy-md")?.addEventListener("click", () => void copyLocalReport(formatLocalFieldReportMarkdown(getReport()), "Markdown"));
  document.getElementById("btn-mg-dl-json")?.addEventListener("click", () => downloadLocalReport(formatLocalFieldReportJson(getReport()), "application/json", "vox-teste-celular.json"));
  document.getElementById("btn-mg-dl-md")?.addEventListener("click", () => downloadLocalReport(formatLocalFieldReportMarkdown(getReport()), "text/markdown", "vox-teste-celular.md"));
}

/**
 * Monta assistente de teste de campo de 5 min no celular com relatório local (PM-73).
 * @param {object} [nav] Fonte opcional de ambiente (`navigator`) para testes.
 * @returns {Promise<{ getReport: () => object }>}
 */
export async function showMobileTestGuide(nav = globalThis.navigator) {
  const user = await getActiveUser();
  const env = collectMobileEnvironment(nav);
  const main = render.renderShell(makeShellProps(user, "network", "Teste de campo no celular"));
  renderMobileGuideWizard(main, { env, steps: MOBILE_GUIDE_STEPS });
  const form = document.getElementById("form-mobile-guide");
  bindComposeStepper(form);
  const controller = bindMobileGuideControls(createGuideState(env));
  bindMobileGuideExport(controller.getReport);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const preview = document.getElementById("mg-preview");
    if (preview) preview.textContent = formatLocalFieldReportMarkdown(controller.getReport());
    share.showToast("Relatório local atualizado.");
  });
  return controller;
}
