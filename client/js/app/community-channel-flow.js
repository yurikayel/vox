/** @file PM-81 — canal: aviso no compor para quem não modera e troca de modo assinada pela moderação. */

import * as share from "../share.js";
import * as channel from "../community-channel.js";
import { canUpdateCommunity, COMMUNITY_UPDATE_TYPE } from "../community-updates.js";

const CHANNEL_BLOCKED_MSG = "Esta comunidade é um canal: só a moderação publica posts. Você pode comentar nos posts dela.";

const resolveMeta = async (id) => (await import("./screens-community.js")).resolveCommunityMetadata(id);

/**
 * O modo só chega por `community_update` guardado no aparelho. Sem nenhum com `postingMode`, não é canal
 * e o compor não precisa buscar a comunidade nos gateways.
 */
async function resolveComposeMeta(communityId) {
  const cacheNode = await import("../cache-node.js");
  const updates = await cacheNode.getLocalPosts({ type: COMMUNITY_UPDATE_TYPE, communityId }).catch(() => null);
  if (Array.isArray(updates) && !updates.some((u) => u?.postingMode)) return null;
  return resolveMeta(communityId);
}

/** As duas identidades do aparelho: a ativa (carteira, se houver) e a conta local que assina. */
async function deviceSelves() {
  const [context, localAccount] = await Promise.all([import("./context.js"), import("../local-account.js")]);
  return [await context.getActiveUser().catch(() => ""), await localAccount.getRouteId().catch(() => "")];
}

/**
 * No compor: barra e avisa quem não modera um canal. É só conveniência; a regra de verdade
 * vale na leitura de cada aparelho (`filterChannelTopics`).
 */
export async function assertCanPostTopic(communityId, deps = null) {
  if (!communityId) return true;
  const d = deps || { getMeta: resolveComposeMeta, getSelves: deviceSelves, notify: (msg) => share.showToast(msg, "error") };
  const meta = await d.getMeta(communityId).catch(() => null);
  if (channel.canPostTopic(meta, await d.getSelves())) return true;
  d.notify(CHANNEL_BLOCKED_MSG);
  return false;
}

async function defaultModeDeps() {
  const [localAccount, cacheNode, peers] = await Promise.all([
    import("../local-account.js"), import("../cache-node.js"), import("../peers.js"),
  ]);
  return {
    getMeta: resolveMeta,
    getRouteId: () => localAccount.getRouteId(),
    sign: (payload) => localAccount.signPayload(payload),
    save: (signed) => cacheNode.saveLocalPost(signed),
    broadcast: (signed) => peers.broadcastGossip(signed),
    now: () => Date.now(),
  };
}

/** Publica o `community_update` assinado que troca o modo. Só dono ou moderador (PM-09). */
export async function setPostingMode(communityId, mode, deps = null) {
  const d = deps || (await defaultModeDeps());
  const meta = await d.getMeta(communityId);
  if (!canUpdateCommunity(meta, await d.getRouteId())) {
    throw new Error("Só o dono ou um moderador desta comunidade pode mudar quem publica.");
  }
  const signed = await d.sign(channel.buildPostingModeUpdate(communityId, mode, d.now()));
  await d.save(signed);
  d.broadcast(signed);
  return signed;
}

const CONFIRM_TEXT = {
  [channel.POSTING_MODE_MODS]: "Transformar em canal? Só a moderação vai publicar posts; as outras pessoas passam a só comentar. Posts de quem não modera ficam escondidos enquanto for canal.",
  [channel.POSTING_MODE_OPEN]: "Abrir para todos publicarem? Os posts escondidos enquanto era canal voltam a aparecer.",
};

const DONE_TEXT = {
  [channel.POSTING_MODE_MODS]: "Pronto: a comunidade agora é um canal.",
  [channel.POSTING_MODE_OPEN]: "Pronto: todos podem publicar de novo.",
};

/**
 * Com a página da comunidade montada, `showCommunity` só troca o conteúdo da aba e mantém o cabeçalho,
 * onde está a faixa do canal. Tirar a página força a montagem completa, com a faixa no modo novo.
 */
export function dropMountedCommunityPage(communityId, doc = globalThis.document) {
  const page = [...(doc?.querySelectorAll?.(".community-vox-page") || [])].find((el) => el.dataset?.communityId === communityId);
  page?.remove();
  return Boolean(page);
}

async function onModeClick(btn) {
  const { comm, mode } = btn.dataset;
  if (!CONFIRM_TEXT[mode] || !globalThis.confirm?.(CONFIRM_TEXT[mode])) return;
  btn.disabled = true;
  try {
    await setPostingMode(comm, mode);
    share.showToast(DONE_TEXT[mode]);
    dropMountedCommunityPage(comm);
    const [{ route }, { parseRoute }] = await Promise.all([import("./navigation.js"), import("./route-parse.js")]);
    route(parseRoute(location.hash.slice(1) || `/c/${comm}`));
  } catch (err) {
    share.showToast(err.message || "Não foi possível mudar quem publica.", "error");
    btn.disabled = false;
  }
}

let channelHandlersWired = false;

/** Liga os botões `.btn-channel-mode` da faixa do canal (delegação no documento). */
export function attachChannelHandlers(doc = globalThis.document) {
  if (channelHandlersWired || !doc?.addEventListener) return;
  channelHandlersWired = true;
  doc.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".btn-channel-mode");
    if (!btn) return;
    e.preventDefault();
    onModeClick(btn);
  });
}
