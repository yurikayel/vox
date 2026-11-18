/**
 * @file Modelo de DM: payload, reações, pins, leitura e listagem de conversas.
 
 * @module dm-messenger
 * Protocolo de mensageiro essencial DM v2 (E2E):
 * - Quote-Reply (responder mensagem específica dentro do envelope cifrado)
 * - Reações rápidas em bolhas (👍 ❤️ 🔥 🙏 ✅)
 * - Recibos de leitura E2E (✓✓ Lido) e anexo de foto/comprovante comprimido (<= 24 KB)
 * - Cartões nativos de contexto (Oferta da Feira, Pix, Tópico)
 * - Estado local de não lidas (unread), conversas fixadas (pin) e busca instantânea*/

/** Chave em `localStorage` (só neste aparelho). @type {string} */
export const DM_READ_STORAGE_KEY = "vox-dm-read-ts-v1";
/** Chave em `localStorage` (só neste aparelho). @type {string} */
export const DM_PINS_STORAGE_KEY = "vox-dm-pins-v1";
/** Limite numérico do módulo. @type {number} */
export const MAX_PINNED_PEERS = 3;
/** Limite numérico do módulo. @type {number} */
export const MAX_DM_MEDIA_CHARS = 24000;
/** Export `DM_REACTION_EMOJIS` do módulo. @type {Array} */
export const DM_REACTION_EMOJIS = ["👍", "❤️", "🔥", "🙏", "✅"];
const DEFAULT_WELCOME_ID = "vx_voxbrasil_welcome";

function clip(str, max = 90) {
  const s = String(str || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Normaliza ReplyMeta.
 * @param {*} [raw] Valor bruto de entrada.
 * @returns {*} Resultado da operação.
 */
export function normalizeReplyMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const snippet = clip(raw.snippet || raw.text || "", 90);
  if (!id || !snippet) return null;
  return {
    id,
    author: String(raw.author || raw.from || "").trim(),
    snippet,
  };
}

function fallbackProp(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getFirstParam(params, ...keys) {
  for (const k of keys) {
    const val = params.get(k);
    if (val) return val;
  }
  return "";
}

/** Rota interna do app (`#/…`, sem espaço): o único destino que o cartão de contexto pode abrir. */
const INTERNAL_ROUTE_RE = /^#\/\S{0,500}$/;

/**
 * O cartão vem de outra pessoa e o endereço vai para um `href`: só rota interna passa. `javascript:`, `data:`,
 * `//host` e links externos caem para "" (o cartão fica sem o botão Abrir).
 */
function safeCardRoute(raw) {
  const route = String(raw ?? "").trim();
  return INTERNAL_ROUTE_RE.test(route) ? route : "";
}

/** Normaliza ContextCard.
 * @param {*} [raw] Valor bruto de entrada.
 * @returns {*} Resultado da operação.
 */
export function normalizeContextCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "listing").toLowerCase();
  if (!["listing", "topic", "pix", "community"].includes(type)) return null;

  const title = clip(raw.title || "", 100);
  const pixKey = String(fallbackProp(raw, "pixKey", "pix")).trim();
  if (!title && !pixKey) return null;

  const price = clip(fallbackProp(raw, "price", "priceBrl"), 32);
  const url = safeCardRoute(fallbackProp(raw, "url", "href"));
  return {
    type,
    id: String(raw.id || "").trim(),
    title: title || "Apoio via Pix",
    price,
    priceBrl: price,
    pixKey,
    communityId: String(fallbackProp(raw, "communityId", "comm")).trim(),
    url,
    href: url,
  };
}

/** Normaliza MediaDataUrl.
 * @param {*} [raw] Valor bruto de entrada.
 * @returns {*} Resultado da operação.
 */
export function normalizeMediaDataUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > MAX_DM_MEDIA_CHARS) return "";
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return "";
  return s;
}

/** Operação `serializeDmPayload` do módulo.
 * @param {object} [options={}] Campos do payload.
 * @returns {*} Resultado da operação.
 */
