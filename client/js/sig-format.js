/**
 * PM-85 — forma canônica do que se assina (ADR-021 §2.6).
 *
 * - **v1** (sem `sigv`): `JSON.stringify` com a lista das chaves de topo. A lista vale em qualquer
 *   profundidade, então as chaves internas de um objeto aninhado (`photoTags`, `mediaRef`) ficam de fora.
 * - **v2** (`sigv: 2`, dentro do que é assinado): todas as chaves, ordenadas, em qualquer profundidade.
 *   Tirar o `sigv` de um post v2 não o faz passar como v1: a assinatura foi feita sobre o texto com `sigv`.
 *
 * Convivência: o aparelho confere v1 e v2 desde o SW v7.66 e passa a assinar v2 a partir de `SIGV2_FROM`,
 * para quem ainda não atualizou não descartar os posts novos.
 */
export const SIGV2_FROM = Date.UTC(2026, 10, 24);

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  const out = Object.create(null);
  for (const key of Object.keys(value).sort()) out[key] = sortDeep(value[key]);
  return out;
}

/** Versão com que este aparelho assina agora. */
export function signingVersion(now = Date.now()) {
  return now >= SIGV2_FROM ? 2 : 1;
}

/** v1 (ausente) e v2 são as únicas formas conhecidas; outra versão não verifica. */
export function isKnownSigv(obj) {
  return obj?.sigv === undefined || obj.sigv === 2;
}

/** Texto assinado de um objeto, sem `sig` e `pubKey`, na versão que o próprio objeto declara. */
export function canonicalString(obj) {
  const { sig: _sig, pubKey: _pubKey, ...rest } = obj;
  if (rest.sigv === 2) return JSON.stringify(sortDeep(rest));
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/** Acrescenta (ou tira) `sigv` conforme a versão de assinatura. */
export function withSigv(payload, version = signingVersion()) {
  const { sigv: _old, ...rest } = payload;
  return version === 2 ? { ...rest, sigv: 2 } : rest;
}
