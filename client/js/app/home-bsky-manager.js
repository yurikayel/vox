/**
 * @file Gestão do feed "Redes externas" na Ágora: adicionar perfil da rede externa, importar quem a pessoa segue lá e
 * os botões de sugestão e de remoção. Só liga os tratadores no DOM já renderizado; a lista vem de `bsky-feed.js`.
 *
 * @module app/home-bsky-manager
 */
import * as bskyFeed from "../bsky-feed.js";
import * as share from "../share.js";

/**
 * Liga o botão de importar quem a pessoa segue no Bluesky.
 *
 * @param {Function} onRefresh Chamado depois de importar.
 */
function bindBskyImportButton(onRefresh) {
  const importBtn = document.getElementById("btn-import-bsky-follows");
  if (!importBtn || importBtn.dataset.wired) return;
  importBtn.dataset.wired = "1";
  importBtn.addEventListener("click", async () => {
    const input = document.getElementById("input-bsky-import-me");
    const val = input?.value?.trim();
    if (!val) return share.showToast("Digite seu @handle do Bluesky para importar.");
    importBtn.disabled = true;
    importBtn.textContent = "Importando...";
    try {
      const res = await bskyFeed.importBskyFollows(val, 50);
      share.showToast(`🎉 ${res.added} novos perfis importados com sucesso!`);
      if (input) input.value = "";
      if (onRefresh) onRefresh();
    } catch {
      share.showToast("Falha ao importar perfis do Bluesky.");
    } finally {
      importBtn.disabled = false;
      importBtn.textContent = "📥 Puxar quem eu sigo";
    }
  });
}

/**
 * Liga os botões de sugestão do Bluesky.
 *
 * @param {Function} onRefresh Chamado depois de mudar o estado.
 */
function bindBskyChipActions(onRefresh) {
  document.querySelectorAll(".btn-add-suggestion").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!btn.dataset.handle) return;
      bskyFeed.addBskySubscription(btn.dataset.handle);
      share.showToast(`Perfil @${btn.dataset.handle} adicionado! 🌐`);
      if (onRefresh) onRefresh();
    });
  });
  document.querySelectorAll(".btn-remove-bsky-sub").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      if (!btn.dataset.handle) return;
      bskyFeed.removeBskySubscription(btn.dataset.handle);
      share.showToast(`Perfil @${btn.dataset.handle} removido.`);
      if (onRefresh) onRefresh();
    });
  });
}

/**
 * Liga gestão de conta Bluesky no feed.
 *
 * @param {Function} onRefresh
 * @returns {void}
 */
export function attachBskyManagerHandlers(onRefresh) {
  const form = document.getElementById("form-add-bsky");
  if (form && !form.dataset.wired) {
    form.dataset.wired = "1";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("input-bsky-handle");
      const val = input?.value?.trim();
      if (!val) return;
      bskyFeed.addBskySubscription(val);
      share.showToast(`Perfil @${val.replace(/^@/, "")} adicionado ao Vox! 🌐`);
      if (input) input.value = "";
      if (onRefresh) onRefresh();
    });
  }
  bindBskyImportButton(onRefresh);
  bindBskyChipActions(onRefresh);
}