export function serializeDmPayload({
  text = "",
  replyTo = null,
  contextCard = null,
  mediaDataUrl = "",
} = {}) {
  const cleanText = String(text ?? "");
  const cleanReply = normalizeReplyMeta(replyTo);
  const cleanCard = normalizeContextCard(contextCard);
  const cleanMedia = normalizeMediaDataUrl(mediaDataUrl);
  if (!cleanReply && !cleanCard && !cleanMedia) return cleanText;
  const out = {
    __vox_dm_v2: 1,
    kind: "message",
    text: cleanText,
    replyTo: cleanReply,
    contextCard: cleanCard,
  };
  if (cleanMedia) out.mediaDataUrl = cleanMedia;
  return JSON.stringify(out);
}

/** Operação `serializeDmReaction` do módulo.
 * @param {object} [options={}] Campos do payload.
 * @returns {*} Resultado da operação.
 */
export function serializeDmReaction({ targetId = "", emoji = "" } = {}) {
  const id = String(targetId || "").trim();
  const em = String(emoji || "").trim();
  if (!id || !DM_REACTION_EMOJIS.includes(em)) {
    throw new Error("Reação DM inválida");
  }
  return JSON.stringify({
    __vox_dm_v2: 1,
    kind: "react",
    targetId: id,
    emoji: em,
  });
}

/** Operação `serializeDmReadReceipt` do módulo.
 * @param {object} [options={}] Campos do payload.
 * @returns {*} Resultado da operação.
 */
export function serializeDmReadReceipt({ upToTs = Date.now() } = {}) {
  const ts = Number(upToTs) || Date.now();
  return JSON.stringify({
    __vox_dm_v2: 1,
    kind: "read",
    upToTs: ts,
  });
}

