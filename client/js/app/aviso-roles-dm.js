/**
 * @file Chamada de ação (civic lote 1) e competências (civic lote 2) no aparelho.
 *
 * Quem assume um papel manda a resposta assinada por DM cifrada a quem convocou; o aparelho da
 * coordenação confere a assinatura e o aviso e guarda a resposta. Nada disso vai para o gossip.
 * As competências ficam só neste aparelho.
 *
 * Lógica pura em `aviso-roles.js`; molde da denúncia por DM (`report-dm.js`). As dependências de rede
 * são injetáveis (`deps`) para os testes.
 *
 * @module app/aviso-roles-dm
 * @see client/js/aviso-roles.js
 */

import * as roles from "../aviso-roles.js";

/**
 * Chave em `localStorage`: papel que eu assumi em cada aviso (`{ [avisoId]: role }`).
 *
 * @type {string}
 */
export const MY_ROLE_KEY = "vox-aviso-meu-papel-v1";

/**
 * Chave em `localStorage`: respostas de papel recebidas (só no aparelho de quem convocou).
 *
 * Guarda no máximo 500, as mais recentes.
 *
 * @type {string}
 */
export const RECEIVED_KEY = "vox-aviso-papeis-v1";

/**
 * Chave em `localStorage`: competências marcadas neste aparelho.
 *
 * Nunca vão para o perfil nem para a malha; servem só para sugerir papel.
 *
 * @type {string}
 */
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

/**
 * Papel que eu assumi num aviso, como ficou guardado ao enviar.
 *
 * @param {string} avisoId Aviso.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {string} Nome do papel, ou `""` se nenhum.
 */
export function myRoleFor(avisoId, storage = globalThis.localStorage) {
  return String(readJson(storage, MY_ROLE_KEY, {})[avisoId] || "");
}

function rememberMyRole(avisoId, role, storage) {
  const all = readJson(storage, MY_ROLE_KEY, {});
  all[avisoId] = role;
  writeJson(storage, MY_ROLE_KEY, all);
}

/**
 * Respostas de papel recebidas para um aviso. Só existem no aparelho de quem convocou.
 *
 * @param {string} avisoId Aviso.
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {object[]} Respostas assinadas, na ordem de chegada.
 */
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
 * Manda a resposta assinada a quem convocou e guarda a mensagem no fio da conversa.
 *
 * @param {string} user Rota de quem responde.
 * @param {object} aviso Aviso da chamada (o autor é quem convocou).
 * @param {object} [opts={}]
 * @param {string} [opts.role] Papel assumido; vazio para desistir.
 * @param {string} [opts.display] Nome mostrado à coordenação.
 * @param {string} [opts.code] Código curto do aviso, para o texto da mensagem.
 * @param {object|null} [deps=null] Dependências injetáveis; `null` usa as reais.
 * @returns {Promise<"delivered"|"queued-relay"|"pending-retry"|"no-key">} `no-key` quando quem convocou não tem chave de DM conhecida.
 * @throws {Error} Se o papel não existe no aviso (ver `buildRoleClaim`).
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

/**
 * No aparelho de quem convocou: confere e guarda uma resposta de papel recebida por DM.
 *
 * Recusa se a assinatura não confere, se o aviso não é deste aparelho, se o papel não existe no
 * aviso ou se a resposta é repetida.
 *
 * @param {object} claim Resposta extraída da DM (`parseRoleClaimDm`).
 * @param {object|null} [deps=null] Dependências injetáveis; `null` usa as reais.
 * @returns {Promise<boolean>} `true` se guardou.
 */
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

/**
 * Competências marcadas neste aparelho.
 *
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {string[]} Lista normalizada (pode ser vazia).
 */
export function mySkills(storage = globalThis.localStorage) {
  const list = readJson(storage, SKILLS_KEY, []);
  return Array.isArray(list) ? list.map(String) : [];
}

/**
 * Guarda as competências só neste aparelho.
 *
 * @param {Iterable<string>} list Competências já validadas (`parseSkillsInput`).
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento.
 * @returns {void}
 */
export function saveMySkills(list, storage = globalThis.localStorage) {
  writeJson(storage, SKILLS_KEY, [...list]);
}
