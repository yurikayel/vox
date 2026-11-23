/**
 * @file P-256 mínimo para a frase de recuperação (ADR-032 §3.3): escalar a partir de bytes e ponto público
 * a partir do escalar. O WebCrypto só importa chave privada EC junto com o ponto público (`x`, `y`), e nem todo
 * navegador aceita PKCS#8 sem ele; por isso o ponto é calculado aqui. Roda só no aparelho da pessoa, ao criar
 * a conta ou ao entrar pela frase. Conferido contra chaves geradas pelo próprio WebCrypto nos testes.
 * Também comprime e descomprime o ponto público (SEC 1 §2.3.3–2.3.4), para a chave temporária caber no link de
 * pedido dos guardiões.
 */

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
/** Ordem do grupo da P-256. */
export const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const G = {
  x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
};

/**
 * Resto não negativo de `v` módulo `m`.
 *
 * @param {bigint} v
 * @param {bigint} [m=P]
 * @returns {bigint}
 */
const mod = (v, m = P) => ((v % m) + m) % m;

/**
 * Exponenciação modular por quadrados.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} m
 * @returns {bigint}
 */
function modPow(base, exp, m) {
  let result = 1n;
  let b = mod(base, m);
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
  }
  return result;
}

/**
 * Inverso modular no corpo P-256 (pequeno teorema de Fermat).
 *
 * @param {bigint} v
 * @returns {bigint}
 */
const inverse = (v) => modPow(v, P - 2n, P);

/** Dobra um ponto em coordenadas jacobianas (X, Y, Z). */
function double(pt) {
  if (pt.z === 0n || pt.y === 0n) return { x: 0n, y: 1n, z: 0n };
  const yy = mod(pt.y * pt.y);
  const s = mod(4n * pt.x * yy);
  const zz = mod(pt.z * pt.z);
  const m = mod(3n * pt.x * pt.x + A * zz * zz);
  const x = mod(m * m - 2n * s);
  return { x, y: mod(m * (s - x) - 8n * yy * yy), z: mod(2n * pt.y * pt.z) };
}

/** Soma de dois pontos jacobianos. */
function add(p1, p2) {
  if (p1.z === 0n) return p2;
  if (p2.z === 0n) return p1;
  const z1z1 = mod(p1.z * p1.z);
  const z2z2 = mod(p2.z * p2.z);
  const u1 = mod(p1.x * z2z2);
  const u2 = mod(p2.x * z1z1);
  const s1 = mod(p1.y * p2.z * z2z2);
  const s2 = mod(p2.y * p1.z * z1z1);
  if (u1 === u2) return s1 === s2 ? double(p1) : { x: 0n, y: 1n, z: 0n };
  const h = mod(u2 - u1);
  const r = mod(s2 - s1);
  const hh = mod(h * h);
  const hhh = mod(h * hh);
  const x = mod(r * r - hhh - 2n * u1 * hh);
  return { x, y: mod(r * (u1 * hh - x) - s1 * hhh), z: mod(h * p1.z * p2.z) };
}

/**
 * Bytes big-endian para inteiro.
 * @param {Uint8Array} bytes
 * @returns {bigint}
 */
export function bytesToBigInt(bytes) {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/**
 * Inteiro para 32 bytes big-endian.
 * @param {bigint} v
 * @returns {Uint8Array}
 */
export function bigIntTo32Bytes(v) {
  const out = new Uint8Array(32);
  let rest = v;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/**
 * Escalar privado a partir de bytes aleatórios (FIPS 186-5, A.2.1: 64 bits a mais e redução mod n−1, +1),
 * sempre em [1, n−1] e sem viés mensurável. Espera 40 bytes ou mais.
 * @param {Uint8Array} bytes
 * @returns {bigint}
 */
export function scalarFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 40) throw new Error("São precisos 40 bytes ou mais.");
  return mod(bytesToBigInt(bytes), N - 1n) + 1n;
}

/**
 * Ponto público `d·G`.
 * @param {bigint} d escalar em [1, n−1]
 * @returns {{ x: bigint, y: bigint }}
 */
export function publicPoint(d) {
  if (typeof d !== "bigint" || d < 1n || d >= N) throw new Error("Chave privada fora da faixa da P-256.");
  let acc = { x: 0n, y: 1n, z: 0n };
  let base = { ...G, z: 1n };
  for (let k = d; k > 0n; k >>= 1n) {
    if (k & 1n) acc = add(acc, base);
    base = double(base);
  }
  const zInv = inverse(acc.z);
  const zInv2 = mod(zInv * zInv);
  return { x: mod(acc.x * zInv2), y: mod(acc.y * zInv2 * zInv) };
}

/**
 * Ponto comprimido: 1 byte de paridade de `y` (2 ou 3) e os 32 bytes de `x`.
 * @param {{ x: bigint, y: bigint }} point
 * @returns {Uint8Array} 33 bytes
 */
export function compressPoint({ x, y }) {
  const out = new Uint8Array(33);
  out[0] = y & 1n ? 3 : 2;
  out.set(bigIntTo32Bytes(x), 1);
  return out;
}

/**
 * Ponto a partir da forma comprimida; recusa o que não está na curva.
 * @param {Uint8Array} bytes 33 bytes
 * @returns {{ x: bigint, y: bigint }}
 */
export function decompressPoint(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 33 || (bytes[0] !== 2 && bytes[0] !== 3)) {
    throw new Error("Ponto comprimido inválido.");
  }
  const x = bytesToBigInt(bytes.subarray(1));
  if (x >= P) throw new Error("Ponto comprimido inválido.");
  const rhs = mod(x * x * x + A * x + B);
  const root = modPow(rhs, (P + 1n) / 4n, P);
  if (mod(root * root) !== rhs) throw new Error("Ponto fora da curva.");
  const y = (root & 1n) === BigInt(bytes[0] & 1) ? root : mod(-root);
  return { x, y };
}
