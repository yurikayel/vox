/**
 * @file Cofre na malha (ADR-037) — transporte. Tudo assinado vai dentro de envelope de DM, pelo caminho da DM; pedido
 * e resposta passam pela caixa postal cega do relay, selados.
 *
 * - Dona: manda o cofre cifrado a até 7 laços mútuos (guardiões primeiro), recebe avisos de pedido e decide.
 * - Quem guarda: guarda o cofre em caixa preta, olha a caixa dos pedidos, avisa a dona e entrega na hora com "sim",
 *   nunca com "não" e 24 h depois do aviso sem resposta.
 * - Aparelho novo: pede pelo endereço que sai de e-mail e senha e junta a resposta.
 *
 * Cada função recebe `deps` opcional (testes trocam rede, relógio e conta).
 * @module app/mesh-vault-flow
 * @see client/js/vault/mesh-vault.js
 */

import * as mesh from "../vault/index.js";

async function defaultDeps() {
  const [gql, peers, cryptoDm, account, wire, inbox, contacts, social, guardiansFlow, share] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"), import("../identity/index.js"),
    import("./dm-wire.js"), import("../inbox.js"), import("../contacts.js"), import("../social.js"),
    import("./guardians-flow.js"), import("../share.js"),
  ]);
  return {
    getMe: () => account.getRouteId(),
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    sign: (body) => account.signPayload(body),
    verify: (signed) => account.verifyPayload(signed),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    open: (env, priv) => cryptoDm.open(env, priv),
    newKeypair: () => cryptoDm.generateDmKeypair(),
    sealKey: (value) => account.sealJsonStrict(value),
    openKey: (value) => account.openSealed(value),
    dispatch: (addr, env) => wire.dispatchSealedEnvelope(addr, env),
    push: (addr, env) => inbox.pushSealed(addr, env),
    pull: (addr) => inbox.pullMine(addr),
    guardiansOf: (owner) => (account.getOwnerSplit(owner)?.guardians || []).map((g) => g.routeId),
    pool: () => [...contacts.listContacts().map((c) => c.routeId), ...social.getWatchedProfiles()],
    mutual: (ids) => guardiansFlow.filterMutualTies(ids),
    alert: (text) => share.showToast?.(text),
    now: () => Date.now(),
  };
}

const deps = async (d) => d || (await defaultDeps());

async function sendSigned(x, me, to, body) {
  const key = await Promise.resolve(x.getDmPub(to)).catch(() => null);
  if (!key) return false;
  const signed = await x.sign(body);
  const envelope = await x.seal(key, mesh.serializeMeshDm(signed), { from: me, to });
  return Promise.resolve(x.dispatch(to, envelope)).then(() => true, () => false);
}

// ---- Dona: mandar o cofre ----

// Guardiões primeiro, e só quem ainda é laço mútuo: quem não é recusaria a cópia e gastaria uma das 7 vagas.
async function holderCandidates(x, me) {
  const pool = [...new Set([...(x.guardiansOf(me) || []), ...(x.pool() || [])])].filter((id) => id && id !== me);
  const ties = new Set(await Promise.resolve(x.mutual(pool)).catch(() => []));
  return pool.filter((id) => ties.has(id));
}

/**
 * Manda o cofre atual a quem ainda não tem, até 7 aparelhos (ADR-037 §3.1). Roda depois de gravar o cofre e ao abrir.
 * @param {object|null} [d]
 * @returns {Promise<string[]>} para quem foi agora
 */
export async function shareMyVault(d = null) {
  const x = await deps(d);
  const me = await Promise.resolve(x.getMe()).catch(() => "");
  const mine = mesh.loadMeshMine();
  if (!me || !mine || mine.routeId !== me) return [];
  const sent = [];
  const candidates = await holderCandidates(x, me);
  for (const to of mesh.pickHolders(mine, candidates).filter((id) => candidates.includes(id))) {
    const body = mesh.buildGuardBody({ to, address: mine.address, record: mine.record, updatedAt: mine.updatedAt });
    if (await sendSigned(x, me, to, body).catch(() => false)) sent.push(to);
  }
  if (sent.length) mesh.markMeshSent(sent);
  return sent;
}

