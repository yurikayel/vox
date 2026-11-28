/**
 * @file Conversa de DM: envio cifrado, reações, ações das bolhas, chave manual e painel dividido no desktop.
 *
 * @module app/screens-dm-thread
 */
import { honestMessage } from "../honest-errors.js";
import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as dmMsg from "../dm-messenger.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { applyBubbleReaction, dispatchSealedEnvelope } from "./dm-wire.js";
import { pollInboxMessages } from "./screens-dm-inbox.js";
import { bindDmThreadDraftAndCardActions, consumeHashContextForThread, dmDraft } from "./screens-dm-draft.js";

/**
 * Cifra a mensagem para o par e guarda no aparelho.
 *
 * @param {string} user Rota de quem envia.
 * @param {string} peerAddress Endereço do par.
 * @param {object|null} peerDmPub Chave pública do par.
 * @param {string} text Texto.
 * @returns {Promise<object>}
 */
async function sealAndPersistOutgoingDm(user, peerAddress, peerDmPub, text) {
  const wirePayload = dmMsg.serializeDmPayload({
    text,
    replyTo: dmDraft.activeReplyDraft,
    contextCard: dmDraft.pendingContextDraft,
    mediaDataUrl: dmDraft.activeMediaDraft,
  });
  const envelope = await cryptoDm.seal(peerDmPub, wirePayload, { from: user, to: peerAddress });
  const status = await dispatchSealedEnvelope(peerAddress, envelope);
  await cacheNode.saveDmMessage({
    id: envelope.id,
    peerAddress,
    from: user,
    to: peerAddress,
    text,
    replyTo: dmDraft.activeReplyDraft,
    contextCard: dmDraft.pendingContextDraft,
    mediaDataUrl: dmDraft.activeMediaDraft,
    ts: envelope.ts,
    status,
  });
  return status;
}

/**
 * Envia mensagem DM cifrada.
 *
 * @param {string} user
 * @param {unknown} peerAddress
 * @param {unknown} peerDmPub
 * @returns {void}
 */
export async function handleSendDmSubmit(user, peerAddress, peerDmPub) {
  const input = document.getElementById("dm-message-input");
  const rawText = input?.value.trim() || "";
  const fallback = dmDraft.pendingContextDraft ? `💬 ${dmDraft.pendingContextDraft.title}` : dmDraft.activeMediaDraft ? "📷 Foto" : "";
  const text = rawText || fallback;
  if (!text) return;
  const btn = document.getElementById("btn-send-dm");
  if (btn) btn.disabled = true;

  try {
    const status = await sealAndPersistOutgoingDm(user, peerAddress, peerDmPub, text);
    if (status === "pending-retry") share.showToast(honestMessage("dmNoRelay"));
    if (status === "failed") share.showToast("Não deu para guardar a mensagem neste aparelho (sem espaço). Ela não foi enviada.", "error");
    dmDraft.activeReplyDraft = null;
    dmDraft.pendingContextDraft = null;
    dmDraft.activeMediaDraft = "";
    if (input) input.value = "";
    showDmThread(peerAddress);
  } catch (err) {
    share.showToast(`Erro ao cifrar: ${err.message}`, "error");
    if (btn) btn.disabled = false;
  }
}

/** Controles de reação de uma bolha: a pílula de quem já reagiu e os botões de reação rápida. */
const REACTION_CONTROLS = ".btn-dm-react-pick, .dm-reaction-pill";

/**
 * Depois do redesenho da tela, devolve o foco ao controle da mesma reação: a pílula, ou o botão de reação rápida
 * da mesma mensagem se a pílula sumiu (reação desfeita). Sem isso o foco cai no `body` (WCAG 2.4.3).
 *
 * @param {string} msgId Mensagem.
 * @param {string} emoji Emoji.
 */
function refocusReaction(msgId, emoji) {
  const same = [...document.querySelectorAll(REACTION_CONTROLS)].filter((b) => b.dataset.msgId === msgId && b.dataset.emoji === emoji);
  const target = same.find((b) => b.classList.contains("dm-reaction-pill")) || same[0];
  target?.focus();
}

/**
 * Alterna a reação a uma mensagem e avisa o par, se há chave dele.
 *
 * @param {string} user Rota de quem reage.
 * @param {string} peerAddress Endereço do par.
 * @param {object|null} peerDmPub Chave pública do par.
 * @param {string} msgId Mensagem.
 * @param {string} emoji Emoji.
 */
