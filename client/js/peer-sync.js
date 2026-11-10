/**
 * @file PM-80 — sincronização ao conectar: cada lado manda um inventário curto (hash do id + versão)
 * e só pede o que falta. Cliente antigo não responde; depois de LEGACY_FALLBACK_MS vai o envio completo
 * de antes. Spec: docs/specs/sync-inventario-v0.md.
 */

import * as cacheNode from "./cache-node.js";
import * as mediaBlob from "./media-blob.js";
import * as profileDirectory from "./profile-directory.js";

export const SYNC_INV = "SYNC_INV";
export const SYNC_WANT = "SYNC_WANT";
export const LEGACY_FALLBACK_MS = 8000;
export const SYNC_LIMITS = Object.freeze({ posts: 128, dels: 64, cards: 256 });
/**
 * PM-88: a foto vai ao lado do post, como na fofoca ao vivo. Teto por blob abaixo da mensagem que o canal
 * WebRTC aceita (~256 KiB, sem fatiar); teto por conexão para o inventário continuar poupando bytes.
 * Passou do teto: o post vai sem blob, como antes (quem recebe mostra o marcador).
 */
export const SYNC_BLOB_LIMITS = Object.freeze({ perBlob: 128 * 1024, perConnection: 2 * 1024 * 1024 });

const HASH_RE = /^[A-Za-z0-9_-]{11}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{8,32}$/;
const HASH_CACHE_MAX = 20000;
const hashCache = new Map();

const isSigned = (x) => Boolean(x?.sig && x?.pubKey);
const itemVersion = (x) => Number(x?.editedAt || x?.ts || 0);
const cardContent = (c) => JSON.stringify([c.name || "", c.avatarUrl || "", c.bio || "", c.handle || "", c.discoverable !== false]);

function toB64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 64 bits do SHA-256, em base64url (11 caracteres). Guarda em memória para não refazer a cada conexão. */
export async function shortHash(text) {
  const key = String(text);
  const cached = hashCache.get(key);
  if (cached) return cached;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = toB64Url(new Uint8Array(digest).slice(0, 8));
  if (hashCache.size >= HASH_CACHE_MAX) hashCache.clear();
  hashCache.set(key, hash);
  return hash;
}

/** O mesmo recorte que o envio completo sempre mandou: 128 posts, 64 remoções, 256 cartões. */
export function selectShared({ posts = [], tombstones = [], cards = [] }) {
  return {
    posts: posts.slice(0, SYNC_LIMITS.posts).filter(isSigned),
    dels: tombstones.slice(0, SYNC_LIMITS.dels).filter(isSigned),
    cards: cards.slice(0, SYNC_LIMITS.cards).filter((c) => c?.routeId),
  };
}

async function indexBy(items, keyOf, versionOf) {
  const index = new Map();
  for (const item of items) {
    index.set(await shortHash(keyOf(item)), { item, ver: await versionOf(item) });
  }
  return index;
}

/** Índice hash → { item, ver }. Posts e remoções usam o id (mesma chave); cartões, o routeId e o conteúdo. */
export async function buildInventory({ posts = [], dels = [], cards = [] }) {
  return {
    posts: await indexBy(posts, (p) => p.id, itemVersion),
    dels: await indexBy(dels, (t) => t.id, itemVersion),
    cards: await indexBy(cards, (c) => c.routeId, (c) => shortHash(cardContent(c))),
  };
}

const entries = (index) => [...index].map(([hash, { ver }]) => [hash, ver]);

export function inventoryMessage(inv, nonce, fromPeer) {
  return { type: SYNC_INV, v: 1, nonce, posts: entries(inv.posts), dels: entries(inv.dels), cards: entries(inv.cards), fromPeer };
}

const validVersion = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0) || (typeof v === "string" && HASH_RE.test(v));

function parseEntries(list, max) {
  if (!Array.isArray(list) || list.length > max) return null;
  const ok = list.every((e) => Array.isArray(e) && e.length === 2 && HASH_RE.test(e[0]) && validVersion(e[1]));
  return ok ? list : null;
}

/** Inventário recebido, validado; null se malformado ou grande demais. */
export function parseInventory(msg) {
  if (msg?.v !== 1 || !NONCE_RE.test(String(msg.nonce || ""))) return null;
  const posts = parseEntries(msg.posts, SYNC_LIMITS.posts);
  const dels = parseEntries(msg.dels, SYNC_LIMITS.dels);
  const cards = parseEntries(msg.cards, SYNC_LIMITS.cards);
  return posts && dels && cards ? { nonce: msg.nonce, posts, dels, cards } : null;
}

/** O que pedir: post que não tenho (nem versão igual ou mais nova, nem remoção mais nova), remoção nova, cartão diferente. */
export function computeWants(remote, local) {
  const lacks = (index, hash, ver) => !(Number(index.get(hash)?.ver) >= ver);
  return {
    posts: remote.posts.filter(([h, v]) => lacks(local.posts, h, v) && lacks(local.dels, h, v)).map(([h]) => h),
    dels: remote.dels.filter(([h, v]) => lacks(local.dels, h, v)).map(([h]) => h),
    cards: remote.cards.filter(([h, c]) => local.cards.get(h)?.ver !== c).map(([h]) => h),
  };
}

function parseHashes(list, max) {
  return Array.isArray(list) && list.length <= max && list.every((h) => HASH_RE.test(h)) ? list : null;
}

export function parseWant(msg) {
  const posts = parseHashes(msg?.posts, SYNC_LIMITS.posts);
  const dels = parseHashes(msg?.dels, SYNC_LIMITS.dels);
  const cards = parseHashes(msg?.cards, SYNC_LIMITS.cards);
  return posts && dels && cards ? { ackOf: String(msg.ackOf || ""), posts, dels, cards } : null;
}