/**
 * Pede a quem guarda que apague o cofre desta conta (ex.: a pessoa saiu da conta neste aparelho para sempre).
 * @param {object|null} [d]
 * @returns {Promise<number>} quantos pedidos saíram
 */
export async function releaseMyVault(d = null) {
  const x = await deps(d);
  const me = await Promise.resolve(x.getMe()).catch(() => "");
  const mine = mesh.loadMeshMine();
  if (!me || !mine) return 0;
  let n = 0;
  for (const to of [...new Set([...(mine.sentTo || []), ...(mine.previousHolders || [])])]) {
    if (await sendSigned(x, me, to, mesh.buildReleaseBody({ to })).catch(() => false)) n += 1;
  }
  mesh.forgetMeshMine();
  return n;
}

// ---- Recebendo DM ----

async function onGuard(x, p) {
  const ties = await Promise.resolve(x.mutual([p.author])).catch(() => []);
  if (!ties.includes(p.author)) return;
  mesh.acceptGuard(p);
}

function onNotice(x, p) {
  if (!mesh.addMeshNotice({ holder: p.author, requestId: String(p.requestId), firstSeen: Number(p.firstSeen) || x.now() })) return;
  x.alert("Alguém está abrindo sua conta em outro aparelho. Confira em Perfil → Segurança.");
  globalThis.dispatchEvent?.(new CustomEvent("vox-cofre-malha-aviso"));
}

function onDecision(p) {
  const held = mesh.loadHeld();
  const requests = held[p.author]?.requests;
  // `Object.hasOwn`: "__proto__" ou "constructor" como requestId não pode achar o protótipo e escrever nele.
  if (!requests || typeof p.requestId !== "string" || !Object.hasOwn(requests, p.requestId)) return;
  const req = requests[p.requestId];
  if (!req || typeof req !== "object" || req.decision) return;
  req.decision = p.decision === "sim" ? "sim" : "nao";
  mesh.saveHeld(held);
}

/**
 * Trata uma DM do cofre na malha (guarda, solta, aviso, decisão). Devolve true se o texto era uma, mesmo recusada.
 * @param {{ from?: string }} env envelope recebido
 * @param {string} rawText texto decifrado
 * @param {object|null} [d]
 * @returns {Promise<boolean>}
 */
export async function receiveMeshDm(env, rawText, d = null) {
  const p = mesh.parseMeshDm(rawText);
  if (!p) return false;
  if (env?.from && env.from !== p.author) return true;
  const x = await deps(d);
  const me = await Promise.resolve(x.getMe()).catch(() => "");
  if (!me || p.to !== me || p.author === me) return true;
  if (!(await Promise.resolve(x.verify(p)).catch(() => false))) return true;
  if (p.type === mesh.GUARD_TYPE) await onGuard(x, p);
  else if (p.type === mesh.RELEASE_TYPE) mesh.dropHeld(p.author);
  else if (p.type === mesh.NOTICE_TYPE) onNotice(x, p);
  else onDecision(p);
  return true;
}

// ---- Quem guarda: olhar pedidos, avisar, entregar ----

async function openRequests(x, entry) {
  const box = await mesh.boxKeyPair(entry.address);
  const list = await Promise.resolve(x.pull(await mesh.boxMailbox(entry.address))).catch(() => []);
  const out = [];
  for (const env of Array.isArray(list) ? list : []) {
    const text = await Promise.resolve(x.open(env, box.privateJwk)).catch(() => null);
    const req = text && mesh.parseRequest(text, x.now());
    if (req) out.push({ ...req, id: await mesh.requestIdOf(req) });
  }
  return out;
}

const MAX_REQUESTS_PER_OWNER = 7;