function tryParseV2Json(str) {
  if (!str.startsWith('{"__vox_dm_v2":1')) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/** Interpreta DmPayload.
 * @param {*} [raw] Valor bruto de entrada.
 * @returns {*} Resultado da operação.
 */
export function parseDmPayload(raw) {
  const str = String(raw ?? "");
  const parsed = tryParseV2Json(str);
  if (!parsed) {
    return { kind: "message", text: str, replyTo: null, contextCard: null, mediaDataUrl: "" };
  }
  if (parsed.kind === "react" && parsed.targetId && DM_REACTION_EMOJIS.includes(parsed.emoji)) {
    return {
      kind: "react",
      targetId: String(parsed.targetId).trim(),
      emoji: parsed.emoji,
    };
  }
  if (parsed.kind === "read" && Number(parsed.upToTs) > 0) {
    return {
      kind: "read",
      upToTs: Number(parsed.upToTs),
    };
  }
  return {
    kind: "message",
    text: String(parsed.text ?? ""),
    replyTo: normalizeReplyMeta(parsed.replyTo),
    contextCard: normalizeContextCard(parsed.contextCard),
    mediaDataUrl: normalizeMediaDataUrl(parsed.mediaDataUrl),
  };
}

/** Operação `toggleReactionMap` do módulo.
 * @param {*} [reactions] Parâmetro `reactions`.
 * @param {*} [emoji] Parâmetro `emoji`.
 * @param {*} [actor] Parâmetro `actor`.
 * @returns {*} Resultado da operação.
 */
export function toggleReactionMap(reactions = {}, emoji = "", actor = "") {
  const em = String(emoji || "").trim();
  const who = String(actor || "").trim();
  if (!DM_REACTION_EMOJIS.includes(em) || !who) return { ...(reactions || {}) };
  const next = { ...(reactions || {}) };
  const list = Array.isArray(next[em]) ? [...next[em]] : [];
  const idx = list.indexOf(who);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(who);
  if (list.length > 0) next[em] = list;
  else delete next[em];
  return next;
}

function resolveDmContextUrl(type, id, communityId) {
  if (type === "topic" && id) return `#/t/${encodeURIComponent(id)}`;
  if (communityId) return `#/c/${encodeURIComponent(communityId)}?tab=listings`;
  return "";
}

/** Interpreta DmContextFromHash.
 * @param {*} [hashStr] Parâmetro `hashStr`.
 * @returns {*} Resultado da operação.
 */
export function parseDmContextFromHash(hashStr = "") {
  const qIdx = String(hashStr || "").indexOf("?");
  if (qIdx < 0) return null;
  const q = new URLSearchParams(String(hashStr).slice(qIdx + 1));
  const title = getFirstParam(q, "ctxTitle", "title");
  const pixKey = getFirstParam(q, "ctxPix", "pix");
  if (!title && !pixKey) return null;

  const type = q.get("ctxType") || (q.get("topicId") ? "topic" : "listing");
  const id = getFirstParam(q, "listingId", "topicId", "ctxId");
  const communityId = getFirstParam(q, "c", "comm");
  return normalizeContextCard({
    type,
    id,
    title,
    price: getFirstParam(q, "ctxPrice", "price"),
    pixKey,
    communityId,
    url: resolveDmContextUrl(type, id, communityId),
  });
}

function extractItemListingArgs(it, itemOrComm) {
  return {
    author: fallbackProp(it, "author", "owner"),
    item: it,
    communityId: typeof itemOrComm === "string" ? itemOrComm : (it.communityId || ""),
    price: fallbackProp(it, "priceBrl", "price", "priceLabel"),
    pixKey: fallbackProp(it, "pixKey", "contactPix"),
  };
}

function normalizeListingHrefArgs(authorOrItem, itemOrComm, opts = {}) {
  if (authorOrItem && typeof authorOrItem === "object") {
    return extractItemListingArgs(authorOrItem, itemOrComm);
  }
  return {
    author: String(authorOrItem || ""),
    item: itemOrComm || {},
    communityId: opts.communityId || "",
    price: opts.price || "",
    pixKey: opts.pixKey || "",
  };
}

/** Monta ListingDmHref para uso no cliente.
 * @param {*} [authorOrItem] Parâmetro `authorOrItem`.
 * @param {*} [itemOrComm] Parâmetro `itemOrComm`.
 * @param {*} [opts] Opções da quarentena.
 * @returns {*} Resultado da operação.
 */
export function buildListingDmHref(authorOrItem, itemOrComm, opts = {}) {
  const { author, item, communityId, price, pixKey } = normalizeListingHrefArgs(
    authorOrItem,
    itemOrComm,
    opts
  );
  const base = `#/dm/${encodeURIComponent(author || "")}`;
  if (!item?.title && !pixKey) return base;
  const params = new URLSearchParams();
  params.set("ctxType", "listing");
  if (item?.id) params.set("listingId", item.id);
  if (item?.title) params.set("ctxTitle", item.title);
  if (price) params.set("ctxPrice", price);
  if (pixKey) params.set("ctxPix", pixKey);
  if (communityId) params.set("c", communityId);
  return `${base}?${params.toString()}`;
}

/** Operação `extractInlineVoxCard` do módulo.
 * @param {*} [text] Texto de entrada.
 * @returns {*} Resultado da operação.
 */
export function extractInlineVoxCard(text = "") {
  const s = String(text || "");
  const topicMatch = s.match(/#\/t\/([a-zA-Z0-9_-]+)/);
  if (topicMatch) {
    const id = decodeURIComponent(topicMatch[1]);
    return normalizeContextCard({
      type: "topic",
      id,
      title: `Tópico #${id.slice(0, 12)}`,
      url: `#/t/${encodeURIComponent(id)}`,
    });
  }
  const commMatch = s.match(/#\/c\/([a-zA-Z0-9_-]+)(?:\?tab=listings)?/);
  if (commMatch) {
    const cid = decodeURIComponent(commMatch[1]);
    const isFeira = s.includes("tab=listings");
    return normalizeContextCard({
      type: isFeira ? "listing" : "community",
      id: cid,
      title: isFeira ? `Feira · ${cid}` : `Comunidade · ${cid}`,
      communityId: cid,
      url: isFeira ? `#/c/${encodeURIComponent(cid)}?tab=listings` : `#/c/${encodeURIComponent(cid)}`,
    });
  }
  return null;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/** Obtém LastReadTs.
 * @param {*} [peerAddress] Parâmetro `peerAddress`.
 * @returns {*} Resultado da operação.
 */
export function getLastReadTs(peerAddress) {
  if (!peerAddress) return 0;
  const map = readJsonStorage(DM_READ_STORAGE_KEY, {});
  return Number(map[peerAddress]) || 0;
}

/** Operação `markThreadRead` do módulo.
 * @param {*} [peerAddress] Parâmetro `peerAddress`.
 * @param {*} [ts] Parâmetro `ts`.
 */
export function markThreadRead(peerAddress, ts = Date.now()) {
  if (!peerAddress) return;
  const map = readJsonStorage(DM_READ_STORAGE_KEY, {});
  map[peerAddress] = Math.max(Number(map[peerAddress]) || 0, Number(ts) || Date.now());
  try {
    localStorage.setItem(DM_READ_STORAGE_KEY, JSON.stringify(map));
  } catch {}
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("vox:dm-changed"));
    }
  } catch {}
}

/** Calcula UnreadCount.
 * @param {*} [messages] Parâmetro `messages`.
 * @param {*} [peerAddress] Parâmetro `peerAddress`.
 * @param {*} [myAddress] Endereço do destinatário autenticado.
 * @returns {*} Resultado da operação.
 */
export function computeUnreadCount(messages = [], peerAddress = "", myAddress = "") {
  if (!peerAddress || !Array.isArray(messages)) return 0;
  const lastRead = getLastReadTs(peerAddress);
  return messages.filter((m) => {
    const isIncoming = (myAddress && m.from && m.from !== myAddress) || m.status === "received";
    return isIncoming && (Number(m.ts) || 0) > lastRead;
  }).length;
}

/** Obtém PinnedPeers.
 * @returns {*} Resultado da operação.
 */
export function getPinnedPeers() {
  const arr = readJsonStorage(DM_PINS_STORAGE_KEY, []);
  return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x) : [];
}

