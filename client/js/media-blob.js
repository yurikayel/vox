// Vox Media Blob - Content-Addressed P2P Media Blobs (SHA-256)
// Separa o tráfego pesado de mídia base64 do mesh leve de fofocas JSON.
import { MEDIA_FIELD } from "./post-wire.js";

const DATA_URL_REGEX = /^data:([a-zA-Z0-9/+.-]+);base64,([A-Za-z0-9+/=\r\n]+)$/;

export function isDataUrl(str) {
  return typeof str === "string" && DATA_URL_REGEX.test(str.trim());
}

export function parseDataUrl(dataUrl) {
  if (!isDataUrl(dataUrl)) {
    throw new Error("Formato de Data URL inválido ou não suportado");
  }
  const match = dataUrl.trim().match(DATA_URL_REGEX);
  const mime = match[1];
  const base64 = match[2].replace(/[\r\n]/g, "");
  const padding = (base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0));
  const byteLength = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  return { mime, base64, byteLength };
}

export function base64ToUint8Array(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  throw new Error("Ambiente sem suporte a decodificação base64");
}

export function dataUrlToUint8Array(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  return base64ToUint8Array(parsed.base64);
}

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeBlobHash(data) {
  if (!data) throw new Error("Dados não fornecidos para cálculo de hash");
  let bytes;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (isDataUrl(data)) {
    const parsed = parseDataUrl(data);
    bytes = base64ToUint8Array(parsed.base64);
  } else if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else {
    throw new Error("Tipo de dados não suportado para cálculo de hash");
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SubtleCrypto não disponível neste ambiente");
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
}

export async function createMediaRef(dataUrl, metadata = {}) {
  const parsed = parseDataUrl(dataUrl);
  const hash = await computeBlobHash(dataUrl);
  return {
    hash,
    mime: parsed.mime,
    byteLength: parsed.byteLength,
    ...metadata,
  };
}

export async function detachMedia(post) {
  if (!post || typeof post !== "object") {
    return { detachedPost: post, mediaBlob: null };
  }
  if (typeof post.image !== "string" || !isDataUrl(post.image)) {
    return { detachedPost: { ...post }, mediaBlob: null };
  }

  const mediaRef = await createMediaRef(post.image);
  const detachedPost = {
    ...post,
    image: null,
    mediaRef,
    // PM-87: a assinatura só cobre chaves de primeiro nível (PM-85); o hash vai também aqui para ficar coberto.
    mediaHash: mediaRef.hash,
  };

  const mediaBlob = {
    hash: mediaRef.hash,
    mime: mediaRef.mime,
    byteLength: mediaRef.byteLength,
    data: post.image,
  };

  return { detachedPost, mediaBlob };
}

/** Campo de tela (`video`, `audio` ou `image`) com os dados do blob do `mediaRef`; null se o blob não é deste post. */
export function mediaFields(post, mediaBlob) {
  if (!post || typeof post !== "object") return null;
  if (!mediaBlob || typeof mediaBlob !== "object") return null;
  if (!mediaBlob.hash || (post.mediaHash || post.mediaRef?.hash) !== mediaBlob.hash) return null;
  return { [mediaKind(mediaBlob.mime || post.mediaRef?.mime)]: mediaBlob.data };
}

/** Campo de tela de um mime: `video`, `audio` ou, por omissão, `image`. */
function mediaKind(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "image";
}

/** PM-88: blob do `mediaHash` remontado do post de tela (com `MEDIA_FIELD` aplicado); null sem mídia local. */
export function blobFromLocalPost(post) {
  const hash = typeof post?.mediaHash === "string" ? post.mediaHash : "";
  const data = hash ? post[mediaKind(post.mediaRef?.mime)] : null;
  if (!isDataUrl(data)) return null;
  const { mime, byteLength } = parseDataUrl(data);
  return { hash, mime, byteLength, data };
}

/** Post com a mídia do blob em `MEDIA_FIELD`, fora da forma assinada; sem blob do post, o post como veio. */
export function withLocalMedia(post, mediaBlob) {
  const fields = mediaFields(post, mediaBlob);
  return fields ? { ...post, [MEDIA_FIELD]: fields } : post;
}

/** PM-87: blob do `mediaHash` assinado — o que veio junto com o post (se o conteúdo bate) ou o já guardado. */
export async function blobForPost(post, mediaBlob) {
  const hash = typeof post?.mediaHash === "string" ? post.mediaHash : "";
  if (!hash) return null;
  if (mediaBlob?.hash !== hash || !(await verifyMediaBlob(mediaBlob))) return defaultBlobStorage.get(hash);
  if (!defaultBlobStorage.has(hash)) await defaultBlobStorage.put(mediaBlob);
  return mediaBlob;
}

export async function verifyMediaBlob(mediaBlob) {
  if (!mediaBlob || !mediaBlob.hash || !mediaBlob.data) return false;
  try {
    const computed = await computeBlobHash(mediaBlob.data);
    return computed === mediaBlob.hash;
  } catch {
    return false;
  }
}

let blobMemorySink = null;

export function registerBlobMemorySink(fn) {
  blobMemorySink = typeof fn === "function" ? fn : null;
}

// Armazenamento em memória / LRU leve
class BlobStorage {
  constructor(maxItems = 100) {
    this.maxItems = maxItems;
    this.map = new Map();
  }

  async put(blob) {
    if (!blob || !blob.hash) throw new Error("Blob inválido");
    const valid = await verifyMediaBlob(blob);
    if (!valid) throw new Error("Integridade do blob falhou (hash mismatch)");

    if (this.map.has(blob.hash)) {
      this.map.delete(blob.hash);
    } else if (this.map.size >= this.maxItems) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    this.map.set(blob.hash, blob);
    if (blobMemorySink) blobMemorySink({ type: "MEDIA_BLOB", blob });
    return true;
  }

  get(hash) {
    const item = this.map.get(hash);
    if (!item) return null;
    this.map.delete(hash);
    this.map.set(hash, item);
    return item;
  }

  has(hash) {
    return this.map.has(hash);
  }

  delete(hash) {
    return this.map.delete(hash);
  }

  clear() {
    this.map.clear();
  }

  size() {
    return this.map.size;
  }
}

export const defaultBlobStorage = new BlobStorage(150);
