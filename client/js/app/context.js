/** @file Shared shell helpers for app screens. */

import * as wallet from "../wallet.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";

export async function getActiveUser() {
  try {
    const w = await wallet.getAddress();
    if (w) return w;
  } catch {}
  return await localAccount.getRouteId();
}

export function makeShellProps(user, activeTab, title = "", subtitle = "", breadcrumb = null) {
  const settings = peers.getPeerSettings();
  const metrics = peers.getPeerMetrics();
  const rtcStatus = peers.getRtcStatus();
  return {
    title,
    subtitle,
    breadcrumb,
    walletAddress: user,
    activeTab,
    metrics,
    rtcStatus,
    settings,
  };
}

export function shareTopicUnlessQuarantined(opts = {}) {
  if (!mod.canEchoPost(opts.topicId)) {
    share.showToast(mod.QUARANTINE_HINT);
    return false;
  }
  return share.shareTopic(opts);
}

function quarantineButtonLabel(on) {
  return on ? "Tirar da quarentena local" : mod.QUARANTINE_ACTION_LABEL;
}

function setShareDisabled(postId, on) {
  document.querySelectorAll(".btn-share-post").forEach((el) => {
    if (el.dataset.id !== postId) return;
    el.disabled = on;
    el.setAttribute("aria-disabled", on ? "true" : "false");
  });
}

function syncQuarantineButton(btn, on) {
  const label = quarantineButtonLabel(on);
  btn.classList.toggle("is-quarantined", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", label);
  const span = btn.querySelector(".toolbar-overflow-label");
  if (span) span.textContent = label;
}

export function onQuarantinePostClick(btn) {
  const id = btn?.dataset?.id;
  if (!id) return;
  const hiding = !mod.isPostQuarantined(id);
  if (hiding) mod.quarantinePost(id);
  else mod.unquarantinePost(id);
  share.showToast(hiding ? mod.QUARANTINE_HINT : "Post visível de novo neste aparelho.");
  if (hiding) btn.closest("article.post")?.remove();
  setShareDisabled(id, hiding);
  syncQuarantineButton(btn, hiding);
}

let quarantineWired = false;

export function attachQuarantineHandlers() {
  if (quarantineWired) return;
  quarantineWired = true;
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-quarantine-post");
    if (!btn) return;
    e.preventDefault();
    onQuarantinePostClick(btn);
  });
}

export function attachPostShareHandlers() {
  document.querySelectorAll(".btn-share-post").forEach((btn) => {
    btn.addEventListener("click", () => {
      shareTopicUnlessQuarantined({
        title: btn.dataset.title || "Post no Vox",
        topicId: btn.dataset.id,
        author: btn.dataset.author || "",
        body: btn.dataset.body || "",
      });
    });
  });
}
