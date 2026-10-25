/** @file IG-style ⋯ sheet for feed photo posts (#post-more-sheet). */

import * as share from "../share.js";

const SHEET_ID = "post-more-sheet";

function ensurePostMoreSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "post-more-sheet modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Mais opções da publicação");
  root.innerHTML = `
    <div class="post-more-sheet-panel" role="document">
      <button type="button" class="post-more-sheet-item post-more-sheet-item--destructive" data-action="report">Denunciar</button>
      <button type="button" class="post-more-sheet-item" data-action="not-interested">Não tenho interesse</button>
      <button type="button" class="post-more-sheet-item" data-action="about-account">Sobre esta conta</button>
      <button type="button" class="post-more-sheet-item" data-action="goto-post">Ir para a publicação</button>
      <button type="button" class="post-more-sheet-item" data-action="share">Compartilhar…</button>
      <button type="button" class="post-more-sheet-item" data-action="copy-link">Copiar link</button>
      <button type="button" class="post-more-sheet-item" data-action="embed">Incorporar</button>
      <button type="button" class="post-more-sheet-item post-more-sheet-cancel" data-action="cancel">Cancelar</button>
    </div>`;
  document.body.appendChild(root);
  return root;
}

let activeContext = null;
let wired = false;

function postPermalink(topicId) {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://yurikayel.github.io/vox";
  const path =
    typeof window !== "undefined" && window.location?.pathname ? window.location.pathname : "/vox/";
  return `${origin}${path}#/t/${encodeURIComponent(topicId)}`;
}

export function closePostMoreMenu() {
  const sheet = document.getElementById(SHEET_ID);
  if (!sheet) return;
  sheet.hidden = true;
  activeContext = null;
  document.body.classList.remove("post-more-sheet-open");
}

export function openPostMoreMenu(ctx) {
  if (!ctx?.postId) return;
  ensurePostMoreSheet();
  activeContext = { ...ctx };
  const sheet = document.getElementById(SHEET_ID);
  sheet.hidden = false;
  document.body.classList.add("post-more-sheet-open");
  sheet.querySelector(".post-more-sheet-item")?.focus();
}

async function onSheetAction(action) {
  const ctx = activeContext;
  closePostMoreMenu();
  if (!ctx) return;

  if (action === "report") {
    share.showToast("Denúncia registrada localmente — em breve na malha.");
    return;
  }
  if (action === "not-interested") {
    share.showToast("Mostraremos menos publicações como esta.");
    return;
  }
  if (action === "about-account" && ctx.authorRoute) {
    window.location.hash = `#/u/${encodeURIComponent(ctx.authorRoute)}`;
    return;
  }
  if (action === "goto-post") {
    window.location.hash = `#/t/${encodeURIComponent(ctx.postId)}`;
    return;
  }
  if (action === "share") {
    await share.shareTopic({ title: ctx.title || "Post no Vox", topicId: ctx.postId });
    return;
  }
  if (action === "copy-link") {
    const url = postPermalink(ctx.postId);
    try {
      await navigator.clipboard.writeText(url);
      share.showToast("Link copiado!");
    } catch {
      share.showToast("Não foi possível copiar o link.", "error");
    }
    return;
  }
  if (action === "embed") {
    share.showToast("Incorporar — em breve.");
  }
}

/** Wire sheet + feed ⋯ buttons (idempotent). */
export function attachPostMoreMenuHandlers() {
  ensurePostMoreSheet();
  if (!wired) {
    wired = true;
    document.addEventListener("click", (e) => {
      const openBtn = e.target.closest(".btn-post-more-menu");
      if (openBtn) {
        e.preventDefault();
        e.stopPropagation();
        openPostMoreMenu({
          postId: openBtn.dataset.postId || "",
          authorRoute: openBtn.dataset.authorRoute || "",
          title: openBtn.dataset.title || "",
        });
        return;
      }

      const sheet = e.target.closest(`#${SHEET_ID}`);
      if (!sheet || sheet.hidden) return;
      if (e.target === sheet) {
        e.preventDefault();
        closePostMoreMenu();
        return;
      }
      const item = e.target.closest(".post-more-sheet-item");
      if (!item) return;
      e.preventDefault();
      const action = item.dataset.action || "cancel";
      if (action === "cancel") {
        closePostMoreMenu();
        return;
      }
      void onSheetAction(action);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const sheet = document.getElementById(SHEET_ID);
      if (sheet && !sheet.hidden) {
        e.preventDefault();
        closePostMoreMenu();
      }
    });
  }
}
