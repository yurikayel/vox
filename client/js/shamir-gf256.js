/**
 * @file ADR-032 §3.4 / spec dos guardiões v0 §3 — divisão de Shamir em GF(256), byte a byte.
 *
 * - Corpo GF(2⁸) com o polinômio do AES (`0x11b`); soma é XOR; multiplicação por tabelas de log/antilog com
 *   gerador `0x03`.
 * - Dividir: para cada byte do segredo, um polinômio de grau M−1 com coeficientes sorteados; o pedaço `x`
 *   (1…N) leva `f(x)` de cada byte.
 * - Juntar: interpolação de Lagrange em 0 com M pedaços de `x` distintos e da mesma divisão (`splitId`).
 *
 * Puro: sem DOM, sem rede, sem guardar nada. Quem confere se o segredo juntado é o certo é quem chama
 * (o `routeId` refeito tem que ser o da dona). Vetores fixos em `tests/shamir-gf256.test.js`.
 */

/** Menor mínimo de pedaços aceito: M = 1 entregaria a conta a um guardião sozinho. */
export const MIN_M = 2;
/** Maior número de guardiões. */
export const MAX_N = 7;
/** Bytes do identificador de uma divisão. */
export const SPLIT_ID_BYTES = 16;

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);

/** Multiplica por 3 em GF(2⁸): `v·2 ⊕ v`, com a redução do AES. */
function timesThree(v) {
  const doubled = (v << 1) ^ (v & 0x80 ? 0x11b : 0);
  return doubled ^ v;
}

for (let i = 0, v = 1; i < 255; i++) {
  EXP[i] = v;
  EXP[i + 255] = v;
  LOG[v] = i;
  v = timesThree(v);
}

/**
 * Produto em GF(2⁸).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gfMul(a, b) {
  return a && b ? EXP[LOG[a] + LOG[b]] : 0;
}

/**
 * Quociente em GF(2⁸); `b` não pode ser zero.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function gfDiv(a, b) {
  if (!b) throw new RangeError("Divisão por zero em GF(256).");
  return a ? EXP[LOG[a] + 255 - LOG[b]] : 0;
}

/** Valor do polinômio (coeficientes do grau 0 ao maior) em `x`, pelo método de Horner. */
function evaluate(coeffs, x) {
  let acc = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) acc = gfMul(acc, x) ^ coeffs[i];
  return acc;
}

const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function assertParams(m, n) {
  if (!Number.isInteger(m) || !Number.isInteger(n) || m < MIN_M || n > MAX_N || m > n) {
    throw new RangeError(`Escolha de ${MIN_M} a ${MAX_N} guardiões, com mínimo entre ${MIN_M} e o total.`);
  }
}

/**
 * Divide um segredo em N pedaços; quaisquer M juntos o devolvem, M−1 não dizem nada sobre ele.
 * @param {Uint8Array} secret
 * @param {{ m: number, n: number, random?: (buf: Uint8Array) => Uint8Array }} opts `random`: só para testes
 * @returns {{ splitId: string, m: number, n: number, shares: { splitId: string, x: number, y: Uint8Array }[] }}
 */
export function splitSecret(secret, { m, n, random = (buf) => crypto.getRandomValues(buf) }) {
  assertParams(m, n);
  if (!(secret instanceof Uint8Array) || secret.length === 0) throw new TypeError("O segredo são bytes.");
  const splitId = toB64url(random(new Uint8Array(SPLIT_ID_BYTES)));
  const ys = Array.from({ length: n }, () => new Uint8Array(secret.length));
  const coeffs = new Uint8Array(m);
  for (let k = 0; k < secret.length; k++) {
    coeffs[0] = secret[k];
    coeffs.set(random(new Uint8Array(m - 1)), 1);
    for (let x = 1; x <= n; x++) ys[x - 1][k] = evaluate(coeffs, x);
  }
  coeffs.fill(0);
  return { splitId, m, n, shares: ys.map((y, i) => ({ splitId, x: i + 1, y })) };
}

function assertShares(shares, m) {
  if (!Number.isInteger(m) || m < MIN_M || m > MAX_N) throw new RangeError("Mínimo de pedaços fora da faixa.");
  if (!Array.isArray(shares) || shares.length < m) throw new RangeError(`São precisos ${m} pedaços; há ${shares?.length || 0}.`);
  const picked = shares.slice(0, m);
  const [first] = picked;
  if (picked.some((s) => s.splitId !== first.splitId)) throw new RangeError("Pedaços de divisões diferentes não se juntam.");
  if (picked.some((s) => !(s.y instanceof Uint8Array) || s.y.length !== first.y.length || s.y.length === 0)) {
    throw new RangeError("Pedaços de tamanhos diferentes.");
  }
  if (picked.some((s) => !Number.isInteger(s.x) || s.x < 1 || s.x > 255)) throw new RangeError("Pedaço com x fora da faixa.");
  if (new Set(picked.map((s) => s.x)).size !== m) throw new RangeError("Pedaços repetidos.");
  return picked;
}

/** Peso de Lagrange do pedaço `i` em zero: produto de `xⱼ / (xⱼ ⊕ xᵢ)` para os outros pedaços. */
function lagrangeAtZero(xs, i) {
  return xs.reduce((acc, xj, j) => (j === i ? acc : gfMul(acc, gfDiv(xj, xj ^ xs[i]))), 1);
}

/**
 * Junta M pedaços da mesma divisão e devolve o segredo. Usa os M primeiros se vierem mais.
 * @param {{ splitId: string, x: number, y: Uint8Array }[]} shares
 * @param {number} m mínimo da divisão
 * @returns {Uint8Array}
 */
export function combineShares(shares, m) {
  const picked = assertShares(shares, m);
  const xs = picked.map((s) => s.x);
  const weights = xs.map((_, i) => lagrangeAtZero(xs, i));
  const secret = new Uint8Array(picked[0].y.length);
  for (let k = 0; k < secret.length; k++) {
    secret[k] = picked.reduce((acc, s, i) => acc ^ gfMul(s.y[k], weights[i]), 0);
  }
  return secret;
}
