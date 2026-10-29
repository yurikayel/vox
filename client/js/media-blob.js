// Vox Media Blob - Content-Addressed P2P Media Blobs (SHA-256)
// Separa o tráfego pesado de mídia base64 do mesh leve de fofocas JSON.

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
  };

  const mediaBlob = {
    hash: mediaRef.hash,
    mime: mediaRef.mime,
    byteLength: mediaRef.byteLength,
    data: post.image,
  };

  return { detachedPost, mediaBlob };
}

export function attachMedia(post, mediaBlob) {
  if (!post || typeof post !== "object") return post;
  if (!mediaBlob || typeof mediaBlob !== "object") return post;
  if (!post.mediaRef || post.mediaRef.hash !== mediaBlob.hash) return post;

  const mime = String(mediaBlob.mime || post.mediaRef.mime || "").toLowerCase();
  if (mime.startsWith("video/")) {
    return { ...post, video: mediaBlob.data };
  }
  if (mime.startsWith("audio/")) {
    return { ...post, audio: mediaBlob.data };
  }
  return {
    ...post,
    image: mediaBlob.data,
  };
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

export function formatBlobSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
