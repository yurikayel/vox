/** @file Local moderation actions, bundle export/import, and offline contribution attestation handlers. */

import * as mod from "../moderation.js";
import * as share from "../share.js";
import * as contributionAttestation from "../contribution-attestation.js";
import { buildLocalModerationTransparencyExport, formatModerationLogMarkdown } from "../moderation-log.js";

/**
 * Liga botões de desocultar e desilenciar autores na lista de moderação local.
 *
 * @param {Function} [onRefresh] Callback opcional para atualizar a tela após alteração.
 * @returns {void}
 */
export function bindModerationListButtons(onRefresh) {
  document.querySelectorAll(".btn-unblock-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.dataset.route;
      if (route) {
        mod.unblockUser(route);
        share.showToast("Autor desbloqueado.");
        if (onRefresh) onRefresh();
      }
    });
  });

  document.querySelectorAll(".btn-unmute-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.dataset.route;
      if (route) {
        mod.unmuteUser(route);
        share.showToast("Autor desilenciado.");
        if (onRefresh) onRefresh();
      }
    });
  });
}

async function handleExportModLog() {
  let localActions = [];
  try {
    const { getLocalPosts } = await import("../cache-node.js");
    localActions = await getLocalPosts({ type: "mod-action" });
  } catch {}
  const exported = buildLocalModerationTransparencyExport({
    localActions,
    blockedUsers: mod.getBlockedUsers(),
    mutedUsers: mod.getMutedUsers(),
  });
  const markdown = formatModerationLogMarkdown(exported, { generatedAt: exported.generatedAt });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  share.downloadBlob(blob, "vox-transparencia-moderacao.md");
  share.showToast("Relatório de transparência exportado (.md).");
}

/**
 * Liga ações de exportação e importação de regras locais de moderação (arquivo JSON) e relatório de transparência.
 *
 * @param {Function} [onRefresh] Callback opcional para atualizar a tela após importação.
 * @returns {void}
 */
export function bindModerationExportImport(onRefresh) {
  document.getElementById("btn-export-moderation")?.addEventListener("click", () => {
    const bundle = mod.exportModerationBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    share.downloadBlob(blob, "vox-moderacao.json");
    share.showToast("Regras de moderação exportadas!");
  });

  document.getElementById("btn-export-mod-log")?.addEventListener("click", () => {
    handleExportModLog();
  });

  const fileImportMod = document.getElementById("file-import-moderation");
  fileImportMod?.addEventListener("change", async () => {
    const file = fileImportMod.files?.[0];
    if (!file) return;
    try {
      const ok = mod.importModerationBundle(await file.text());
      share.showToast(ok ? "Regras de moderação importadas com sucesso!" : "Arquivo de moderação inválido.", ok ? "info" : "error");
      if (ok && onRefresh) onRefresh();
    } catch (err) {
      share.showToast(`Erro ao importar moderação: ${err.message}`, "error");
    }
  });
}

/**
 * Liga botão de exportar comprovante assinado de contribuição (ADR-001) para download offline.
 *
 * @returns {void}
 */
export function bindContributionAttestationButton() {
  const btnAttestation = document.getElementById("btn-export-contribution-attestation");
  if (!btnAttestation) return;
  btnAttestation.addEventListener("click", async () => {
    btnAttestation.disabled = true;
    try {
      const out = await contributionAttestation.buildSignedContributionAttestation();
      if (!out.ok) {
        share.showToast(`Aguarde ${Math.ceil((out.retryAfterMs || 0) / 1000)}s para exportar de novo.`, "error");
        return;
      }
      const signed = out.signed;
      const blob = new Blob([JSON.stringify(signed, null, 2)], { type: "application/json" });
      share.downloadBlob(blob, contributionAttestation.attestationDownloadFilename(signed.author, signed.ts));
      share.showToast("Comprovante baixado — guarde offline; nada foi enviado à rede.");
    } catch (err) {
      share.showToast(`Erro ao gerar comprovante: ${err.message}`, "error");
    } finally {
      btnAttestation.disabled = false;
    }
  });
}
