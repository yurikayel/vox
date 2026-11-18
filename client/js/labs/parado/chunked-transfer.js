/**
 * chunked-transfer.js — Fatiamento P2P & Backpressure sobre RTCDataChannel (Vox)
 *
 * Garante que transferências de blobs, mídias e posts grandes (>16 KiB) trafeguem
 * sem estourar buffers WebRTC e sem derrubar nós seeders móveis (Android WebView).
 */

import { randomBase36 } from "../../shared/html.js";

export const DEFAULT_CHUNK_SIZE = 16 * 1024; // 16 KiB
export const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64 KiB backpressure limit
/** Intervalo do poll de backpressure enquanto o buffer do canal está cheio (ms). */
/** @type {number} */
export const BACKPRESSURE_POLL_MS = 20;

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
  const xferId = transferId || `xfer_${Date.now()}_${randomBase36(7)}`;
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

  /** Libera transferências parciais ao desmontar o consumidor. */
  dispose() {
    this.transfers.clear();
  }
}

/**
 * Envia chunks respeitando backpressure do RTCDataChannel.
 * @param {object} dataChannel
 * @param {object[]} chunks
 * @param {((sent: number, total: number) => void)|null} [onProgress]
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<boolean>}
 */
export async function sendChunksWithBackpressure(dataChannel, chunks, onProgress = null, options = null) {
  if (!dataChannel || typeof dataChannel.send !== "function") {
    throw new Error("dataChannel com método send() é mandatário");
  }
  const signal = options?.signal ?? null;

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    const chunk = chunks[i];
    await waitForBackpressure(dataChannel, { signal });
    dataChannel.send(JSON.stringify(chunk));
    if (typeof onProgress === "function") {
      onProgress(i + 1, chunks.length);
    }
  }
  return true;
}

function abortBackpressureReason(signal) {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function releaseBackpressureWait(state, dataChannel, signal) {
  if (state.timer !== null) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (typeof dataChannel.removeEventListener === "function") {
    if (state.onLow) dataChannel.removeEventListener("bufferedamountlow", state.onLow);
    if (state.onClose) dataChannel.removeEventListener("close", state.onClose);
    if (state.onError) dataChannel.removeEventListener("error", state.onError);
  }
  if (state.onAbort && signal?.removeEventListener) {
    signal.removeEventListener("abort", state.onAbort);
  }
}

function startBackpressureWait(dataChannel, signal) {
  const state = { settled: false, timer: null, onLow: null, onClose: null, onError: null, onAbort: null };
  return new Promise((resolve, reject) => {
    const finish = (err) => {
      if (state.settled) return;
      state.settled = true;
      releaseBackpressureWait(state, dataChannel, signal);
      if (err) reject(err);
      else resolve();
    };

    state.timer = setInterval(() => {
      if (dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) finish();
    }, BACKPRESSURE_POLL_MS);

    if (signal?.addEventListener) {
      state.onAbort = () => finish(abortBackpressureReason(signal));
      signal.addEventListener("abort", state.onAbort);
    }
    if (typeof dataChannel.addEventListener !== "function") return;

    state.onLow = () => finish();
    dataChannel.addEventListener("bufferedamountlow", state.onLow);
    state.onClose = () => finish(new Error("RTCDataChannel fechado durante backpressure"));
    dataChannel.addEventListener("close", state.onClose);
    state.onError = () => finish(new Error("RTCDataChannel em erro durante backpressure"));
    dataChannel.addEventListener("error", state.onError);
  });
}

/**
 * Aguarda bufferedAmount baixar; cancela timers e listeners em abort/fechamento.
 * @param {object} dataChannel
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<void>}
 */
export function waitForBackpressure(dataChannel, options = null) {
  const signal = options?.signal ?? null;
  if (dataChannel.bufferedAmount === undefined || dataChannel.bufferedAmount <= MAX_BUFFERED_AMOUNT) {
    return Promise.resolve();
  }
  if (signal?.aborted) {
    return Promise.reject(abortBackpressureReason(signal));
  }
  return startBackpressureWait(dataChannel, signal);
}