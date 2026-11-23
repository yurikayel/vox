/**
 * @module qr-url-codec
 * Byte-mode payload for QR versions 2–9 and 11, ECC L. Versions 6–9 split the data into 2 Reed–Solomon
 * blocks and version 11 into 4, interleaved codeword by codeword (ISO/IEC 18004 §7.6). The byte count is
 * 8 bits up to version 9 and 16 bits from version 10. Version 10 is skipped: at ECC L it mixes blocks of
 * two sizes (2×68 + 2×69), which this codec does not do; a payload past version 9 goes to 11.
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
  11: { data: 324, ec: 20, blocks: 4, maxBytes: 321 },
};

const ORDERED_VERSIONS = Object.keys(VERSIONS).map(Number).sort((a, b) => a - b);
const MAX_VERSION = ORDERED_VERSIONS[ORDERED_VERSIONS.length - 1];

/** Largest URL, in bytes, that fits in the largest supported version. */
export const QR_MAX_BYTES = VERSIONS[MAX_VERSION].maxBytes;

/**
 * Bits of the byte-mode character count for a version.
 * @param {number} version
 * @returns {8|16}
 */
export function countBits(version) {
  return version <= 9 ? 8 : 16;
}

/** Expressão que reconhece rotas válidas para QR compartilhável do Vox. */
export const VOX_SHARE_HASH = /#\/(t|connect|c|sync|guardiao)(\/|\?|$)/;

/**
 * Indica se a URL pertence às rotas compartilháveis do Vox aceitas no QR.
 * @param {string} url URL candidata.
 * @returns {boolean} `true` quando casa com `VOX_SHARE_HASH`.
 */
export function isVoxShareUrl(url) {
  return VOX_SHARE_HASH.test(String(url || ""));
}

/**
 * Normaliza e valida que a URL é uma rota compartilhável do Vox.
 * @param {string} url URL candidata.
 * @returns {string} URL limpa.
 */
export function assertVoxShareUrl(url) {
  const text = String(url || "").trim();
  if (!isVoxShareUrl(text)) {
    throw new Error("QR: expected Vox share URL (#/t/, #/connect/, #/c/, #/sync or #/guardiao)");
  }
  return text;
}

/**
 * Converte uma string ASCII imprimível em array de bytes para o modo byte do QR.
 * @param {string} url URL em ASCII imprimível.
 * @returns {number[]} Bytes (0–126).
 */
export function urlToBytes(url) {
  const out = [];
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    if (c < 32 || c > 126) throw new Error("QR URL must be printable ASCII");
    out.push(c);
  }
  return out;
}

/**
 * Escolhe a menor versão QR suportada (2–9 ou 11) capaz de comportar `byteLen`.
 * @param {number} byteLen Quantidade de bytes do payload.
 * @returns {number} Número da versão QR escolhida.
 */
export function chooseVersion(byteLen) {
  const version = ORDERED_VERSIONS.find((v) => byteLen <= VERSIONS[v].maxBytes);
  if (version) return version;
  throw new Error(`QR: URL too long for versions 2–${MAX_VERSION} (max ${QR_MAX_BYTES} bytes)`);
}

/**
 * Empurra `n` bits menos significativos de `value` (MSB primeiro) em `bits`.
 * @param {number[]} bits Buffer de bits.
 * @param {number} value Inteiro fonte.
 * @param {number} n Quantidade de bits.
 * @returns {void}
 */
export function pushBits(bits, value, n) {
  for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

/**
 * Completa os bits com terminador e preenchimento até a capacidade.
 * @param {number[]} bits Bits do dado
 * @param {number} cap Capacidade em bits
 */
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

/**
 * Agrupa bits em palavras-código de 8 bits.
 * @param {number[]} bits Bits
 * @param {number} n Quantidade de palavras
 * @returns {Uint8Array} Palavras-código.
 */
function bitsToCodewords(bits, n) {
  const cw = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i * 8 + j] || 0);
    cw[i] = v;
  }
  return cw;
}

/**
 * Codifica `bytes` no modo byte (0100) do QR com terminador e padding até `dataCodewords`.
 * @param {number[]} bytes Bytes do payload.
 * @param {number} dataCodewords Total de codewords de dados da versão.
 * @param {number} [version=2] Versão QR alvo.
 * @returns {Uint8Array} Codewords preenchidos.
 */
export function encodeBytePayload(bytes, dataCodewords, version = 2) {
  const cap = dataCodewords * 8;
  const bits = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, countBits(version));
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

/**
 * Intercala os blocos de palavras-código, coluna a coluna.
 * @param {number[][]} blocks Blocos
 * @returns {number[]} Palavras intercaladas.
 */
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

/**
 * Decodifica uma string do fluxo de bits de dados no modo byte do QR.
 * @param {number[]} bits Fluxo de bits em ordem de bloco.
 * @param {number} [version=2] Versão QR (define largura da contagem: 8 ou 16 bits).
 * @returns {string} Texto decodificado.
 */
export function parseBytePayload(bits, version = 2) {
  let pos = 0;
  /**
   * Lê `n` bits como inteiro, avançando a posição.
   * @param {number} n Quantidade de bits
   * @returns {number} Valor lido.
   */
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | (bits[pos++] || 0);
    return v;
  };
  if (take(4) !== 0b0100) throw new Error("QR: expected byte mode");
  const len = take(countBits(version));
  let out = "";
  for (let i = 0; i < len; i++) out += String.fromCharCode(take(8));
  return out;
}