/** Indica se PeerPinned.
 * @param {*} [peerAddress] Parâmetro `peerAddress`.
 * @returns {*} Resultado da operação.
 */
export function isPeerPinned(peerAddress) {
  return getPinnedPeers().includes(String(peerAddress || ""));
}

/** Operação `togglePinPeer` do módulo.
 * @param {*} [peerAddress] Parâmetro `peerAddress`.
 * @returns {*} Resultado da operação.
 */
export function togglePinPeer(peerAddress) {
  const peer = String(peerAddress || "").trim();
  if (!peer) return { pinned: false, list: getPinnedPeers() };
  const list = getPinnedPeers();
  const idx = list.indexOf(peer);
  if (idx >= 0) {
    list.splice(idx, 1);
    localStorage.setItem(DM_PINS_STORAGE_KEY, JSON.stringify(list));
    return { pinned: false, list };
  }
  if (list.length >= MAX_PINNED_PEERS) {
    return { pinned: false, limitReached: true, reason: "limit", list };
  }
  list.push(peer);
  localStorage.setItem(DM_PINS_STORAGE_KEY, JSON.stringify(list));
  return { pinned: true, list };
}

function getConvText(conv) {
  return String(conv.lastText || conv.lastMessage?.text || "");
}

function getConvTs(conv) {
  return Number(conv.lastTs ?? conv.lastMessage?.ts) || 0;
}

function conversationMatchesQuery(conv, q, resolveLabel) {
  if (!q) return true;
  const peer = String(conv.peerAddress || "").toLowerCase();
  const label = String(resolveLabel ? resolveLabel(conv.peerAddress) : conv.label || "").toLowerCase();
  const text = getConvText(conv).toLowerCase();
  return peer.includes(q) || label.includes(q) || text.includes(q);
}

/** Operação `sortAndFilterConversations` do módulo.
 * @param {*} [conversations] Parâmetro `conversations`.
 * @param {object} [filters={}] Filtros de busca e ordenação.
 * @returns {*} Resultado da operação.
 */
export function sortAndFilterConversations(
  conversations = [],
  { query = "", welcomeId = DEFAULT_WELCOME_ID, resolveLabel = null } = {}
) {
  const q = String(query || "").trim().toLowerCase();
  const pins = new Set(getPinnedPeers());
  return [...conversations]
    .filter((c) => conversationMatchesQuery(c, q, resolveLabel))
    .sort((a, b) => {
      if (welcomeId && a.peerAddress === welcomeId) return -1;
      if (welcomeId && b.peerAddress === welcomeId) return 1;
      const aPin = pins.has(a.peerAddress) ? 1 : 0;
      const bPin = pins.has(b.peerAddress) ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return getConvTs(b) - getConvTs(a);
    });
}