/** Só serve o que está no próprio recorte compartilhado (a mesma exposição do envio completo). */
export function messagesForWant(want, inv) {
  const pick = (index, hashes) => hashes.map((h) => index.get(h)?.item).filter(Boolean);
  return [
    ...pick(inv.dels, want.dels).map((t) => ({ type: "GOSSIP_DELETE", item: t, tombstone: t })),
    ...pick(inv.posts, want.posts).map((p) => ({ type: "GOSSIP", item: p })),
    ...pick(inv.cards, want.cards).map((c) => ({ type: "PROFILE_CARD", card: c })),
  ];
}

const noBlob = async () => null;
/** Bytes do blob pelo que de fato viaja (`data`), não pelo `byteLength` declarado. */
const blobBytes = (blob) => Math.ceil(String(blob?.data || "").length * 0.75);

/** PM-88: põe o blob do `mediaHash` ao lado de cada GOSSIP, dentro de SYNC_BLOB_LIMITS (mais novos primeiro). */
export async function attachBlobs(messages, loadBlob = noBlob) {
  let budget = SYNC_BLOB_LIMITS.perConnection;
  const out = [];
  for (const m of messages) {
    const hash = m.type === "GOSSIP" ? m.item?.mediaHash : "";
    const blob = hash ? await loadBlob(m.item) : null;
    const size = blobBytes(blob);
    const fits = Boolean(blob) && blob.hash === hash && size <= SYNC_BLOB_LIMITS.perBlob && size <= budget;
    if (fits) budget -= size;
    out.push(fits ? { ...m, blob } : m);
  }
  return out;
}

/** Envio completo de antes, para cliente que não fala inventário; posts com foto levam o blob (PM-88). */
export async function sendFullState(sendFn, shared, fromPeer, loadBlob = noBlob) {
  for (const card of shared.cards) sendFn({ type: "PROFILE_CARD", card, fromPeer });
  for (const t of shared.dels) sendFn({ type: "GOSSIP_DELETE", item: t, tombstone: t, fromPeer });
  const posts = await attachBlobs(shared.posts.map((item) => ({ type: "GOSSIP", item })), loadBlob);
  for (const m of posts) sendFn({ ...m, fromPeer });
}

const newNonce = () => toB64Url(crypto.getRandomValues(new Uint8Array(9)));

/** Passo 1: arma o prazo do envio completo e manda o inventário desta conexão. */
async function announce(sendFn, deps, pending) {
  const shared = await deps.loadShared();
  const inv = await buildInventory(shared);
  const nonce = newNonce();
  const timer = deps.setTimer(() => {
    pending.delete(nonce);
    return sendFullState(sendFn, shared, deps.fromPeer, deps.loadBlob).catch(() => {});
  }, LEGACY_FALLBACK_MS);
  pending.set(nonce, timer);
  sendFn(inventoryMessage(inv, nonce, deps.fromPeer));
  return nonce;
}

/** Passo 2: compara o inventário recebido com tudo o que o aparelho tem e pede o que falta. */
async function answerInventory(msg, replyFn, deps) {
  const remote = parseInventory(msg);
  if (!remote) return null;
  const wants = computeWants(remote, await buildInventory(await deps.loadAll()));
  replyFn({ type: SYNC_WANT, v: 1, ackOf: remote.nonce, ...wants, fromPeer: deps.fromPeer });
  return wants;
}

/** Passo 3: o pedido confirma que o outro lado fala inventário (cancela o prazo) e recebe só o que pediu. */
async function serveWant(msg, replyFn, deps, pending) {
  const want = parseWant(msg);
  if (!want) return 0;
  if (pending.has(want.ackOf)) deps.clearTimer(pending.get(want.ackOf));
  pending.delete(want.ackOf);
  const out = await attachBlobs(messagesForWant(want, await buildInventory(await deps.loadShared())), deps.loadBlob);
  for (const m of out) replyFn({ ...m, fromPeer: deps.fromPeer });
  return out.length;
}

/**
 * `deps`: { fromPeer, loadShared(), loadAll(), loadBlob(post)?, setTimer(fn, ms), clearTimer(id) }.
 * `loadShared` devolve o recorte de selectShared; `loadAll`, tudo o que o aparelho tem (para decidir o que pedir);
 * `loadBlob`, o blob do `mediaHash` do post (ou null).
 */
export function createPeerSync(deps) {
  const pending = new Map();
  return {
    onConnect: (sendFn) => announce(sendFn, deps, pending),
    onInventory: (msg, replyFn) => answerInventory(msg, replyFn, deps),
    onWant: (msg, replyFn) => serveWant(msg, replyFn, deps, pending),
  };
}

async function loadState() {
  const [tombstones, posts] = await Promise.all([cacheNode.getAllTombstones(), cacheNode.getWirePosts()]);
  return { posts, tombstones, cards: profileDirectory.listDiscoverableProfileCards() };
}

/** Blob guardado em memória ou, depois de recarregar, remontado da mídia do registro (`MEDIA_FIELD`). */
async function loadLocalBlob(post) {
  const kept = mediaBlob.defaultBlobStorage.get(post.mediaHash);
  return kept || mediaBlob.blobFromLocalPost(await cacheNode.getLocalPost(post.id));
}

export function defaultPeerSyncDeps(fromPeer) {
  return {
    fromPeer,
    loadBlob: loadLocalBlob,
    loadShared: async () => selectShared(await loadState()),
    loadAll: async () => {
      const s = await loadState();
      return { posts: s.posts.filter((x) => x?.id), dels: s.tombstones.filter((x) => x?.id), cards: s.cards.filter((c) => c?.routeId) };
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
  };
}
