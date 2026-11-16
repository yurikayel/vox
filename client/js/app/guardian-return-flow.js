/**
 * @file Guardiões, parte 3c — transporte do pedido de volta (spec `docs/specs/guardioes-v0.md` §7, THREAT-MODEL T25).
 *
 * - Aparelho novo: gera a chave temporária (privada cifrada pelo aparelho, só nesta aba, 24 h), mostra o link e o
 *   código, junta as respostas que chegam pela caixa `vxtmp_` ou coladas, e entra quando tiver M pedaços da conta
 *   pedida.
 * - Guardião: confere o pedido (pedaço guardado, idade) e só devolve depois de marcar que conferiu o código por voz
 *   ou pessoalmente. A resposta vai selada para a chave temporária: pela caixa, se houver relay, e sempre como texto
 *   para colar.
 *
 * @module app/guardian-return-flow
 * @see client/js/guardian-return.js
 */

import * as ret from "../guardian-return.js";

async function defaultDeps() {
  const [cryptoDm, inbox, keystore, guardians, localAccount, phrase] = await Promise.all([
    import("../crypto-dm.js"), import("../inbox.js"), import("../keystore.js"), import("../guardians.js"),
    import("../local-account.js"), import("../account-phrase.js"),
  ]);
  return {
    getMe: () => localAccount.getRouteId(),
    openHeld: (owner) => guardians.openHeldShare(owner),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    open: (env, priv) => cryptoDm.open(env, priv),
    sealKey: (value) => keystore.sealJsonStrict(value),
    openKey: (value) => keystore.openSealed(value),
    push: (addr, env) => inbox.pushSealed(addr, env),
    pull: (addr) => inbox.pullMine(addr),
    verify: (signed) => localAccount.verifyPayload(signed),
    restore: (joined, owner) => phrase.restoreFromSecret(joined, owner),
    now: () => Date.now(),
  };
}

const deps = async (d) => d || (await defaultDeps());

// ---- Guardião ----

/**
 * Confere um pedido aberto pelo link, antes de mostrar a tela de devolver.
 * @param {{ get: (key: string) => string|null }} query
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, request: object, code: string[] }|{ ok: false, reason: "invalid"|"self"|"old"|"future"|"not-held" }>}
 */
export async function prepareGuardianReturn(query, d = null) {
  const request = ret.parseRequest(query);
  if (!request) return { ok: false, reason: "invalid" };
  const x = await deps(d);
  if (request.o === (await x.getMe())) return { ok: false, reason: "self" };
  const age = ret.requestAge(request, x.now());
  if (age !== "ok") return { ok: false, reason: age };
  const share = await Promise.resolve(x.openHeld(request.o)).catch(() => null);
  if (!share) return { ok: false, reason: "not-held" };
  return { ok: true, request, code: await ret.shortCode(request) };
}

/**
 * Devolve o pedaço para a chave temporária do pedido. Sem `confirmed` (conferiu o código por voz ou pessoalmente),
 * não devolve.
 * @param {object} request pedido já conferido por `prepareGuardianReturn`
 * @param {{ confirmed: boolean }} opts
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, viaRelay: boolean, pasteText: string }|{ ok: false, reason: string }>}
 */
export async function sendGuardianReturn(request, { confirmed }, d = null) {
  if (confirmed !== true) return { ok: false, reason: "not-confirmed" };
  const x = await deps(d);
  if (ret.requestAge(request, x.now()) !== "ok") return { ok: false, reason: "old" };
  const share = await Promise.resolve(x.openHeld(request.o)).catch(() => null);
  if (!share) return { ok: false, reason: "not-held" };
  const mailbox = await ret.mailboxFor(request.k);
  const text = ret.buildReplyText(share, await ret.requestId(request));
  const envelope = await x.seal(ret.decodeTempPub(request.k), text, { from: await x.getMe(), to: mailbox });
  const viaRelay = await Promise.resolve(x.push(mailbox, envelope)).then(() => true, () => false);
  return { ok: true, viaRelay, pasteText: ret.encodePasteText(envelope) };
}

// ---- Aparelho novo ----

/**
 * `routeId` digitado ou tirado de um link de perfil (`#/u/vx_…`, `#/connect/vx_…`), ou "".
 * @param {string} text
 * @returns {string}
 */
export function parseOwnerInput(text) {
  const match = String(text || "").match(/vx_[A-Za-z0-9_-]{20}(?![A-Za-z0-9_-])/);
  return match ? match[0] : "";
}

