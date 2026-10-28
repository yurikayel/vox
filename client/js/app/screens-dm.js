/** @file Direct messages list and thread (DM v2). */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as dmMsg from "../dm-messenger.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";

let activeReplyDraft = null;
let pendingContextDraft = null;
let activeMediaDraft = "";

async function applyBubbleReaction(peerAddress, actorAddress, targetId, emoji) {
  const msgs = await cacheNode.getDmMessages(peerAddress);
  const target = msgs.find((m) => m.id === targetId);
  if (!target) return false;
  target.reactions = dmMsg.toggleReactionMap(target.reactions, emoji, actorAddress);
  await cacheNode.saveDmMessage(target);
  return true;
}

async function applyReadReceipt(peerAddress, upToTs) {
  const msgs = await cacheNode.getDmMessages(peerAddress);
  let updated = false;
  for (const m of msgs) {
    if (m.from !== peerAddress && m.status !== "read" && (Number(m.ts) || 0) <= upToTs) {
      m.status = "read";
      await cacheNode.saveDmMessage(m);
      updated = true;
    }
  }
  return updated;
}

async function ingestDecryptedEnvelope(env, rawText) {
  const parsed = dmMsg.parseDmPayload(rawText);
  if (parsed.kind === "react") {
    return applyBubbleReaction(env.from, env.from, parsed.targetId, parsed.emoji);
  }
  if (parsed.kind === "read") {
    return applyReadReceipt(env.from, parsed.upToTs);
  }
  await cacheNode.saveDmMessage({
    id: env.id,
    peerAddress: env.from,
    from: env.from,
    to: env.to,
    text: parsed.text,
    replyTo: parsed.replyTo,
    contextCard: parsed.contextCard,
    mediaDataUrl: parsed.mediaDataUrl,
    ts: env.ts || Date.now(),
    status: "received",
  });
  return true;
}

export async function pollInboxMessages(user) {
  if (!user) return 0;
  try {
    const sealedList = await inbox.pullMine(user);
    let count = 0;
    for (const env of sealedList) {
      try {
        const rawText = await cryptoDm.open(env);
        await ingestDecryptedEnvelope(env, rawText);
        await inbox.deleteSealed(user, env.id);
        count++;
      } catch {}
    }
    return count;
  } catch {
    return 0;
  }
}

async function dispatchSealedEnvelope(peerAddress, envelope) {
  if (peers.sendDirectMessageTransport(peerAddress, envelope) === "rtc") {
    return "delivered";
  }
  try {
    await inbox.pushSealed(peerAddress, envelope);
    return "queued-relay";
  } catch {
    return "pending-retry";
  }
}

function renderAndBindDmList(main, convs, user, searchQuery = "") {
  render.renderDmList(main, convs, user, {
    contactList: contacts.listContacts(),
    searchQuery,
  });
  bindDmListControls(main, convs, user);
}

function bindDmListControls(main, convs, user) {
  document.getElementById("btn-copy-my-dm-link")?.addEventListener("click", () => {
    const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(user)}`;
    navigator.clipboard.writeText(link);
    share.showToast("Link copiado! Manda para quem quiser te escrever.");
  });

  document.getElementById("form-new-dm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = document.getElementById("dm-peer-input")?.value.trim();
    const peer = peopleIndex.parseConnectTarget(raw) || raw;
    if (peer) location.hash = `#/dm/${encodeURIComponent(peer)}`;
  });

  document.getElementById("btn-pull-inbox")?.addEventListener("click", async () => {
    const pulled = await pollInboxMessages(user);
    share.showToast(pulled > 0 ? `${pulled} nova(s) mensagem(ns)!` : "Inbox verificado: sem novas mensagens.");
    showDmList();
  });

  bindDmListSearchAndPins(main, convs, user);
}

function bindDmListSearchAndPins(main, convs, user) {
  const searchInput = document.getElementById("dm-search-input");
  searchInput?.addEventListener("input", () => {
    const val = searchInput.value;
    const pos = searchInput.selectionStart ?? val.length;
    renderAndBindDmList(main, convs, user, val);
    const nextInput = document.getElementById("dm-search-input");
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(pos, pos);
    }
  });

  main.querySelectorAll(".btn-dm-pin").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const res = dmMsg.togglePinPeer(btn.dataset.peer);
      if (res.reason === "limit" || res.limitReached) {
        share.showToast("Limite de 3 conversas fixadas atingido.", "error");
        return;
      }
      renderAndBindDmList(main, convs, user, searchInput?.value || "");
    });
  });
}

