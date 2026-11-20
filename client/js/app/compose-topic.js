/**
 * @file Fluxo de composição de novo tópico/post: ata de chat, tags cívicas, enquete, esfera Social/Cívico e publicação.
 *
 * @module app/compose-topic
 */

import * as render from "../render.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as featureFlags from "../feature-flags.js";
import * as permanence from "../permanence-notice.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import { attachPowIfWanted } from "../new-key-guard.js";
import { parseChatTranscriptToMarkdown } from "../chat-bridge.js";
import { createCivicNotaryRecord } from "../perma-notary.js";
import { appendPollOptionsToBody } from "../civic-post.js";
import { randomBase36 } from "../shared/html.js";
import { bindComposeStepper, focusComposeAfterSteppedPublish, goToComposeStep } from "./compose-stepper.js";
import { attachInlineComposerHandlers, expandInlineComposer } from "./inline-composer.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { bindPollBuilder, readPollOptions } from "./compose-poll.js";
import { assertCanPostTopic } from "./community-channel-flow.js";
import { getInputValue } from "./compose-shared.js";

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

function applyQuotePrefillToTopicComposer() {
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
}

async function tryUploadTopicToPermaweb(topicId, finalComm, title, body) {
  if (!featureFlags.isFeatureEnabled("arweaveUpload")) return { success: false, skipped: "arweave-disabled" };
  if (!wallet.hasWallet()) return null;
  if (!(await permanence.confirmPermanentPublish())) return permanence.MESH_ONLY_RESULT;
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

function readTopicInputs() {
  const commInput = document.getElementById("topic-comm-id");
  const rawComm = commInput ? commInput.value.trim().toLowerCase() : "";
  const tag = getInputValue("topic-civic-tag");
  let rawTitle = getInputValue("topic-title");
  if (tag && !rawTitle.toLowerCase().includes(tag.toLowerCase())) {
    rawTitle = rawTitle ? `${tag} ${rawTitle}` : tag;
  }
  return {
    commId: rawComm || "geral",
    title: rawTitle,
    civicTag: tag,
    body: tag === "[Enquete]" ? appendPollOptionsToBody(getInputValue("topic-body"), readPollOptions()) : getInputValue("topic-body"),
  };
}

async function signAndBroadcastTopic(topicId, finalComm, title, body, civicTag = "") {
  const myDisplayName = localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "";
  const myAvatar = localAccount.getProfileEnrichment()?.avatarUrl || "";
  const payload = {
    id: topicId,
    type: "topic",
    communityId: finalComm,
    title,
    body,
    authorDisplay: myDisplayName,
    authorAvatar: myAvatar,
  };
  if (civicTag) payload.civicTag = civicTag;
  // LAN-14: comunidade com quarentena de chave nova recebe o post com PoW leve.
  const community = (await cacheNode.getLocalCommunities()).find((c) => c.id === finalComm);
  await attachPowIfWanted(payload, community, await localAccount.getRouteId());
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
}

function showTopicPublishToast(permawebResult) {
  if (permawebResult?.success) {
    const badge = permawebResult.via === "turbo" ? "Turbo ⚡" : "Arweave";
    share.showToast(`Post publicado no P2P e gravado na Permaweb (${badge})!`);
  } else if (permawebResult?.skipped === permanence.CHOICE_MESH) {
    share.showToast("Post publicado só na malha P2P (não permanente).");
  } else if (permawebResult?.skipped === "arweave-disabled") {
    share.showToast("Post publicado na rede de seguidores!");
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
    const { openExplodeSheet } = await import("../explode-dispatch.js");
    openExplodeSheet(topicPayload);
  } catch {}
}

async function handleComposeTopicSubmit(e, communityId) {
  e.preventDefault();
  const btn = document.getElementById("btn-submit-topic");
  const inputs = readTopicInputs();
  const finalComm = communityId || inputs.commId;
  if (!inputs.body || !(await assertCanPostTopic(finalComm))) return;

  btn.disabled = true;
  btn.textContent = "Publicando…";
  try {
    const topicId = "top_" + randomBase36(8);
    await signAndBroadcastTopic(topicId, finalComm, inputs.title, inputs.body, inputs.civicTag);
    const permaResult = await tryUploadTopicToPermaweb(topicId, finalComm, inputs.title, inputs.body);
    showTopicPublishToast(permaResult);
    focusComposeAfterSteppedPublish("Post publicado.");

    await triggerTopicReplicationAndPosse({ id: topicId, communityId: finalComm, title: inputs.title, civicTag: inputs.civicTag, body: inputs.body });
    location.hash = `#/t/${encodeURIComponent(topicId)}?c=${encodeURIComponent(finalComm)}`;
  } catch (err) {
    share.showToast(`Erro: ${err.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Publicar Post";
  }
}

function bindCivicTagSelector() {
  const hiddenInput = document.getElementById("topic-civic-tag");
  if (!hiddenInput) return;
  document.querySelectorAll(".civic-tag-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".civic-tag-btn").forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      hiddenInput.value = btn.dataset.tag || "";
      const builder = document.getElementById("civic-poll-builder");
      if (builder) builder.hidden = hiddenInput.value !== "[Enquete]";
    });
  });
  bindPollBuilder();
}

/** Primeira escolha: Social abre o composer completo (mídias); Cívico segue as etapas. */
function bindSphereChoice(communityId) {
  const form = document.getElementById("form-compose-topic");
  const social = document.getElementById("compose-social-panel");
  let socialBound = false;
  document.querySelector('[data-sphere="social"]')?.addEventListener("click", () => {
    form.hidden = true;
    social.hidden = false;
    if (communityId) {
      const comm = document.getElementById("inline-topic-comm");
      if (comm) comm.value = communityId;
    }
    if (!socialBound) {
      attachInlineComposerHandlers(() => { location.hash = communityId ? `#/c/${encodeURIComponent(communityId)}` : "#/"; });
      socialBound = true;
    }
    expandInlineComposer();
    document.getElementById("inline-topic-body")?.focus();
  });
  document.querySelector('[data-sphere="civic"]')?.addEventListener("click", () => {
    const tag = document.getElementById("topic-civic-tag");
    if (tag && !tag.value) document.querySelector('.civic-tag-btn[data-tag="[Pauta]"]')?.click();
    goToComposeStep(form, 1);
  });
  social?.querySelector("[data-sphere-back]")?.addEventListener("click", () => {
    social.hidden = true;
    form.hidden = false;
    goToComposeStep(form, 0);
  });
}

/**
 * Formulário de novo tópico.
 *
 * @param {string} communityId ID da comunidade alvo (opcional).
 * @returns {Promise<void>}
 */
export async function showComposeTopic(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Novo Post"));
  const displayName = localAccount.getDisplayName() || "";
  render.renderComposeTopic(main, communityId, { userRouteId: user || "", displayName });
  bindChatTranscriptImportHandler(user);
  applyQuotePrefillToTopicComposer();
  bindCivicTagSelector();
  bindSphereChoice(communityId);

  const form = document.getElementById("form-compose-topic");
  if (form) {
    bindComposeStepper(form);
    form.addEventListener("submit", (e) => handleComposeTopicSubmit(e, communityId));
  }
}
