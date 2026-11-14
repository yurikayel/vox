/**
 * @file P-256 mínimo para a frase de recuperação (ADR-032 §3.3): escalar a partir de bytes e ponto público
 * a partir do escalar. O WebCrypto só importa chave privada EC junto com o ponto público (`x`, `y`), e nem todo
 * navegador aceita PKCS#8 sem ele; por isso o ponto é calculado aqui. Roda só no aparelho da pessoa, ao criar
 * a conta ou ao entrar pela frase. Conferido contra chaves geradas pelo próprio WebCrypto nos testes.
 */

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const A = P - 3n;
/** Ordem do grupo da P-256. */
export const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const G = {
  x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
};

const mod = (v, m = P) => ((v % m) + m) % m;

function modPow(base, exp, m) {
  let result = 1n;
  let b = mod(base, m);
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) result = (result * b) % m;
    b = (b * b) % m;
  }
  return result;
}

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
