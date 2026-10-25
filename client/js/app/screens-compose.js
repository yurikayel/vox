/** @file Compose flows and inline reply UI. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as brcode from "../brcode.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";

export async function showComposeCommunity() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Nova Comunidade"));
  render.renderComposeCommunity(main);

  const form = document.getElementById("form-compose-community");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-comm");
      const id = document.getElementById("comm-id")?.value.trim().toLowerCase();
      const title = document.getElementById("comm-title")?.value.trim();
      const category = document.getElementById("comm-category")?.value.trim();
      const desc = document.getElementById("comm-desc")?.value.trim();

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
            });
            await upload.postData({ id, title, category, description: desc }, tags);
          } catch {}
        }

        share.showToast("Comunidade criada na rede!");
        location.hash = `#/c/${encodeURIComponent(id)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Comunidade";
      }
    });
  }
}

export async function showComposeTopic(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Novo Post"));
  render.renderComposeTopic(main, communityId);

  const form = document.getElementById("form-compose-topic");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("btn-submit-topic");
      const finalComm = communityId || document.getElementById("topic-comm-id")?.value.trim().toLowerCase() || "geral";
      const title = document.getElementById("topic-title")?.value.trim();
      const body = document.getElementById("topic-body")?.value.trim();

      btn.disabled = true;
      btn.textContent = "Publicando…";
      try {
        const topicId = "top_" + Math.random().toString(36).slice(2, 10);
        const signed = await localAccount.signPayload({
          id: topicId,
          type: "topic",
          communityId: finalComm,
          title,
          body,
        });
        await cacheNode.saveLocalPost(signed);
        peers.broadcastGossip(signed);

        if (wallet.hasWallet()) {
          try {
            const tags = upload.buildTags("topic", {
              "Community-Id": finalComm,
              "Topic-Title": title,
              Title: title,
              "Local-Origin-Id": topicId,
            });
            await upload.postData({ title, body, communityId: finalComm }, tags);
          } catch {}
        }

        share.showToast("Post publicado na rede!");
        location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(finalComm)}`;
      } catch (err) {
        share.showToast(`Erro: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Publicar Post";
      }
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

export async function handleComposeListingSubmit(user, communityId) {
  const title = document.getElementById("listing-title")?.value?.trim() || "";
  const priceLabel = document.getElementById("listing-price")?.value?.trim() || "";
  const locationLabel = document.getElementById("listing-location")?.value?.trim() || "";
  const contactPix = document.getElementById("listing-pix")?.value?.trim() || "";
  const image = document.getElementById("listing-image")?.value?.trim() || "";
  const body = document.getElementById("listing-body")?.value?.trim() || "";

  const val = listing.validateListingInput({ title, body, priceLabel });
  if (!val.valid) return share.showToast(val.error, "error");

  let normalizedPix = "";
  if (contactPix) {
    const pixVal = pixKeyHelper.validatePixKey(contactPix);
    if (!pixVal.ok) {
      return share.showToast(`Chave Pix inválida: ${pixVal.errorPt}`, "error");
    }
    normalizedPix = pixVal.normalized;
  }

  const btn = document.getElementById("btn-submit-listing");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Publicando…";
  }

  try {
    const listingId = `listing_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const draft = listing.buildListingDraft({
      id: listingId,
      communityId,
      title,
      body,
      priceLabel,
      locationLabel,
      contactPix: normalizedPix,
      image,
      author: user,
      owner: user,
      listingStatus: "available",
    });
    const signed = await localAccount.signPayload(draft);
    const check = listing.validateSignedListingGossip(signed);
    if (!check.valid) {
      throw new Error(check.error || "Oferta inválida");
    }
    await cacheNode.saveLocalPost(signed);
    peers.broadcastGossip(signed);
    share.showToast(i18n.listingPublishedToast);
    location.hash = `#/c/${encodeURIComponent(communityId)}?tab=listings`;
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

export async function persistLocalReply(topicId, communityId, body) {
  const replyId = "rep_" + Math.random().toString(36).slice(2, 10);
  const signed = await localAccount.signPayload({
    id: replyId,
    type: "reply",
    replyTo: topicId,
    communityId,
    body,
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
    await upload.postData({ replyTo: topicId, body, communityId }, tags);
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
  const seen = new Set();
  const out = [];
  for (const r of local) {
    seen.add(r.id);
    out.push({ ...r, isLocalP2p: true });
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
  if (slot) slot.outerHTML = render.renderCommentList(replies);
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
  fillCommentFeed(panel, await loadInlineReplies(panel.dataset.topic));
  panel.querySelector(".post-comment-input")?.focus();
}

export function appendInlineReply(panel, reply) {
  let list = panel?.querySelector(".post-comment-list");
  if (!list) {
    const feed = panel?.querySelector(".post-comments-feed");
    if (feed) feed.innerHTML = `<ul class="post-comment-list"></ul>`;
    list = panel?.querySelector(".post-comment-list");
  }
  panel?.querySelector(".post-comments-empty")?.remove();
  if (list) list.insertAdjacentHTML("beforeend", render.renderInlineReplyItem(reply));
}

export function bumpReplyCount(article) {
  const el = article?.querySelector(".count-replies");
  if (!el) return;
  el.textContent = String((Number(el.textContent) || 0) + 1);
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
    appendInlineReply(form.closest(".post-comments"), signed);
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