export async function showDmList() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Mensagens"));
  if (!user) {
    main.innerHTML = `<div class="card"><h2>Mensagens Diretas</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }
  await ensureOnboardingSideEffects(user);
  await pollInboxMessages(user);
  const convs = await cacheNode.getDmConversations();
  renderAndBindDmList(main, convs, user, "");
}

async function sealAndPersistOutgoingDm(user, peerAddress, peerDmPub, text) {
  const wirePayload = dmMsg.serializeDmPayload({
    text,
    replyTo: activeReplyDraft,
    contextCard: pendingContextDraft,
    mediaDataUrl: activeMediaDraft,
  });
  const envelope = await cryptoDm.seal(peerDmPub, wirePayload, { from: user, to: peerAddress });
  const status = await dispatchSealedEnvelope(peerAddress, envelope);
  await cacheNode.saveDmMessage({
    id: envelope.id,
    peerAddress,
    from: user,
    to: peerAddress,
    text,
    replyTo: activeReplyDraft,
    contextCard: pendingContextDraft,
    mediaDataUrl: activeMediaDraft,
    ts: envelope.ts,
    status,
  });
}

export async function handleSendDmSubmit(user, peerAddress, peerDmPub) {
  const input = document.getElementById("dm-message-input");
  const rawText = input?.value.trim() || "";
  const fallback = pendingContextDraft ? `💬 ${pendingContextDraft.title}` : activeMediaDraft ? "📷 Foto" : "";
  const text = rawText || fallback;
  if (!text) return;
  const btn = document.getElementById("btn-send-dm");
  if (btn) btn.disabled = true;

  try {
    await sealAndPersistOutgoingDm(user, peerAddress, peerDmPub, text);
    activeReplyDraft = null;
    pendingContextDraft = null;
    activeMediaDraft = "";
    if (input) input.value = "";
    showDmThread(peerAddress);
  } catch (err) {
    share.showToast(`Erro ao cifrar: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

async function handleToggleBubbleReaction(user, peerAddress, peerDmPub, msgId, emoji) {
  if (!msgId || !emoji) return;
  await applyBubbleReaction(peerAddress, user, msgId, emoji);
  if (peerDmPub) {
    try {
      const wire = dmMsg.serializeDmReaction({ targetId: msgId, emoji });
      const env = await cryptoDm.seal(peerDmPub, wire, { from: user, to: peerAddress });
      await dispatchSealedEnvelope(peerAddress, env);
    } catch {}
  }
  showDmThread(peerAddress);
}

function compressDmImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const scale = Math.min(1, 380 / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.56));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function bindDmMediaAttachmentEvents() {
  const fileInput = document.getElementById("dm-media-input");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressDmImageFile(file);
      activeMediaDraft = dmMsg.normalizeMediaDataUrl(dataUrl);
      if (!activeMediaDraft) throw new Error("Imagem excede o limite de 24 KB do envelope E2E.");
      const bar = document.getElementById("dm-media-draft-bar");
      if (bar) bar.hidden = false;
    } catch (err) {
      share.showToast(err.message || "Falha ao comprimir foto.", "error");
    }
  });
  document.getElementById("btn-cancel-dm-media")?.addEventListener("click", () => {
    activeMediaDraft = "";
    const bar = document.getElementById("dm-media-draft-bar");
    if (bar) bar.hidden = true;
  });
}

