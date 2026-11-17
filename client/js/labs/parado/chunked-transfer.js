/**
 * chunked-transfer.js — Fatiamento P2P & Backpressure sobre RTCDataChannel (Vox)
 *
 * Garante que transferências de blobs, mídias e posts grandes (>16 KiB) trafeguem
 * sem estourar buffers WebRTC e sem derrubar nós seeders móveis (Android WebView).
 */

export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16 KiB
export const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64 KiB backpressure limit

export function computeChecksum(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function slicePayloadIntoChunks(payload, chunkSize = DEFAULT_CHUNK_SIZE, transferId = null) {
  if (payload === undefined || payload === null) {
    throw new Error("payload é obrigatório para fatiamento");
  }
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  const xferId = transferId || `xfer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const totalChunks = Math.ceil(serialized.length / chunkSize) || 1;
  const chunks = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const slice = serialized.slice(start, start + chunkSize);
    chunks.push({
      type: "CHUNK",
      transferId: xferId,
      index: i,
      total: totalChunks,
      data: slice,
      checksum: computeChecksum(slice),
    });
  }
  return chunks;
}

export class ChunkReassembler {
  constructor() {
    this.transfers = new Map();
  }

  addChunk(chunkMsg) {
    if (!chunkMsg || chunkMsg.type !== "CHUNK" || !chunkMsg.transferId) {
      return { valid: false, complete: false, error: "Mensagem de chunk inválida" };
    }
    const { transferId, index, total, data, checksum } = chunkMsg;
    if (computeChecksum(data) !== checksum) {
      return { valid: false, complete: false, error: "Checksum incorreto no chunk" };
    }

    if (!this.transfers.has(transferId)) {
      this.transfers.set(transferId, {
        total,
        received: new Map(),
        createdAt: Date.now(),
      });
    }

    const t = this.transfers.get(transferId);
    t.received.set(index, data);

    const isComplete = t.received.size === total;
    const progress = t.received.size / total;

    if (!isComplete) {
      return { valid: true, complete: false, progress, transferId };
    }

    return this.assemble(transferId, t);
  }

  assemble(transferId, transferRecord) {
    const parts = [];
    for (let i = 0; i < transferRecord.total; i++) {
      parts.push(transferRecord.received.get(i) || "");
    }
    const fullText = parts.join("");
    this.transfers.delete(transferId);

    return {
      valid: true,
      complete: true,
      progress: 1.0,
      transferId,
      payload: fullText,
    };
  }

  getMissingIndices(transferId) {
    const t = this.transfers.get(transferId);
    if (!t) return [];
    const missing = [];
    for (let i = 0; i < t.total; i++) {
      if (!t.received.has(i)) missing.push(i);
    }
    return missing;
  }

  clearTransfer(transferId) {
    return this.transfers.delete(transferId);
  }
}

export async function sendChunksWithBackpressure(dataChannel, chunks, onProgress = null) {
  if (!dataChannel || typeof dataChannel.send !== "function") {
    throw new Error("dataChannel com método send() é mandatário");
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await waitForBackpressure(dataChannel);
    dataChannel.send(JSON.stringify(chunk));
    if (typeof onProgress === "function") {
      onProgress(i + 1, chunks.length);
    }
  }
  return true;
}

function waitForBackpressure(dataChannel) {
  if (dataChannel.bufferedAmount === undefined || dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let cleanup = null;
    const timer = setInterval(() => {
      if (dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
        clearInterval(timer);
        if (cleanup) cleanup();
        resolve();
      }
    }, 20);

    if (typeof dataChannel.addEventListener === "function") {
      const onLow = () => {
        clearInterval(timer);
        dataChannel.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      cleanup = () => dataChannel.removeEventListener("bufferedamountlow", onLow);
      dataChannel.addEventListener("bufferedamountlow", onLow);
    }
  });
}
