/** @file PM-72 — seção "Seus posts num arquivo" em Sua rede: baixar os próprios posts e restaurar de um arquivo. */

import * as ownPosts from "../own-posts.js";
import * as share from "../share.js";

/**
 * Seção das configurações.
 * @returns {string} HTML da seção.
 */
export function renderOwnPostsSection() {
  return `<div class="card own-posts-settings" style="margin-top:1rem;">
    <h3>Seus posts num arquivo</h3>
    <p class="desc">Seus posts, assinados e com fotos, áudios e vídeos, num arquivo que é seu. Não precisa de senha:
      o que você publicou já é público na rede. Para trazer de volta, entre na mesma conta e escolha o arquivo.</p>
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
      <button type="button" class="agora-btn agora-btn--secondary" id="btn-own-posts-export">Baixar meus posts</button>
      <label class="agora-btn agora-btn--secondary" for="own-posts-import">Restaurar de um arquivo</label>
      <input type="file" id="own-posts-import" accept=".json,application/json" hidden />
    </div>
  </div>`;
}

async function exportNow(btn) {
  btn.disabled = true;
  try {
    const file = await ownPosts.exportOwnPosts();
    if (!file.count) {
      share.showToast("Você ainda não tem posts neste aparelho.");
      return;
    }
    share.downloadBlob(new Blob([file.text], { type: "application/json" }), file.name);
    share.showToast(`${file.count} post(s) no arquivo ${file.name}.`);
  } catch (err) {
    share.showToast(`Não deu para montar o arquivo: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

async function importFrom(input, onDone) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const { restored, skipped } = await ownPosts.importOwnPosts(await file.text());
    const extra = skipped ? ` ${skipped} já estavam aqui ou não conferiram e ficaram de fora.` : "";
    share.showToast(`${restored} post(s) de volta.${extra}`);
    onDone?.();
  } catch (err) {
    share.showToast(err.message, "error");
  }
}

/**
 * Liga os botões depois que a seção foi desenhada.
 * @param {() => void} [onRestored] chamado depois de restaurar
 */
export function bindOwnPostsSection(onRestored) {
  const btn = document.getElementById("btn-own-posts-export");
  btn?.addEventListener("click", () => void exportNow(btn));
  const input = document.getElementById("own-posts-import");
  input?.addEventListener("change", () => void importFrom(input, onRestored));
}