async function describe(pending) {
  const { request } = pending;
  return { request, link: ret.requestLink(request, globalThis.location?.href || ""), code: await ret.shortCode(request), received: pending.envelopes.length };
}

/**
 * Começa um pedido novo para a conta `owner` (substitui o pendente).
 * @param {string} owner
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, request: object, link: string, code: string[], received: number }|{ ok: false, reason: "invalid"|"no-keystore" }>}
 */
export async function startRecovery(owner, d = null) {
  if (!parseOwnerInput(owner) || parseOwnerInput(owner) !== owner) return { ok: false, reason: "invalid" };
  const x = await deps(d);
  const { publicJwk, privateJwk } = await x.newKeypair();
  const sealedPrivate = await Promise.resolve(x.sealKey(privateJwk)).catch(() => null);
  if (!sealedPrivate) return { ok: false, reason: "no-keystore" };
  const pending = { request: ret.buildRequest({ owner, publicJwk, now: x.now() }), publicJwk, sealedPrivate, envelopes: [] };
  ret.savePending(pending);
  return { ok: true, ...(await describe(pending)) };
}

/**
 * O pedido pendente desta aba, já descrito para a tela, ou null.
 * @param {object|null} [d]
 * @returns {Promise<{ request: object, link: string, code: string[], received: number }|null>}
 */
export async function currentRecovery(d = null) {
  const x = await deps(d);
  const pending = ret.loadPending(x.now());
  return pending ? describe(pending) : null;
}

/** Guarda envelopes novos (sem repetir `id`), ainda selados. */
function keepEnvelopes(pending, envelopes) {
  const known = new Set(pending.envelopes.map((e) => e.id));
  const fresh = envelopes.filter((e) => e?.id && !known.has(e.id));
  if (fresh.length) ret.savePending({ ...pending, envelopes: [...pending.envelopes, ...fresh] });
  return fresh.length;
}

/**
 * Resposta colada à mão (volta pessoal).
 * @param {string} text
 * @param {object|null} [d]
 * @returns {Promise<{ ok: boolean, reason?: "no-request"|"not-a-reply"|"repeated" }>}
 */
export async function addPastedReply(text, d = null) {
  const x = await deps(d);
  const pending = ret.loadPending(x.now());
  if (!pending) return { ok: false, reason: "no-request" };
  const envelope = ret.decodePasteText(text);
  if (!envelope) return { ok: false, reason: "not-a-reply" };
  return keepEnvelopes(pending, [envelope]) ? { ok: true } : { ok: false, reason: "repeated" };
}

/**
 * Busca respostas na caixa temporária do relay.
 * @param {object|null} [d]
 * @returns {Promise<number>} quantas chegaram agora
 */
export async function collectRelayReplies(d = null) {
  const x = await deps(d);
  const pending = ret.loadPending(x.now());
  if (!pending) return 0;
  const list = await Promise.resolve(x.pull(await ret.mailboxFor(pending.request.k))).catch(() => []);
  return keepEnvelopes(pending, Array.isArray(list) ? list : []);
}

/** Abre cada envelope com a chave temporária; o que não abre ou não é deste pedido fica de fora. */
async function openReplies(x, pending) {
  const priv = await x.openKey(pending.sealedPrivate);
  const [mailbox, reqId] = await Promise.all([ret.mailboxFor(pending.request.k), ret.requestId(pending.request)]);
  const shares = [];
  for (const env of pending.envelopes) {
    if (env.to !== mailbox) continue;
    const text = await Promise.resolve(x.open(env, priv)).catch(() => null);
    const share = text && ret.parseReplyText(text, reqId);
    if (share) shares.push(share);
  }
  return shares;
}

/**
 * Tenta entrar: com M pedaços válidos da conta pedida, refaz a conta e esquece o pedido.
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, routeId: string, displayName: string }|{ ok: false, reason: string, have?: number, need?: number }>}
 */
export async function finishRecovery(d = null) {
  const x = await deps(d);
  const pending = ret.loadPending(x.now());
  if (!pending) return { ok: false, reason: "no-request" };
  const owner = pending.request.o;
  const joined = await ret.joinShares(await openReplies(x, pending), owner, x.verify);
  if (!joined.ok) return { ok: false, reason: "not-enough", have: joined.have, need: joined.need };
  const res = await x.restore(joined, owner);
  joined.secret.fill(0);
  if (!res.ok) return res;
  ret.clearPending();
  return { ok: true, routeId: res.routeId, displayName: res.displayName };
}

/** Desiste do pedido desta aba. */
export function cancelRecovery() {
  ret.clearPending();
}
