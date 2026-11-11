/** @file Menu ⋯ (sheet) para publicações com foto no feed (#post-more-sheet). */

import * as share from "../share.js";
import { openQrUrlSheet } from "../qr-url.js";
import * as mod from "../moderation.js";
import {
  refreshSheetExtras,
  toggleSaveFromMenu,
  republicarFromMenu,
  apoiarFromMenu,
  marcarFromMenu,
} from "./post-more-actions.js";

const SHEET_ID = "post-more-sheet";

/** Itens do menu ⋯ da publicação, na ordem em que aparecem. */
const SHEET_ITEMS_HTML = `
  <button type="button" class="post-more-sheet-item post-more-sheet-item--destructive" data-action="report">Denunciar</button>
  <button type="button" class="post-more-sheet-item" data-action="mediation">Pedir mediação</button>
  <button type="button" class="post-more-sheet-item" data-action="not-interested">Não tenho interesse</button>
  <button type="button" class="post-more-sheet-item" data-action="about-account">Sobre esta conta</button>
  <button type="button" class="post-more-sheet-item" data-action="goto-post">Ir para a publicação</button>
  <button type="button" class="post-more-sheet-item" data-action="repost">Republicar</button>
  <button type="button" class="post-more-sheet-item" data-action="save">Salvar</button>
  <button type="button" class="post-more-sheet-item" data-action="zap" hidden>Apoiar</button>
  <button type="button" class="post-more-sheet-item" data-action="tag" hidden>Marcar pessoas</button>
  <button type="button" class="post-more-sheet-item" data-action="share">Compartilhar…</button>
  <button type="button" class="post-more-sheet-item" data-action="copy-link">Copiar link</button>
  <button type="button" class="post-more-sheet-item" data-action="qr">QR deste link</button>
  <button type="button" class="post-more-sheet-item" data-action="embed">Incorporar</button>
  <button type="button" class="post-more-sheet-item post-more-sheet-cancel" data-action="cancel">Cancelar</button>
`;

function ensurePostMoreSheet() {
  let root = document.getElementById(SHEET_ID);
  if (root) return root;
  root = document.createElement("div");
  root.id = SHEET_ID;
  root.className = "post-more-sheet modal-overlay modal-sheet";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Mais opções da publicação");
  root.innerHTML = `<div class="post-more-sheet-panel" role="document">${SHEET_ITEMS_HTML}</div>`;
  document.body.appendChild(root);
  return root;
}

let activeContext = null;
let lastOpener = null;
let wired = false;

function setSheetOpen(sheet, open) {
  if (open) {
    sheet.hidden = false;
    sheet.classList.add("is-open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("post-more-sheet-open");
  } else {
    sheet.hidden = true;
    sheet.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("post-more-sheet-open");
  }
}

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
  if (!sheet?.classList.contains("is-open")) return;
  setSheetOpen(sheet, false);
  activeContext = null;
  const opener = lastOpener;
  lastOpener = null;
  opener?.focus?.();
}

export function openPostMoreMenu(ctx, openerEl) {
  if (!ctx?.postId) return;
  const sheet = ensurePostMoreSheet();
  activeContext = { ...ctx };
  lastOpener = openerEl instanceof HTMLElement ? openerEl : null;
  refreshSheetExtras(sheet, activeContext);
  setSheetOpen(sheet, true);
  sheet.querySelector(".post-more-sheet-item")?.focus();
}

async function shareSheetPost(ctx) {
  if (!mod.canEchoPost(ctx.postId)) {
    share.showToast(mod.QUARANTINE_HINT);
    return;
  }
  await share.shareTopic({ title: ctx.title || "Post no Vox", topicId: ctx.postId });
}

async function onSocialSheetAction(action, ctx) {
  if (action === "save") {
    toggleSaveFromMenu(ctx.postId);
    return true;
  }
  if (action === "repost") {
    await republicarFromMenu(ctx);
    return true;
  }
  if (action === "zap") {
    apoiarFromMenu(ctx);
    return true;
  }
  if (action === "tag") {
    marcarFromMenu(ctx);
    return true;
  }
  return false;
}

async function copyPostLink(postId) {
  const url = postPermalink(postId);
  try {
    await navigator.clipboard.writeText(url);
    share.showToast("Link copiado!");
  } catch {
    share.showToast("Não foi possível copiar o link.", "error");
  }
}

function handleQrAction(ctx) {
  if (!mod.canEchoPost(ctx.postId)) {
    share.showToast(mod.QUARANTINE_HINT);
    return;
  }
  openQrUrlSheet(share.topicShareUrl(ctx.postId));
}

