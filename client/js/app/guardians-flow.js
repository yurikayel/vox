/**
 * @file Guardiões, parte 3b — transporte: dividir e mandar os pedaços, receber pedaço, recibo e revogação, e parar
 * de guardar. Tudo vai assinado e dentro de envelope de DM, pelo caminho da DM (WebRTC → caixa postal → caixa de
 * saída). Spec: `docs/specs/guardioes-v0.md` §4–§6 e §12.
 *
 * @module app/guardians-flow
 * @see client/js/guardians.js
 */

import * as guardians from "../guardians.js";
import { clearAccountExit, markAccountExit } from "../account-exit.js";

async function defaultDeps() {
  const [gql, peers, cryptoDm, localAccount, wire, phrase, contacts, social, notice, share] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"), import("../local-account.js"),
    import("./dm-wire.js"), import("../account-phrase.js"), import("../contacts.js"), import("../social.js"),
    import("../contact-notify.js"), import("../share.js"),
  ]);
  return {
    getMe: () => localAccount.getRouteId(),
    getOwnerName: () => localAccount.getDisplayName() || localAccount.getProfileEnrichment()?.displayName || "",
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, env) => wire.dispatchSealedEnvelope(addr, env),
    openSecret: (pass) => phrase.openRecoverySecret(pass),
    follows: (id) => contacts.hasContact(id) || social.isWatching(id),
    addedMe: (id) => notice.hasAddedYou(id),
    alert: (text) => share.showToast(text),
  };
}

async function sendSigned(d, me, to, body, pub = null) {
  const key = pub || (await d.getDmPub(to).catch(() => null));
  if (!key) return "no-key";
  const signed = await d.sign(body);
  const envelope = await d.seal(key, guardians.serializeGuardianDm(signed), { from: me, to });
  return d.dispatch(to, envelope);
}

async function revokePrevious(d, me, previous) {
  if (!previous) return;
  for (const g of previous.guardians) {
    await sendSigned(d, me, g.routeId, guardians.buildRevokeBody({ to: g.routeId, splitId: previous.splitId })).catch(() => {});
  }
}

/**
 * Laço mútuo (spec §12.2): eu sigo ou tenho nos contatos, e a pessoa avisou que me adicionou.
 * @param {string[]} routeIds candidatos
 * @param {object|null} [deps]
 * @returns {Promise<string[]>}
 */
export async function filterMutualTies(routeIds, deps = null) {
  const d = deps || (await defaultDeps());
  const me = await Promise.resolve(d.getMe()).catch(() => "");
  return [...new Set(routeIds)].filter((id) => id && id !== me && d.follows(id) && d.addedMe(id));
}

/**
 * Divide o segredo da conta ativa e manda um pedaço para cada guardião; revoga a divisão anterior.
 * @param {{ guardians: string[], m: number, passphrase?: string }} opts
 * @param {object|null} [deps]
 * @returns {Promise<{ ok: boolean, reason?: string, missing?: string[], splitId?: string, results?: string[] }>}
 */
export async function sendGuardianShares({ guardians: chosen, m, passphrase = "" }, deps = null) {
  const d = deps || (await defaultDeps());
  const me = await d.getMe();
  if ((await filterMutualTies(chosen, d)).length !== chosen.length) return { ok: false, reason: "not-mutual" };
  const pubs = await Promise.all(chosen.map((id) => d.getDmPub(id).catch(() => null)));
  const missing = chosen.filter((_, i) => !pubs[i]);
  if (missing.length) return { ok: false, reason: "no-key", missing };
  const { secret, kind } = await d.openSecret(passphrase);
  const split = guardians.buildShareBodies({ secret, kind, ownerName: d.getOwnerName(), guardians: chosen, m });
  secret.fill(0);
  const previous = guardians.getOwnerSplit(me);
  const results = [];
  for (const [i, item] of split.bodies.entries()) results.push(await sendSigned(d, me, item.to, item.body, pubs[i]));
  guardians.recordOwnerSplit(me, split);
  clearAccountExit("guardioes", me);
  await revokePrevious(d, me, previous);
  return { ok: true, splitId: split.splitId, results };
}

async function onShare(d, me, p) {
  if (!guardians.isWellFormedShare(p) || !d.follows(p.author)) return;
  if (!(await guardians.storeHeldShare(p, me))) return;
  await sendSigned(d, me, p.author, guardians.buildReceiptBody({ owner: p.author, splitId: p.splitId, x: p.x })).catch(() => {});
  d.alert(`${p.ownerName || "Uma pessoa"} escolheu você para guardar a volta da conta. Sozinho, o seu pedaço não abre nada.`);
}

function onReceipt(me, p) {
  if (!guardians.applyReceipt(me, p)) return;
  const { confirmed, m } = guardians.countConfirmed(me);
  if (confirmed >= m) markAccountExit("guardioes", me);
  else clearAccountExit("guardioes", me);
}

/**
 * Trata uma mensagem de guardião decifrada. Devolve true se o texto era uma (válida ou não), para não virar
 * mensagem no fio.
 * @param {{ from?: string }} env envelope recebido
 * @param {string} rawText texto decifrado
 * @param {object|null} [deps]
 * @returns {Promise<boolean>}
 */
export async function receiveGuardianDm(env, rawText, deps = null) {
  const p = guardians.parseGuardianDm(rawText);
  if (!p) return false;
  if (env?.from && env.from !== p.author) return true;
  const d = deps || (await defaultDeps());
  const me = await Promise.resolve(d.getMe()).catch(() => "");
  if (!me || p.to !== me || p.author === me) return true;
  if (!(await Promise.resolve(d.verify(p)).catch(() => false))) return true;
  if (p.type === guardians.SHARE_TYPE) await onShare(d, me, p);
  else if (p.type === guardians.RECEIPT_TYPE) onReceipt(me, p);
  else guardians.dropHeldShare(p.author, p.splitId);
  return true;
}

/**
 * Para de guardar o pedaço de uma dona e avisa ela (o recibo vira "soltou").
 * @param {string} owner
 * @param {object|null} [deps]
 * @returns {Promise<boolean>} se havia pedaço
 */
export async function stopGuarding(owner, deps = null) {
  const dropped = guardians.dropHeldShare(owner);
  if (!dropped) return false;
  const d = deps || (await defaultDeps());
  const me = await d.getMe();
  const body = guardians.buildReceiptBody({ owner, splitId: dropped.splitId, x: dropped.x, released: true });
  await sendSigned(d, me, owner, body).catch(() => {});
  return true;
}