function undecidedRequestCount(requests, now) {
  let count = 0;
  for (const r of Object.values(requests)) {
    if (!r?.decision && !r?.answered && Number.isFinite(r?.t) && now - r.t <= mesh.REQUEST_MAX_AGE_MS) count += 1;
  }
  return count;
}

async function noteNewRequests(x, me, owner, entry) {
  for (const req of await openRequests(x, entry)) {
    if (entry.requests[req.id]) continue;
    if (undecidedRequestCount(entry.requests, x.now()) >= MAX_REQUESTS_PER_OWNER) break;
    entry.requests[req.id] = { k: req.k, t: req.t, firstSeen: x.now() };
    await sendSigned(x, me, owner, mesh.buildNoticeBody({ to: owner, requestId: req.id, firstSeen: x.now() })).catch(() => false);
  }
}

// Sem remetente: o relay não deve ligar quem guarda à caixa da resposta (ADR-037 §3.2).
async function releaseTo(x, entry, id, req) {
  const mailbox = await mesh.replyMailbox(req.k);
  const envelope = await x.seal(mesh.decodeMeshTempPub(req.k), mesh.buildReplyText(entry.record, id), { from: "", to: mailbox });
  return Promise.resolve(x.push(mailbox, envelope)).then(() => true, () => false);
}

async function safeReleaseTo(x, entry, id, req) {
  return releaseTo(x, entry, id, req).catch(() => false);
}

async function settleRequests(x, entry) {
  let released = 0;
  for (const [id, req] of Object.entries(entry.requests)) {
    const verdict = mesh.decideRequest(req, x.now());
    // Vencido ou ilegível sai; vetado dentro do prazo fica, para o pedido não voltar como novo.
    const live = Number.isFinite(req?.firstSeen) && x.now() - req.t <= mesh.REQUEST_MAX_AGE_MS;
    if (verdict === "drop" && !live) delete entry.requests[id];
    if (verdict !== "release") continue;
    if (await safeReleaseTo(x, entry, id, req)) {
      req.answered = true;
      released += 1;
    }
  }
  return released;
}

const isPlainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// Uma entrada ilegível (armazenamento corrompido) não pode travar a volta das outras donas.
const isReadableEntry = (entry) => isPlainObject(entry) && mesh.isVaultAddress(entry.address);

// Grava só os pedidos, sobre o que está guardado agora: a volta demora (rede) e um veto, uma troca de cofre ou um
// "soltar" que chegaram no meio não podem ser desfeitos por uma cópia velha da guarda inteira.
function saveRequests(owner, entry) {
  const held = mesh.loadHeld();
  const cur = held[owner];
  if (!isReadableEntry(cur) || cur.address !== entry.address) return;
  const fresh = isPlainObject(cur.requests) ? cur.requests : {};
  const requests = { ...entry.requests };
  for (const [id, r] of Object.entries(requests)) {
    if (fresh[id]?.decision) requests[id] = { ...r, decision: fresh[id].decision };
  }
  held[owner] = { ...cur, requests };
  mesh.saveHeld(held);
}

/**
 * Uma volta de quem guarda (ao abrir o app e a cada 10 minutos): pedidos novos geram aviso à dona; os que podem ser
 * entregues vão selados para a chave temporária.
 * @param {object|null} [d]
 * @returns {Promise<{ released: number }>}
 */
export async function holderTick(d = null) {
  const x = await deps(d);
  const me = await Promise.resolve(x.getMe()).catch(() => "");
  if (!me) return { released: 0 };
  let released = 0;
  for (const [owner, entry] of Object.entries(mesh.loadHeld())) {
    if (!isReadableEntry(entry)) continue;
    entry.requests = isPlainObject(entry.requests) ? entry.requests : {};
    await noteNewRequests(x, me, owner, entry);
    released += await settleRequests(x, entry);
    saveRequests(owner, entry);
  }
  return { released };
}

// ---- Dona: decidir ----