async function onNavigationOrShareAction(action, ctx) {
  if (action === "about-account" && ctx.authorRoute) {
    window.location.hash = `#/u/${encodeURIComponent(ctx.authorRoute)}`;
    return true;
  }
  if (action === "goto-post") {
    window.location.hash = `#/t/${encodeURIComponent(ctx.postId)}`;
    return true;
  }
  if (action === "share") {
    await shareSheetPost(ctx);
    return true;
  }
  if (action === "copy-link") {
    await copyPostLink(ctx.postId);
    return true;
  }
  if (action === "qr") {
    handleQrAction(ctx);
    return true;
  }
  return false;
}

const SENT = new Set(["delivered", "queued-relay", "pending-retry"]);

/** PM-83 lote E — com a flag, o pedido vai ao moderador natural de cada parte. Devolve true se mandou. */
async function mediateByNaturalModerators(self, request) {
  const { naturalModLabOn } = await import("../app/natural-mod-flow.js");
  if (!self || !naturalModLabOn()) return false;
  const { requestMediation } = await import("../app/mediation-dm.js");
  const sent = (await requestMediation(self, request).catch(() => [])).filter((r) => SENT.has(r.status));
  if (!sent.length) return false;
  share.showToast(`Pedido de mediação enviado a ${sent.length === 1 ? "1 moderador natural" : `${sent.length} moderadores naturais`}, por mensagem cifrada. Nada foi arquivado.`);
  return true;
}

/** Lote 3 — leva à conversa com a moderação da comunidade do post, com o cartão do post. */
async function openMediation(ctx) {
  const [{ resolveModeratorRoute }, { buildMediationDmHash }, { getActiveUser }] = await Promise.all([
    import("../app/report-flow.js"), import("../report.js"), import("../app/context.js"),
  ]);
  const { communityId, moderator } = await resolveModeratorRoute(ctx.postId, ctx.communityId || "");
  const self = await getActiveUser().catch(() => "");
  if (await mediateByNaturalModerators(self, { postId: ctx.postId, communityId, target: ctx.authorRoute || "" })) return;
  if (!moderator || moderator === self) {
    share.showToast(moderator ? "Você modera esta comunidade." : "Esta publicação não tem moderação conhecida no seu aparelho.");
    return;
  }
  location.hash = buildMediationDmHash(moderator, { postId: ctx.postId, communityId });
}

async function onSheetAction(action) {
  const ctx = activeContext;
  closePostMoreMenu();
  if (!ctx) return;
  if (await onSocialSheetAction(action, ctx)) return;
  if (await onNavigationOrShareAction(action, ctx)) return;

  if (action === "report") {
    const { openReportFlow } = await import("../app/report-flow.js");
    openReportFlow(ctx);
    return;
  }
  if (action === "mediation") {
    await openMediation(ctx);
    return;
  }
  if (action === "not-interested") share.showToast("Mostraremos menos publicações como esta.");
  if (action === "embed") share.showToast("Incorporar — em breve.");
}

function handlePostMoreMenuTriggerClick(openBtn, e) {
  e.preventDefault();
  e.stopPropagation();
  openPostMoreMenu(
    {
      postId: openBtn.dataset.postId || "",
      authorRoute: openBtn.dataset.authorRoute || "",
      title: openBtn.dataset.title || "",
      isOwn: openBtn.dataset.isOwn === "1",
      hasImage: openBtn.dataset.hasImage === "1",
      pix: openBtn.dataset.pix || "",
    },
    openBtn,
  );
}

function handlePostMoreMenuDocumentClick(e) {
  const openBtn = e.target.closest(".btn-post-more-menu");
  if (openBtn) return handlePostMoreMenuTriggerClick(openBtn, e);

  const sheet = e.target.closest(`#${SHEET_ID}`);
  if (!sheet?.classList.contains("is-open")) return;
  if (e.target === sheet) {
    e.preventDefault();
    return closePostMoreMenu();
  }
  const item = e.target.closest(".post-more-sheet-item");
  if (!item) return;
  e.preventDefault();
  const action = item.dataset.action || "cancel";
  if (action === "cancel") return closePostMoreMenu();
  void onSheetAction(action);
}

/** Wire sheet + feed ⋯ buttons (idempotent). Sheet DOM is created on first open. */
export function attachPostMoreMenuHandlers() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", handlePostMoreMenuDocumentClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById(SHEET_ID)?.classList.contains("is-open")) {
      e.preventDefault();
      closePostMoreMenu();
    }
  });
}
