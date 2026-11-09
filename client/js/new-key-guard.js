/**
 * LAN-14 — chave nova: prova de trabalho leve (PoW) e quarentena por comunidade.
 *
 * Sem servidor e sem ranking pago. Cada aparelho anota quando viu cada chave pela primeira vez.
 * Uma comunidade pode pedir quarentena (`newKeyQuarantine: true` no registro dela, na criação):
 * post de chave que este aparelho conhece há menos de NEW_KEY_AGE_MS fica recolhido, a menos
 * que traga PoW de pelo menos POW_BITS bits. Quem publica numa comunidade assim calcula o PoW
 * antes de assinar (o campo `pow` entra na assinatura).
 *
 * Aparelho novo: nas primeiras NEW_KEY_AGE_MS ele só aprende. Quem ele viu nesse período
 * conta como conhecido, para não recolher a comunidade inteira de quem acabou de instalar.
 *
 * Parâmetros (ajuste aqui e em docs/strategy/backlog-lancamento-publico-2026-11.md):
 *   NEW_KEY_AGE_MS = 24 h · POW_BITS = 14 (≈16 mil SHA-256 em média, ~1 s num celular de entrada).
 */

export const NEW_KEY_AGE_MS = 24 * 60 * 60 * 1000;
export const POW_BITS = 14;
export const FIRST_SEEN_STORAGE_KEY = "vox-key-first-seen-v1";
const MAX_TRACKED_KEYS = 10000;
const POW_BATCH = 64;
const POW_MAX_TRIES = 1 << 22;

/** Bits zero no começo do hash (NIP-13 usa a mesma conta). */
export function leadingZeroBits(bytes) {
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(b) - 24;
  }
  return bits;
}

async function powDigest(author, id, nonce) {
  const data = new TextEncoder().encode(`vox-pow:${author}:${id}:${nonce}`);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/** Acha um nonce cujo hash, preso a autor e id, tem `bits` zeros no começo. */
export async function mintPow({ author, id, bits = POW_BITS }) {
  if (!author || !id) throw new Error("PoW precisa de autor e id.");
  for (let start = 0; start < POW_MAX_TRIES; start += POW_BATCH) {
    const nonces = Array.from({ length: POW_BATCH }, (_, i) => start + i);
    const digests = await Promise.all(nonces.map((n) => powDigest(author, id, n)));
    const hit = digests.findIndex((d) => leadingZeroBits(d) >= bits);
    if (hit >= 0) return { nonce: nonces[hit], bits };
  }
  throw new Error("PoW não encontrado.");
}

/** Recalcula o hash: não confia no `bits` declarado. */
export async function hasValidPow(item, minBits = POW_BITS) {
  const nonce = Number(item?.pow?.nonce);
  if (!item?.author || !item?.id || !Number.isSafeInteger(nonce) || nonce < 0) return false;
  return leadingZeroBits(await powDigest(item.author, item.id, nonce)) >= minBits;
}

function readBook(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(FIRST_SEEN_STORAGE_KEY) || "null");
    if (parsed && Number.isFinite(parsed.since) && parsed.keys && typeof parsed.keys === "object") return parsed;
  } catch {}
  return null;
}

function saveBook(storage, book) {
  try {
    storage?.setItem(FIRST_SEEN_STORAGE_KEY, JSON.stringify(book));
  } catch {}
}

/** Passou do teto: esquece as chaves mais antigas do caderno. */
function trimKeys(keys) {
  const names = Object.keys(keys);
  if (names.length <= MAX_TRACKED_KEYS) return;
  names.sort((a, b) => keys[a] - keys[b]);
  for (const k of names.slice(0, names.length - MAX_TRACKED_KEYS)) delete keys[k];
}

/**
 * Caderno de "primeira vez que vi esta chave", só neste aparelho.
 * @param {{ storage?: Storage | null, now?: () => number, ageMs?: number }} [opts]
 */
export function createKeyAgeBook({ storage = globalThis.localStorage, now = () => Date.now(), ageMs = NEW_KEY_AGE_MS } = {}) {
  let book = null;
  function load() {
    if (!book) book = readBook(storage) || { since: now(), keys: {} };
    return book;
  }

  /** Anota a chave (se ainda não estava) e devolve quando ela foi vista pela primeira vez. */
  function noteSeen(author) {
    if (!author) return now();
    const b = load();
    if (!Number.isFinite(b.keys[author])) {
      b.keys[author] = now();
      trimKeys(b.keys);
      saveBook(storage, b);
    }
    return b.keys[author] ?? now();
  }

  /** true se este aparelho conhece a chave há menos de `ageMs` (fora do período de aprendizado). */
  function isNewKey(author) {
    const first = noteSeen(author);
    const b = load();
    if (first - b.since < ageMs) return false;
    return now() - first < ageMs;
  }

  return { noteSeen, isNewKey };
}

const defaultBook = createKeyAgeBook();

export const noteKeySeen = (author) => defaultBook.noteSeen(author);

/** A comunidade pediu quarentena de chave nova? */
export function wantsNewKeyQuarantine(community) {
  return Boolean(community?.newKeyQuarantine);
}

/**
 * Ids dos posts recolhidos pela quarentena da comunidade: chave nova, sem PoW suficiente,
 * que não é do dono da comunidade nem de quem está vendo.
 */
export async function heldByQuarantine(topics, community, opts = {}) {
  const held = new Set();
  if (!wantsNewKeyQuarantine(community)) return held;
  const { viewer = "", book = defaultBook, minBits = POW_BITS } = opts;
  const exempt = new Set([community.owner, community.author, viewer].filter(Boolean));
  for (const t of topics || []) {
    if (!isQuarantineCandidate(t, exempt, book)) continue;
    if (!(await hasValidPow(t, minBits))) held.add(t.id);
  }
  return held;
}

/** Tem autor, não está isento (dono, quem vê) e a chave é nova neste aparelho. */
function isQuarantineCandidate(topic, exempt, book) {
  const author = topic?.author;
  return Boolean(author) && !exempt.has(author) && book.isNewKey(author);
}

const revealed = new Set();

/** "Ver mesmo assim": mostra os recolhidos desta comunidade até recarregar o app. */
export function revealHeld(communityId) {
  revealed.add(communityId);
}

export function isHeldRevealed(communityId) {
  return revealed.has(communityId);
}

/** Calcula e anexa o PoW antes de assinar, se a comunidade pede quarentena. */
export async function attachPowIfWanted(payload, community, author) {
  if (!wantsNewKeyQuarantine(community) || !author || !payload?.id) return payload;
  payload.pow = await mintPow({ author, id: payload.id });
  return payload;
}
