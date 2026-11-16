/**
 * @module qr-url-codec
 * Byte-mode payload for QR versions 2–9, ECC L. Versions 6–9 split the data into 2 Reed–Solomon
 * blocks that are interleaved codeword by codeword (ISO/IEC 18004 §7.6). Up to version 9 the byte
 * count fits in 8 bits; version 10+ would need 16.
 */

/**
 * ECC L per version: `data` = total data codewords, `ec` = EC codewords per block, `blocks` = equal blocks.
 * @type {Record<number, { data: number, ec: number, blocks: number, maxBytes: number }>}
 */
export const VERSIONS = {
  2: { data: 34, ec: 10, blocks: 1, maxBytes: 32 },
  3: { data: 55, ec: 15, blocks: 1, maxBytes: 53 },
  4: { data: 80, ec: 20, blocks: 1, maxBytes: 78 },
  5: { data: 108, ec: 26, blocks: 1, maxBytes: 106 },
  6: { data: 136, ec: 18, blocks: 2, maxBytes: 134 },
  7: { data: 156, ec: 20, blocks: 2, maxBytes: 154 },
  8: { data: 194, ec: 24, blocks: 2, maxBytes: 192 },
  9: { data: 232, ec: 30, blocks: 2, maxBytes: 230 },
};

const MAX_VERSION = 9;

export const VOX_SHARE_HASH = /#\/(t|connect|c|sync|guardiao)(\/|\?|$)/;

export function isVoxShareUrl(url) {
  return VOX_SHARE_HASH.test(String(url || ""));
}

export function assertVoxShareUrl(url) {
  const text = String(url || "").trim();
  if (!isVoxShareUrl(text)) {
    throw new Error("QR: expected Vox share URL (#/t/, #/connect/, #/c/, #/sync or #/guardiao)");
  }
  return text;
}

export function urlToBytes(url) {
  const out = [];
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error("QR URL must be printable ASCII");
    out.push(c);
  }
  return out;
}

export function chooseVersion(byteLen) {
  for (let v = 2; v <= MAX_VERSION; v++) {
    if (byteLen <= VERSIONS[v].maxBytes) return v;
  }
  throw new Error(`QR: URL too long for versions 2–${MAX_VERSION} (max ${VERSIONS[MAX_VERSION].maxBytes} bytes)`);
}

export function pushBits(bits, value, n) {
  for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

function padToCapacity(bits, cap) {
  const term = Math.min(4, Math.max(0, cap - bits.length));
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0 && bits.length < cap) bits.push(0);
  const pads = [0xec, 0x11];
  let p = 0;
  while (bits.length + 8 <= cap) {
    pushBits(bits, pads[p & 1], 8);
    p += 1;
  }
}

function bitsToCodewords(bits, n) {
  const cw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i * 8 + j] || 0);
    cw[i] = v;
  }
  return cw;
}

export function encodeBytePayload(bytes, dataCodewords) {
  const cap = dataCodewords * 8;
  const bits = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, 8);
  for (const b of bytes) pushBits(bits, b, 8);
  if (bits.length > cap) throw new Error("QR overflow");
  padToCapacity(bits, cap);
  return bitsToCodewords(bits, dataCodewords);
}

/**
 * Splits the data codewords into the version's equal RS blocks.
 * @param {Uint8Array} data
 * @param {number} blocks
 * @returns {Uint8Array[]}
 */
export function splitDataBlocks(data, blocks) {
  const len = data.length / blocks;
  return Array.from({ length: blocks }, (_, b) => data.subarray(b * len, (b + 1) * len));
}

function interleave(blocks) {
  const out = [];
  const len = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < len; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  return out;
}

/**
 * Final bit stream: data codewords interleaved across blocks, then EC codewords interleaved.
 * @param {Uint8Array[]} dataBlocks
 * @param {Uint8Array[]} eccBlocks
 * @returns {number[]}
 */
export function blocksToBits(dataBlocks, eccBlocks) {
  const bits = [];
  for (const cw of [...interleave(dataBlocks), ...interleave(eccBlocks)]) {
    for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
  }
  return bits;
}

/**
 * Inverse of the data interleave: the payload bits in block order, read from the module stream.
 * @param {number[]} bits stream as read from the grid
 * @param {{ data: number, blocks: number }} spec
 * @returns {number[]}
 */
export function deinterleaveDataBits(bits, spec) {
  const len = spec.data / spec.blocks;
  const out = [];
  for (let b = 0; b < spec.blocks; b++) {
    for (let i = 0; i < len; i++) {
      const at = (i * spec.blocks + b) * 8;
      for (let j = 0; j < 8; j++) out.push(bits[at + j] || 0);
    }
  }
  return out;
}

export function parseBytePayload(bits) {
  let pos = 0;
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[pos++] || 0);
    return v;
  };
  if (take(4) !== 0b0100) throw new Error("QR: expected byte mode");
  const len = take(8);
  let out = "";
  for (let i = 0; i < len; i++) out += String.fromCharCode(take(8));
  return out;
}
