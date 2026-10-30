/** @file Compose flows and inline reply UI. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as communitySeed from "../community-seed-checklist.js";
import { parseChatTranscriptToMarkdown } from "../chat-bridge.js";
import { createCivicNotaryRecord } from "../perma-notary.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showComposeCommunity() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Comunidade"));
  render.renderComposeCommunity(main);

  let photoDataUrl = "";
  const fileInput = document.getElementById("comm-photo-file");
  const urlInput = document.getElementById("comm-photo-url");
  const previewEl = document.getElementById("comm-photo-preview");
  const titleInput = document.getElementById("comm-title");

  const updatePreview = (src, initial = "C") => {
    if (!previewEl) return;
    if (src) {
      previewEl.innerHTML = `<img class="community-avatar-img" src="${src}" alt="Preview" style="width:100%; height:100%; object-fit:cover; border-radius:14px;" />`;
    } else {
      previewEl.innerHTML = `<div class="community-avatar-fallback" style="background:var(--brand-chrome); font-size:1.8rem; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:#fff; font-weight:800; border-radius:14px;">${initial}</div>`;
    }
  };

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          photoDataUrl = reader.result;
          updatePreview(photoDataUrl);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener("input", () => {
      const url = urlInput.value.trim();
      if (url) {
        photoDataUrl = url;
        updatePreview(url);
      } else if (!fileInput?.files?.[0]) {
        photoDataUrl = "";
        updatePreview("", (titleInput?.value || "C").slice(0, 1).toUpperCase());
      }
    });
  }

  if (titleInput) {
    titleInput.addEventListener("input", () => {
      if (!photoDataUrl) {
        updatePreview("", (titleInput.value || "C").slice(0, 1).toUpperCase());
      }
    });
  }

  const form = document.getElementById("form-compose-community");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-comm");
      const id = document.getElementById("comm-id")?.value.trim().toLowerCase();
      const title = document.getElementById("comm-title")?.value.trim();
      const category = document.getElementById("comm-category")?.value.trim() || "Geral";
      const desc = document.getElementById("comm-desc")?.value.trim();
      const visibility = document.getElementById("comm-type")?.value || "open";
      const image = photoDataUrl || urlInput?.value.trim() || "";

      btn.disabled = true;
      btn.textContent = "Assinando…";
      try {
        const signed = await localAccount.signPayload({
          id: "c_" + id,
          type: "community",
          communityId: id,
          title,
          category,
          description: desc,
          image,
          avatar: image,
          visibility,
          language: "Português",
          createdAt: Date.now(),
        });
        await cacheNode.saveLocalPost(signed);
        peers.broadcastGossip(signed);

        if (wallet.hasWallet()) {
          try {
            const tags = upload.buildTags("community", {
              "Community-Id": id,
              Title: title,
              Category: category,
              Description: desc,
              Image: image,
            });
            await upload.postData({ id, title, category, description: desc, image }, tags);
          } catch {}
        }

        communitySeed.markSeedPending(id);
        share.showToast("Comunidade criada na rede!");
        location.hash = `#/c/${encodeURIComponent(id)}?seed=1`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Comunidade";
      }
    });
  }
}

async function buildNotarizedBadge(parsed, title, user) {
  const notary = await createCivicNotaryRecord({
    title,
    bodyText: parsed.markdown,
    author: user?.routeId || "comunidade",
    witnesses: parsed.participants,
  });
  return `\n\n> 🏛️ **Cartório Cívico Arweave** • Prova de Existência Imutável\n> Hash SHA-256: \`${notary.documentHash}\`\n> Testemunhas registradas: ${notary.witnesses.join(", ") || "Assembleia"}`;
}

async function applyTranscriptToComposer(shouldNotarize, user) {
  const raw = document.getElementById("chat-transcript-input")?.value || "";
  const parsed = parseChatTranscriptToMarkdown(raw);
  if (!parsed.messageCount) {
    share.showToast("Cole uma conversa do Slack ou Discord para converter.", "error");
    return;
  }
  const bodyEl = document.getElementById("topic-body");
  const titleEl = document.getElementById("topic-title");
  let content = parsed.markdown;
  if (shouldNotarize) {
    const title = titleEl?.value.trim() || parsed.suggestedTitle || "Ata Comunitária";
    const badge = await buildNotarizedBadge(parsed, title, user);
    content = `${parsed.markdown}${badge}`;
  }
  if (bodyEl) {
    bodyEl.value = bodyEl.value.trim() ? `${bodyEl.value.trim()}\n\n${content}` : content;
  }
  if (titleEl && !titleEl.value.trim() && parsed.suggestedTitle) {
    titleEl.value = parsed.suggestedTitle.slice(0, 120);
  }
  share.showToast(shouldNotarize ? "Ata formatada e selada com Cartório Cívico!" : `Ata formatada (${parsed.messageCount} intervenções)!`);
}

function bindChatTranscriptImportHandler(user) {
  document.getElementById("btn-convert-chat-transcript")?.addEventListener("click", () => applyTranscriptToComposer(false, user));
  document.getElementById("btn-convert-and-notarize")?.addEventListener("click", () => applyTranscriptToComposer(true, user));
}

export async function showComposeTopic(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Novo Post"));
  render.renderComposeTopic(main, communityId);
  bindChatTranscriptImportHandler(user);

  try {
    const quotePrefill = sessionStorage.getItem("vox_quote_prefill");
    if (quotePrefill) {
      sessionStorage.removeItem("vox_quote_prefill");
      const bodyEl = document.getElementById("topic-body");
      if (bodyEl) bodyEl.value = quotePrefill;
      const titleEl = document.getElementById("topic-title");
      if (titleEl && !titleEl.value) titleEl.value = "Debate Cívico Soberano";
    }
  } catch {}

async function tryUploadTopicToPermaweb(topicId, finalComm, title, body) {
  if (!wallet.hasWallet()) return null;
  try {
    const tags = upload.buildTags("topic", {
      "Community-Id": finalComm,
      "Topic-Title": title,
      Title: title,
      "Local-Origin-Id": topicId,
    });
    return await upload.postData({ title, body, communityId: finalComm }, tags);
  } catch (permaErr) {
    console.warn("Falha no upload Permaweb:", permaErr);
    return null;
  }
}

function getInputValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function readTopicInputs() {
  const commInput = document.getElementById("topic-comm-id");
  const rawComm = commInput ? commInput.value.trim().toLowerCase() : "";
  return {
    commId: rawComm || "geral",
    title: getInputValue("topic-title"),
    body: getInputValue("topic-body"),
  };
}

async function signAndBroadcastTopic(topicId, finalComm, title, body) {
  const myDisplayName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const myAvatar = localAccount.getProfileEnrichment()?.avatarUrl || "";
  const signed = await localAccount.signPayload({
    id: topicId,
    type: "topic",
    communityId: finalComm,
    title,
    body,
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
}

function showTopicPublishToast(permawebResult) {
  if (permawebResult?.success) {
    const badge = permawebResult.via === "turbo" ? "Turbo ⚡" : "Arweave";
    share.showToast(`Post publicado no P2P e gravado na Permaweb (${badge})!`);
  } else if (wallet.hasWallet()) {
    share.showToast("Post publicado no P2P local (Permaweb indisponível).", "warning");
  } else {
    share.showToast("Post publicado na rede!");
  }
}

async function triggerTopicReplicationAndPosse(topicPayload) {
  try {
    const { dispatchAutoReplication, isAutoReplicationEnabled } = await import("../linked-accounts.js");
    if (isAutoReplicationEnabled()) {
      dispatchAutoReplication(topicPayload)
        .then((rep) => {
          if (rep.dispatched && rep.count > 0) {
            share.showToast(`🚀 Replicado para ${rep.count} webhook(s) de redes vinculadas!`);
          }
        })
        .catch(() => {});
    }
  } catch {}
  try {
    const { openPosseSheetAfterPublish } = await import("../posse-dispatch.js");
    openPosseSheetAfterPublish(topicPayload);
  } catch {}
}

async function handleComposeTopicSubmit(e, communityId) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-topic");
  const inputs = readTopicInputs();
  const finalComm = communityId || inputs.commId;
  if (!inputs.body) return;

  btn.disabled = true;
  btn.textContent = "Publicando…";
  try {
    const topicId = "top_" + Math.random().toString(36).slice(2, 10);
    await signAndBroadcastTopic(topicId, finalComm, inputs.title, inputs.body);
    const permaResult = await tryUploadTopicToPermaweb(topicId, finalComm, inputs.title, inputs.body);
    showTopicPublishToast(permaResult);

    await triggerTopicReplicationAndPosse({ id: topicId, communityId: finalComm, title: inputs.title, body: inputs.body });
    location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(finalComm)}`;
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Publicar Post";
  }
}

  const form = document.getElementById("form-compose-topic");
  if (form) {
    form.addEventListener("submit", (e) => {
      handleComposeTopicSubmit(e, communityId);
    });
  }
}

export async function showComposeListing(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY_FEIRA.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Oferta"));

  let meta = { id: targetComm, title: targetComm, commercialEnabled: false };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) {
      meta = { ...localC, commercialEnabled: Boolean(localC.commercialEnabled) };
    } else if (targetComm === mock.MOCK_DEMO_COMMUNITY_FEIRA.id) {
      meta = mock.MOCK_DEMO_COMMUNITY_FEIRA;
    } else {
      const commRes = await gql.fetchCommunity(targetComm).catch(() => null);
      if (commRes) meta = commRes;
    }
  } catch {}

  if (!listing.isCommercialEnabled(meta)) {
    main.innerHTML = `<div class="card"><div class="error">Esta comunidade não possui feira comunitária ativada por governança.</div><p style="margin-top:1rem;"><a href="#/c/${encodeURIComponent(targetComm)}" class="btn btn-outline btn-sm">← Voltar à comunidade</a></p></div>`;
    return;
  }

  const defaultPix = (await localAccount.getPixKey()) || "";
  render.renderComposeListing(main, targetComm, meta.title, { defaultPix });

  document.getElementById("form-compose-listing")?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleComposeListingSubmit(user, targetComm);
  });
}

function readListingFormValues() {
  return {
    title: getInputValue("listing-title"),
    priceLabel: getInputValue("listing-price"),
    locationLabel: getInputValue("listing-location"),
    contactPix: getInputValue("listing-pix"),
    image: getInputValue("listing-image"),
    body: getInputValue("listing-body"),
  };
}

function resolveContactPix(contactPix) {
  if (!contactPix) return { ok: true, normalized: "" };
  const pixVal = pixKeyHelper.validatePixKey(contactPix);
  if (!pixVal.ok) {
    return { ok: false, error: `Chave Pix inválida: ${pixVal.errorPt}` };
  }
  return { ok: true, normalized: pixVal.normalized };
}

async function executeListingPublish(form, pixNormalized, user, communityId) {
  const listingId = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const draft = listing.buildListingDraft({
    id: listingId,
    communityId,
    ...form,
    contactPix: pixNormalized,
    author: user,
    owner: user,
    listingStatus: "available",
  });
  const signed = await localAccount.signPayload(draft);
  const check = listing.validateSignedListingGossip(signed);
  if (!check.valid) throw new Error(check.error || "Oferta inválida");
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  share.showToast(i18n.listingPublishedToast);
  location.hash = `#/c/${encodeURIComponent(communityId)}?tab=listings`;
}

export async function handleComposeListingSubmit(user, communityId) {
  const form = readListingFormValues();
  const val = listing.validateListingInput(form);
  if (!val.valid) return share.showToast(val.error, "error");

  const pixResult = resolveContactPix(form.contactPix);
  if (!pixResult.ok) return share.showToast(pixResult.error, "error");

  const btn = document.getElementById("btn-submit-listing");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Publicando…";
  }

  try {
    await executeListingPublish(form, pixResult.normalized, user, communityId);
  } catch (err) {
    share.showToast(`Erro ao publicar oferta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar na Feira";
    }
  }
}

export async function showComposeProposal(communityId) {
  const targetComm = communityId || mock.MOCK_DEMO_COMMUNITY.id;
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Proposta"));

  let commMeta = { id: targetComm, title: targetComm };
  try {
    const localC = await cacheNode.getLocalPost(targetComm);
    if (localC) commMeta = localC;
    else if (targetComm === mock.MOCK_DEMO_COMMUNITY.id) commMeta = mock.MOCK_DEMO_COMMUNITY;
  } catch {}

  render.renderComposeProposal(main, targetComm, commMeta.title);
  attachComposeProposalHandlers(targetComm, user);
}

export function attachComposeProposalHandlers(communityId, user) {
  const form = document.getElementById("form-compose-proposal");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("prop-title")?.value || "";
    const body = document.getElementById("prop-body")?.value || "";
    const diffText = document.getElementById("prop-diff")?.value || "";

    const val = gov.validateProposalInput({ title, body, diffText, communityId });
    if (!val.valid) return share.showToast(val.error, "error");

    const btn = document.getElementById("btn-submit-proposal");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Publicando…";
    }
    await publishProposal({ communityId, title: val.title, body: val.body, diffText: val.diffText, user, btn });
  });
}

export async function publishProposal({ communityId, title, body, diffText, user, btn }) {
  try {
    const now = Date.now();
    const signedProposal = await localAccount.signPayload({
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "governance-proposal",
      communityId,
      title,
      body,
      diffText,
      author: user,
      owner: user,
      createdAt: now,
      closesAt: now + 7 * 24 * 3600 * 1000,
      minQuorum: 2,
      state: "open",
      ts: now,
    });
    await cacheNode.saveLocalPost(signedProposal);
    peers.broadcastGossip(signedProposal);
    share.showToast("Proposta publicada na governança!");
    location.hash = `#/c/${encodeURIComponent(communityId)}/proposal/${encodeURIComponent(signedProposal.id)}`;
  } catch (err) {
    share.showToast(`Erro ao publicar proposta: ${err.message}`, "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Publicar Proposta Assinada";
    }
  }
}

export async function showComposeReply(topicId, communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "home", "Responder"));
  render.renderComposeReply(main, topicId, communityId);

  const form = document.getElementById("form-compose-reply");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-reply");
      const body = document.getElementById("reply-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Enviando…";
      try {
        await persistLocalReply(topicId, communityId, body);
        share.showToast("Resposta enviada!");
        location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(communityId)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Enviar Resposta";
      }
    });
  }
}

export async function persistLocalReply(topicId, communityId, body, { parentId = "" } = {}) {
  const replyId = "rep_" + Math.random().toString(36).slice(2, 10);
  const myDisplayName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const myAvatar = localAccount.getProfileEnrichment()?.avatarUrl || "";
  const signed = await localAccount.signPayload({
    id: replyId,
    type: "reply",
    replyTo: topicId,
    communityId,
    body,
    parentId: parentId || "",
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  if (!wallet.hasWallet()) return signed;
  try {
    const tags = upload.buildTags("reply", {
      "Reply-To": topicId,
      "Community-Id": communityId,
      "Local-Origin-Id": replyId,
    });
    await upload.postData({ replyTo: topicId, body, communityId, authorDisplay: myDisplayName }, tags);
  } catch {}
  return signed;
}

export async function loadInlineReplies(topicId) {
  let local = [];
  try {
    local = await cacheNode.getLocalPosts({ type: "reply", replyTo: topicId });
  } catch {
    local = [];
  }
  const myId = localAccount.getCachedRouteIdSync();
  const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const seen = new Set();
  const out = [];
  for (const r of local) {
    seen.add(r.id);
    const isOwn = Boolean(myId && r.author === myId);
    out.push({
      ...r,
      isLocalP2p: true,
      isOwnLocalPost: isOwn,
      authorDisplay: r.authorDisplay || (isOwn ? myName : ""),
    });
  }
  for (const r of mock.mockReplies(topicId).items) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

export function setCommentOpen(btn, panel, open) {
  panel.hidden = !open;
  panel.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  btn.classList.toggle("active", open);
}

export function closeOtherCommentPanels(keep) {
  document.querySelectorAll(".post-comments.is-open").forEach((panel) => {
    if (panel === keep) return;
    const article = panel.closest("article");
    const otherBtn = article?.querySelector(".btn-comment");
    if (otherBtn) setCommentOpen(otherBtn, panel, false);
  });
}

export function fillCommentFeed(panel, replies) {
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) {
    slot.outerHTML = render.renderCommentList(replies, {
      topicId: panel.dataset.topic || "",
      commId: panel.dataset.comm || "",
    });
  }
  panel.dataset.loaded = "1";
}

export async function togglePostComments(btn) {
  const article = btn.closest("article");
  const panel = article?.querySelector(".post-comments");
  if (!panel) return;
  const opening = panel.hasAttribute("hidden");
  if (!opening) {
    setCommentOpen(btn, panel, false);
    return;
  }
  closeOtherCommentPanels(panel);
  setCommentOpen(btn, panel, true);
  if (panel.dataset.loaded === "1") {
    panel.querySelector(".post-comment-input")?.focus();
    return;
  }
  const slot = panel.querySelector(".post-comments-feed");
  if (slot) slot.innerHTML = `<p class="post-comments-empty">Carregando respostas…</p>`;
  const replies = await loadInlineReplies(panel.dataset.topic);
  fillCommentFeed(panel, replies);
  const countEls = article.querySelectorAll(".count-replies");
  for (const el of countEls) {
    el.textContent = replies.length > 0 ? String(replies.length) : "";
  }
  panel.querySelector(".post-comment-input")?.focus();
}

function commentListContext(panel) {
  return {
    topicId: panel?.dataset.topic || "",
    commId: panel?.dataset.comm || "",
  };
}

export function appendInlineReply(panel, reply) {
  const parentId = reply.parentId || "";
  if (parentId) {
    appendNestedInlineReply(panel, parentId, reply);
    return;
  }
  let list = panel?.querySelector(".post-comment-list");
  if (!list) {
    const feed = panel?.querySelector(".post-comments-feed");
    if (feed) feed.innerHTML = `<ul class="post-comment-list"></ul>`;
    list = panel?.querySelector(".post-comment-list");
  }
  panel?.querySelector(".post-comments-empty")?.remove();
  if (list) {
    list.insertAdjacentHTML(
      "beforeend",
      render.renderInlineReplyItem(reply, commentListContext(panel)),
    );
  }
}

export function appendNestedInlineReply(panel, parentId, reply) {
  const parentItem = panel?.querySelector(`[data-comment-id="${parentId}"]`);
  if (!parentItem) {
    appendInlineReply(panel, { ...reply, parentId: "" });
    return;
  }
  let nested = parentItem.querySelector(":scope > .post-comment-body > .post-comment-nested-list");
  if (!nested) {
    parentItem
      .querySelector(".post-comment-body")
      ?.insertAdjacentHTML("beforeend", `<ul class="post-comment-nested-list"></ul>`);
    nested = parentItem.querySelector(":scope > .post-comment-body > .post-comment-nested-list");
  }
  if (nested) {
    nested.insertAdjacentHTML(
      "beforeend",
      render.renderInlineReplyItem(reply, commentListContext(panel)),
    );
  }
}

export function toggleCommentReplyComposer(item, open) {
  const form = item?.querySelector(".post-comment-nested-reply");
  if (!form) return;
  form.hidden = !open;
  if (open) {
    const ta = form.querySelector("textarea");
    ta?.focus();
    if (ta && typeof ta.setSelectionRange === "function") {
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }
}

export async function onNestedCommentReplySubmit(form) {
  const body = form.querySelector(".post-comment-nested-input")?.value.trim();
  if (!body) return;
  const btn = form.querySelector(".btn-comment-nested-send");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const signed = await persistLocalReply(form.dataset.topic, form.dataset.comm || "", body, {
      parentId: form.dataset.parent || "",
    });
    const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    appendInlineReply(form.closest(".post-comments"), {
      ...signed,
      isOwnLocalPost: true,
      authorDisplay: signed.authorDisplay || myName,
    });
    bumpReplyCount(form.closest("article"));
    form.reset();
    toggleCommentReplyComposer(form.closest(".post-comment-item"), false);
    const panel = form.closest(".post-comments");
    if (panel) panel.dataset.loaded = "1";
    share.showToast("Resposta enviada!");
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

export function bumpReplyCount(article) {
  if (!article) return;
  const countEls = article.querySelectorAll(".count-replies");
  for (const el of countEls) {
    const next = (Number(el.textContent) || 0) + 1;
    el.textContent = String(next);
  }
  const btns = article.querySelectorAll(".btn-comment");
  for (const btn of btns) {
    const n = Number(btn.querySelector(".count-replies")?.textContent) || 0;
    btn.setAttribute("aria-label", `Comentar${n > 0 ? `, ${n} comentários` : ""}`);
  }
}

export async function onInlineReplySubmit(form) {
  const body = form.querySelector(".post-comment-input")?.value.trim();
  if (!body) return;
  const btn = form.querySelector(".btn-inline-reply");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Enviando…";
  }
  try {
    const signed = await persistLocalReply(form.dataset.topic, form.dataset.comm || "", body);
    const myName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
    appendInlineReply(form.closest(".post-comments"), {
      ...signed,
      isOwnLocalPost: true,
      authorDisplay: signed.authorDisplay || myName,
    });
    bumpReplyCount(form.closest("article"));
    form.reset();
    const panel = form.closest(".post-comments");
    if (panel) panel.dataset.loaded = "1";
    share.showToast("Resposta enviada!");
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Responder";
  }
}