async function handleToggleBubbleReaction(user, peerAddress, peerDmPub, msgId, emoji) {
  if (!msgId || !emoji) return;
  await applyBubbleReaction(peerAddress, user, msgId, emoji);
  if (peerDmPub) {
    try {
      const wire = dmMsg.serializeDmReaction({ targetId: msgId, emoji });
      const env = await cryptoDm.seal(peerDmPub, wire, { from: user, to: peerAddress });
      await dispatchSealedEnvelope(peerAddress, env);
    } catch {
      share.showToast("A reação ficou só neste aparelho: não deu para enviá-la.", "error");
    }
  }
  await showDmThread(peerAddress);
  refocusReaction(msgId, emoji);
}

/**
 * Liga as ações das bolhas da conversa (copiar Pix, reagir e afins).
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} user Rota de quem vê.
 * @param {string} peerAddress Endereço do par.
 * @param {object|null} peerDmPub Chave pública do par.
 */
function bindDmThreadBubbleActions(main, user, peerAddress, peerDmPub) {
  main.querySelectorAll(".btn-dm-copy-pix").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pix = btn.dataset.pix || "";
      if (!pix) return;
      navigator.clipboard.writeText(pix);
      share.showToast("Chave Pix copiada!");
    });
  });

  main.querySelectorAll(REACTION_CONTROLS).forEach((btn) => {
    btn.addEventListener("click", () => {
      handleToggleBubbleReaction(user, peerAddress, peerDmPub, btn.dataset.msgId, btn.dataset.emoji);
    });
  });
}

/**
 * Liga o formulário da conversa (enviar, chave manual).
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} user Rota de quem vê.
 * @param {string} peerAddress Endereço do par.
 * @param {object|null} peerDmPub Chave pública do par.
 */
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

/** Desktop largo: lista de conversas ao lado da conversa aberta (tela de referência "Mensagens desktop"). */
function isDmSplitViewport() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1100px)").matches;
}

/**
 * Desenha a lista compacta de conversas ao lado da conversa aberta.
 *
 * @param {HTMLElement} pane Painel da lista.
 * @param {object[]} convs Conversas.
 * @param {string} user Rota de quem vê.
 * @param {string} peerAddress Par da conversa aberta.
 * @param {string} [searchQuery=""] Busca atual.
 */
function renderCompactDmList(pane, convs, user, peerAddress, searchQuery = "") {
  render.renderDmList(pane, convs, user, { compact: true, activePeer: peerAddress, searchQuery });
  const input = pane.querySelector("#dm-search-input");
  input?.addEventListener("input", () => {
    const val = input.value;
    renderCompactDmList(pane, convs, user, peerAddress, val);
    const next = pane.querySelector("#dm-search-input");
    next?.focus();
    next?.setSelectionRange(val.length, val.length);
  });
}

/**
 * Em tela larga divide a tela em lista e conversa; devolve onde desenhar a conversa.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} user Rota de quem vê.
 * @param {string} peerAddress Par da conversa aberta.
 * @returns {Promise<HTMLElement>}
 */
async function mountDmSplitIfWide(main, user, peerAddress) {
  if (!isDmSplitViewport()) return main;
  main.innerHTML = `<div class="agora-dm-split"><aside class="agora-dm-list-pane" id="dm-list-pane" aria-label="Conversas"></aside><section class="agora-dm-thread-pane" id="dm-thread-pane"></section></div>`;
  const convs = await cacheNode.getDmConversations();
  renderCompactDmList(main.querySelector("#dm-list-pane"), convs, user, peerAddress);
  return main.querySelector("#dm-thread-pane");
}

/**
 * Monta fio de conversa com um peer.
 *
 * @param {unknown} peerAddress
 * @returns {void}
 */
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

  const threadTarget = await mountDmSplitIfWide(main, user, peerAddress);
  render.renderDmThread(threadTarget, peerAddress, messages, user, {
    isRtcOnline,
    hasDmPub: Boolean(peerDmPub),
    pendingContextCard: dmDraft.pendingContextDraft,
  });

  const c = document.getElementById("dm-thread-container");
  if (c) c.scrollTop = c.scrollHeight;
  bindDmThreadFormEvents(main, user, peerAddress, peerDmPub);
}