function bindDmThreadDraftAndCardActions(main) {
  main.querySelectorAll(".btn-dm-reply-msg").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeReplyDraft = { id: btn.dataset.msgId, author: btn.dataset.msgAuthor || "", snippet: btn.dataset.msgSnippet || "" };
      const bar = document.getElementById("dm-reply-draft-bar");
      const txt = document.getElementById("dm-reply-draft-text");
      if (txt) txt.textContent = `${activeReplyDraft.author}: "${activeReplyDraft.snippet}"`;
      if (bar) bar.hidden = false;
      document.getElementById("dm-message-input")?.focus();
    });
  });
  document.getElementById("btn-cancel-dm-reply")?.addEventListener("click", () => {
    activeReplyDraft = null;
    const bar = document.getElementById("dm-reply-draft-bar");
    if (bar) bar.hidden = true;
  });
  document.getElementById("btn-clear-dm-context")?.addEventListener("click", () => {
    pendingContextDraft = null;
    document.getElementById("dm-context-draft-bar")?.remove();
  });
  bindDmMediaAttachmentEvents();
}

function bindDmThreadBubbleActions(main, user, peerAddress, peerDmPub) {
  main.querySelectorAll(".btn-dm-copy-pix").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pix = btn.dataset.pix || "";
      if (!pix) return;
      navigator.clipboard.writeText(pix);
      share.showToast("Chave Pix copiada!");
    });
  });

  main.querySelectorAll(".btn-dm-react-pick, .dm-reaction-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleToggleBubbleReaction(user, peerAddress, peerDmPub, btn.dataset.msgId, btn.dataset.emoji);
    });
  });
}

function consumeHashContextForThread(peerAddress) {
  const fromHash = dmMsg.parseDmContextFromHash(location.hash);
  if (!fromHash) return;
  pendingContextDraft = fromHash;
  if (typeof history !== "undefined" && typeof history.replaceState === "function") {
    history.replaceState(null, "", `#/dm/${encodeURIComponent(peerAddress)}`);
  }
}

function bindDmThreadFormEvents(main, user, peerAddress, peerDmPub) {
  document.getElementById("btn-save-manual-dmpub")?.addEventListener("click", () => {
    try {
      const parsed = JSON.parse(document.getElementById("input-manual-dmpub")?.value.trim());
      gql.cacheUserDmPub(peerAddress, parsed);
      share.showToast("Chave Dm-Pub salva localmente!");
      showDmThread(peerAddress);
    } catch {
      share.showToast("JSON inválido.", "error");
    }
  });

  bindDmThreadDraftAndCardActions(main);
  bindDmThreadBubbleActions(main, user, peerAddress, peerDmPub);

  if (peerDmPub) {
    document.getElementById("form-send-dm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSendDmSubmit(user, peerAddress, peerDmPub);
    });
  }
}

export async function showDmThread(peerAddress) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Conversa"));
  if (!user) {
    main.innerHTML = `<div class="card"><h2>Conversa Direta</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }
  await ensureOnboardingSideEffects(user);
  if (welcomeProfile.isWelcomeRouteId(peerAddress)) welcomeProfile.markWelcomeIntroSeen();
  dmMsg.markThreadRead(peerAddress);
  consumeHashContextForThread(peerAddress);
  await pollInboxMessages(user);

  const messages = await cacheNode.getDmMessages(peerAddress);
  const isRtcOnline = peers.isAddressConnectedRtc(peerAddress);
  const peerDmPub =
    gql.getCachedUserDmPub(peerAddress) ||
    peers.getPeerDmPub(peerAddress) ||
    (await gql.fetchUserDmPub(peerAddress));

  render.renderDmThread(main, peerAddress, messages, user, {
    isRtcOnline,
    hasDmPub: Boolean(peerDmPub),
    pendingContextCard: pendingContextDraft,
  });

  const c = document.getElementById("dm-thread-container");
  if (c) c.scrollTop = c.scrollHeight;
  bindDmThreadFormEvents(main, user, peerAddress, peerDmPub);
}

export function initDmListeners() {
  peers.onDirectMessage(async (envelope) => {
    const user = await getActiveUser();
    if (!user || envelope.to !== user) return;
    try {
      const rawText = await cryptoDm.open(envelope);
      await ingestDecryptedEnvelope(envelope, rawText);
      const cur = parseRoute();
      if (cur.name === "dm-thread" && cur.address === envelope.from) {
        showDmThread(envelope.from);
      } else {
        share.showToast(`Nova mensagem de ${envelope.from.slice(0, 8)}…`);
      }
    } catch {}
  });
}
