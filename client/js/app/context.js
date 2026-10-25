/** @file Shared shell helpers for app screens. */

import * as wallet from "../wallet.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";

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

export function attachPostShareHandlers() {
  document.querySelectorAll(".btn-share-post").forEach((btn) => {
    btn.addEventListener("click", () => {
      share.shareTopic({
        title: btn.dataset.title || "Post no Vox",
        topicId: btn.dataset.id,
      });
    });
  });
}
