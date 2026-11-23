/** @file Gossip routing, signaling health, inter-tab sync, and central memory hydration. */
import * as share from "../share.js";
import * as centralMemory from "../central-memory.js";
import * as peers from "../peers.js";
import * as voxels from "../voxels.js";
import { honestMessage } from "../honest-errors.js";
import { parseRoute } from "./route-parse.js";
import { route } from "./navigation.js";
import { showHome, showTagFeed } from "./screens-home.js";
import { showPeople } from "./screens-people.js";
import { showCommunity } from "./screens-community.js";
import { showTopic } from "./community-topic-screen.js";
import { showProposal } from "./screens-vote.js";
import { bumpReplyCount, appendInlineReply } from "./screens-compose.js";
import { syncIdentity } from "./screens-network.js";
import { clearInFlight } from "../shared/async-dedupe.js";

/**
 * Reflete uma resposta recebida pela rede: contador, painel aberto e rota atual.
 *
 * @param {object} item Resposta recebida.
 * @param {object} cur Rota atual.
 */
function handleGossipReply(item, cur) {
  const topicArticle = document.querySelector(`article[data-id="${item.replyTo}"]`);
  if (topicArticle) {
    bumpReplyCount(topicArticle);
    const panel = topicArticle.querySelector(".post-comments");
    if (panel && !panel.hidden) {
      appendInlineReply(panel, item);
    }
  }
  if (cur.name === "topic" && (cur.id === item.id || cur.id === item.replyTo)) {
    showTopic(cur.id, cur.communityId);
  }
  share.showToast(`Nova resposta na publicação: ${(item.body || "").slice(0, 24)}…`);
}

/**
 * Redesenha a rota atual quando chega um post pela rede.
 *
 * @param {object} cur Rota atual.
 * @param {object} item Post recebido.
 */
function refreshRouteForGossip(cur, item) {
  if (cur.name === "home") {
    showHome(cur.feed);
  } else if (cur.name === "community" && cur.id === item.communityId) {
    showCommunity(cur.id, cur.tab);
  } else if (cur.name === "proposal" && (cur.proposalId === item.proposalId || cur.proposalId === item.id)) {
    showProposal(cur.communityId, cur.proposalId);
  } else if (cur.name === "topic" && (cur.id === item.id || cur.id === item.replyTo)) {
    showTopic(cur.id, cur.communityId);
  } else if (cur.name === "tag-feed" && cur.slug) {
    showTagFeed(cur.slug);
  }
}

const GOSSIP_TOAST_MAP = {
  listing: (item) => `Nova oferta na feira: ${item.title?.slice(0, 24) || "..."}`,
  "governance-proposal": (item) => `Nova proposta de governança: ${item.title?.slice(0, 24) || "..."}`,
  "governance-vote": () => "Novo voto registrado na proposta!",
  "frame-action": () => "Nova interação no mini-app do post!",
};

/**
 * Mostra o aviso de que chegou um post ou atualização pela rede.
 *
 * @param {object} item Post recebido.
 */
function showGossipToast(item) {
  if (!item?.type) return;
  if (item.type === "topic") {
    const isUpdate = Boolean(item.editedAt && item.editedAt > 0);
    share.showToast(isUpdate ? "Publicação atualizada na rede." : `Novo post na rede: ${item.title?.slice(0, 24) || "..."}`);
    return;
  }
  const msgFn = GOSSIP_TOAST_MAP[item.type];
  if (msgFn) share.showToast(msgFn(item));
}

/**
 * Reflete na rota atual a remoção de um post (tumba) recebida pela rede.
 *
 * @param {object} tombstone Marca de remoção.
 * @param {object} cur Rota atual.
 */
function handleGossipTombstone(tombstone, cur) {
  if (cur.name === "home") {
    showHome(cur.feed);
  } else if (cur.name === "community") {
    showCommunity(cur.id, cur.tab);
  } else if (cur.name === "topic" && cur.id === tombstone.id) {
    location.hash = "#/";
  } else if (cur.name === "tag-feed" && cur.slug) {
    showTagFeed(cur.slug);
  }
}

/**
 * Redesenha a rota atual depois da sincronização com a memória central.
 */
function refreshAfterCentralMemorySync() {
  const cur = parseRoute();
  if (cur.name === "home") {
    showHome(cur.feed);
  } else if (cur.name === "people") {
    showPeople(cur.query);
  } else if (cur.name === "community") {
    showCommunity(cur.id, cur.tab);
  } else if (cur.name === "topic") {
    showTopic(cur.id, cur.communityId);
  } else if (cur.name === "proposal") {
    showProposal(cur.communityId, cur.proposalId);
  } else if (cur.name === "tag-feed" && cur.slug) {
    showTagFeed(cur.slug);
  }
}

/**
 * S30-S5: sincronização entre abas; import dinâmico — incluir em `SHELL_ASSETS` quando o PR tocar `sw.js`.
 *
 * @returns {void}
 */
export function wireTabSyncAtBoot() {
  void import("../identity/index.js").then((identity) => {
    identity.startTabSync({
      onReload: ({ reason }) => {
        if (reason === "identity") {
          clearInFlight("profile-onchain:");
          void syncIdentity();
        }
        void route();
      },
    });
  });
}

/**
 * Registra ouvintes de gossip, sinalização e recompensa de voxel local.
 *
 * @returns {void}
 */
export function bindGossipSubscriptions() {
  peers.onGossipPost((item) => {
    const cur = parseRoute();
    if (item?.type === "reply" && item.replyTo) {
      handleGossipReply(item, cur);
      return;
    }
    refreshRouteForGossip(cur, item);
    showGossipToast(item);
  });

  peers.onGossipTombstone((tombstone) => {
    handleGossipTombstone(tombstone, parseRoute());
  });

  peers.onSignalingHealth((down) => {
    share.showToast(honestMessage(down ? "signalingDown" : "signalingBack"), down ? "error" : "info");
  });

  centralMemory.startCentralMemoryLoop({
    onHydrated: () => refreshAfterCentralMemorySync(),
  });

  void voxels.triggerLocalNodeBoostReward({
    checkRelayFn: peers.checkDesktopRelay,
    toastFn: share.showToast,
  });
}
