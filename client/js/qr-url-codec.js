/** Byte-mode payload for QR versions 2–5, ECC L (single RS block). */

export const VERSIONS = {
  2: { data: 34, ec: 10, maxBytes: 32 },
  3: { data: 55, ec: 15, maxBytes: 53 },
  4: { data: 80, ec: 20, maxBytes: 78 },
  5: { data: 108, ec: 26, maxBytes: 106 },
};

export const VOX_SHARE_HASH = /#\/(t|connect|c)\//;

export function isVoxShareUrl(url) {
  return VOX_SHARE_HASH.test(String(url || ""));
}

export function assertVoxShareUrl(url) {
  const text = String(url || "").trim();
  if (!isVoxShareUrl(text)) {
    throw new Error("QR: expected Vox share URL (#/t/, #/connect/, or #/c/)");
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
  for (const v of [2, 3, 4, 5]) {
    if (byteLen <= VERSIONS[v].maxBytes) return v;
  }
  throw new Error("QR: URL too long for versions 2–5 (max 106 bytes)");
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

export function codewordsToBits(data, ecc) {
  const bits = [];
  for (const block of [data, ecc]) {
    for (const cw of block) {
      for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1);
    }
  }
  return bits;
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
