/**
 * @file Chamada de ação (lote 1): quem assume um papel manda a resposta assinada por DM cifrada
 * a quem convocou; o aparelho da coordenação confere e guarda. Nada disso vai para o gossip.
 * Lógica pura em `aviso-roles.js`; molde da denúncia por DM (`report-dm.js`).
 */

import * as roles from "../aviso-roles.js";

export const MY_ROLE_KEY = "vox-aviso-meu-papel-v1";
export const RECEIVED_KEY = "vox-aviso-papeis-v1";
/** Competências ficam só neste aparelho (lote 2): nunca vão para o perfil nem para a malha. */
export const SKILLS_KEY = "vox-competencias-v1";
const RECEIVED_MAX = 500;

function readJson(storage, key, fallback) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {}
}

/** Papel que eu assumi neste aviso, como ficou guardado ao enviar ("" = nenhum). */
export function myRoleFor(avisoId, storage = globalThis.localStorage) {
  return String(readJson(storage, MY_ROLE_KEY, {})[avisoId] || "");
}

function rememberMyRole(avisoId, role, storage) {
  const all = readJson(storage, MY_ROLE_KEY, {});
  all[avisoId] = role;
  writeJson(storage, MY_ROLE_KEY, all);
}

/** Respostas recebidas para um aviso (só existem no aparelho de quem convocou). */
export function receivedClaims(avisoId, storage = globalThis.localStorage) {
  return readJson(storage, RECEIVED_KEY, []).filter((c) => c?.avisoId === avisoId);
}

async function defaultSendDeps() {
  const [gql, peers, cryptoDm, cacheNode, localAccount, wire] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"),
    import("../cache-node.js"), import("../local-account.js"), import("./dm-wire.js"),
  ]);
  return {
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    sign: (body) => localAccount.signPayload(body),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, envelope) => wire.dispatchSealedEnvelope(addr, envelope),
    saveDm: (msg) => cacheNode.saveDmMessage(msg),
    storage: globalThis.localStorage,
  };
}

function claimText(role, code) {
  const which = code ? `o aviso ${code}` : "o aviso";
  return role ? `Assumo o papel "${roles.roleLabel(role)}" para ${which}.` : `Desisto do meu papel para ${which}.`;
}

/**
 * Manda a resposta assinada a quem convocou e guarda a mensagem no fio.
 * `opts`: `{ role, display, code }`. Devolve "delivered", "queued-relay", "pending-retry" ou "no-key".
 */
export async function sendRoleClaim(user, aviso, opts = {}, deps = null) {
  const d = deps || (await defaultSendDeps());
  const coordinator = String(aviso?.author || "");
  const pub = coordinator ? await d.getDmPub(coordinator).catch(() => null) : null;
  if (!pub) return "no-key";
  const signed = await d.sign(roles.buildRoleClaim(aviso, opts.role, { display: opts.display }));
  const text = claimText(signed.role, opts.code);
  const envelope = await d.seal(pub, roles.serializeRoleClaimDm(signed, text), { from: user, to: coordinator });
  const status = await d.dispatch(coordinator, envelope);
  await d.saveDm({ id: envelope.id, peerAddress: coordinator, from: user, to: coordinator, text, ts: envelope.ts, status });
  rememberMyRole(aviso.id, signed.role, d.storage);
  return status;
}

async function defaultReceiveDeps() {
  const [cacheNode, localAccount, context] = await Promise.all([
    import("../cache-node.js"), import("../local-account.js"), import("./context.js"),
  ]);
  return {
    verify: (signed) => localAccount.verifyPayload(signed),
    getSelves: async () => [await context.getActiveUser().catch(() => ""), await localAccount.getRouteId().catch(() => "")],
    getPost: (id) => cacheNode.getLocalPost(id),
    storage: globalThis.localStorage,
  };
}

/** Aparelho de quem convocou: confere a assinatura e o aviso, e guarda a resposta. Devolve true se guardou. */
export async function receiveRoleClaimDm(claim, deps = null) {
  const d = deps || (await defaultReceiveDeps());
  if (!(await Promise.resolve(d.verify(claim)).catch(() => false))) return false;
  const aviso = await d.getPost(claim.avisoId).catch(() => null);
  const selves = (await d.getSelves().catch(() => [])).filter(Boolean);
  if (!aviso || aviso.communityId !== claim.communityId || !selves.includes(aviso.author)) return false;
  if (claim.role && !roles.decodeRoleList(aviso.roleSlots).some((r) => r.role === claim.role)) return false;
  const all = readJson(d.storage, RECEIVED_KEY, []);
  if (all.some((c) => c.author === claim.author && c.avisoId === claim.avisoId && c.ts === claim.ts)) return false;
  writeJson(d.storage, RECEIVED_KEY, [...all, claim].slice(-RECEIVED_MAX));
  return true;
}

/** Competências marcadas neste aparelho. */
export function mySkills(storage = globalThis.localStorage) {
  const list = readJson(storage, SKILLS_KEY, []);
  return Array.isArray(list) ? list.map(String) : [];
}

/** Guarda as competências só neste aparelho. */
export function saveMySkills(list, storage = globalThis.localStorage) {
  writeJson(storage, SKILLS_KEY, [...list]);
}