/**
 * Avisos de pedido que esperam decisão desta conta, um por pedido.
 * @returns {{ requestId: string, firstSeen: number, holders: number }[]}
 */
export function pendingNotices() {
  const byId = new Map();
  for (const n of mesh.loadMeshNotices()) {
    const cur = byId.get(n.requestId) || { requestId: n.requestId, firstSeen: n.firstSeen, holders: 0 };
    cur.firstSeen = Math.min(cur.firstSeen, n.firstSeen);
    cur.holders += 1;
    byId.set(n.requestId, cur);
  }
  return [...byId.values()];
}

/**
 * A dona aprova ("sim") ou veta ("nao") um pedido: a decisão assinada vai a cada guarda que avisou.
 * @param {string} requestId
 * @param {"sim"|"nao"} decision
 * @param {object|null} [d]
 * @returns {Promise<number>} quantos guardas receberam
 */
export async function decideMeshRequest(requestId, decision, d = null) {
  const x = await deps(d);
  const me = await x.getMe();
  let n = 0;
  for (const notice of mesh.takeMeshNotices(requestId)) {
    const body = mesh.buildDecisionBody({ to: notice.holder, requestId, decision });
    if (await sendSigned(x, me, notice.holder, body).catch(() => false)) n += 1;
  }
  return n;
}

// ---- Aparelho novo: pedir e juntar ----

/**
 * Pede o cofre à malha pelo endereço que sai de e-mail e senha (ADR-037 §3.2). Substitui o pedido anterior.
 * @param {string} email e-mail como a pessoa digitou
 * @param {string} pass senha
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, viaRelay: boolean }|{ ok: false, reason: "no-keystore" }>}
 */
export async function requestFromMesh(email, pass, d = null) {
  const x = await deps(d);
  const address = await mesh.meshVaultAddress(pass, email);
  const { publicJwk, privateJwk } = await x.newKeypair();
  const sealedPrivate = await Promise.resolve(x.sealKey(privateJwk)).catch(() => null);
  if (!sealedPrivate) return { ok: false, reason: "no-keystore" };
  const request = mesh.buildMeshRequest({ publicJwk, now: x.now() });
  const mailbox = await mesh.boxMailbox(address);
  const box = await mesh.boxKeyPair(address);
  const envelope = await x.seal(box.publicJwk, JSON.stringify(request), { from: "", to: mailbox });
  const viaRelay = await Promise.resolve(x.push(mailbox, envelope)).then(() => true, () => false);
  mesh.saveMeshPending({ address, request, requestId: await mesh.requestIdOf(request), sealedPrivate });
  return { ok: true, viaRelay };
}

/**
 * Há pedido à malha em andamento neste aparelho?
 * @param {object|null} [d]
 * @returns {Promise<boolean>}
 */
export async function hasMeshRequest(d = null) {
  const x = await deps(d);
  return Boolean(mesh.loadMeshPending(x.now()));
}

/**
 * Busca a resposta do pedido. Achando, devolve o cofre cifrado (quem chama abre com a senha).
 * @param {object|null} [d]
 * @returns {Promise<{ ok: true, record: object }|{ ok: false, reason: "no-request"|"waiting" }>}
 */
export async function collectMeshReply(d = null) {
  const x = await deps(d);
  const pending = mesh.loadMeshPending(x.now());
  if (!pending) return { ok: false, reason: "no-request" };
  const priv = await x.openKey(pending.sealedPrivate);
  const list = await Promise.resolve(x.pull(await mesh.replyMailbox(pending.request.k))).catch(() => []);
  for (const env of Array.isArray(list) ? list : []) {
    const text = await Promise.resolve(x.open(env, priv)).catch(() => null);
    const record = text && mesh.parseReplyText(text, pending.requestId);
    if (record) return { ok: true, record };
  }
  return { ok: false, reason: "waiting" };
}

/** Desiste do pedido à malha deste aparelho. */
export function cancelMeshRequest() {
  mesh.saveMeshPending(null);
}
