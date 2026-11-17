/**
 * Cofre na malha (ADR-037), módulo base: chave e caixas derivadas do endereço, formatos, guarda em caixa preta, regra
 * de espera e veto, o cofre desta conta e o pedido do aparelho novo. Cifra de verdade (WebCrypto).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as mesh from "../client/js/vault/mesh-vault.js";
import { deriveVaultAddress } from "../client/js/vault/vault-crypto.js";
import * as cryptoDm from "../client/js/crypto-dm.js";

const HOUR = 60 * 60 * 1000;
const A1 = "a".repeat(64);
const A2 = "b".repeat(64);
const RECORD = { v: 2, salt: "s", iv: "i", ct: "c".repeat(500), updatedAt: 1 };

function guard(author, overrides = {}) {
  return { author, address: A1, record: RECORD, updatedAt: 100, ...overrides };
}

test.beforeEach(() => localStorage.clear());

test("caixa do cofre — a mesma chave sai do mesmo endereço; endereço diferente dá outra chave", async () => {
  const [k1, k1b, k2] = await Promise.all([mesh.boxKeyPair(A1), mesh.boxKeyPair(A1), mesh.boxKeyPair(A2)]);
  assert.deepEqual(k1.publicJwk, k1b.publicJwk);
  assert.equal(k1.privateJwk.d, k1b.privateJwk.d);
  assert.notEqual(k1.publicJwk.x, k2.publicJwk.x);
  assert.equal(k1.publicJwk.crv, "P-256");
});

test("caixa do cofre — endereço com forma errada é recusado", async () => {
  for (const bad of ["", "xyz", "A".repeat(64), "a".repeat(63)]) {
    await assert.rejects(() => mesh.boxKeyPair(bad), /Endereço de cofre inválido/);
  }
  assert.equal(mesh.isVaultAddress(A1), true);
});

test("caixa do cofre — quem pede e quem guarda chegam à mesma chave: pedido selado abre do outro lado", async () => {
  const requester = await mesh.boxKeyPair(A1);
  const holder = await mesh.boxKeyPair(A1);
  const env = await cryptoDm.seal(requester.publicJwk, "olá", { from: "", to: await mesh.boxMailbox(A1) });
  assert.equal(await cryptoDm.open(env, holder.privateJwk), "olá");
  const other = await mesh.boxKeyPair(A2);
  await assert.rejects(() => cryptoDm.open(env, other.privateJwk));
});

test("caixas postais — prefixo, tamanho fixo e nada do endereço ou da chave aparece no nome", async () => {
  const box = await mesh.boxMailbox(A1);
  assert.match(box, /^vxcof_[0-9a-f]{20}$/);
  assert.notEqual(box, await mesh.boxMailbox(A2));
  assert.ok(!box.includes(A1.slice(0, 8)));
  const reply = await mesh.replyMailbox("abc");
  assert.match(reply, /^vxcofr_[0-9a-f]{20}$/);
  assert.notEqual(reply, await mesh.replyMailbox("abd"));
});

test("endereço do cofre na volta é o mesmo da gravação, com e-mail em maiúsculas e espaços", async () => {
  const pass = "senha forte de teste";
  const saved = await deriveVaultAddress(pass, "ana@exemplo.com");
  assert.equal(await mesh.meshVaultAddress(`  ${pass} `, "  Ana@Exemplo.COM "), saved);
  assert.notEqual(await mesh.meshVaultAddress(pass, "outra@exemplo.com"), saved);
  assert.notEqual(await mesh.meshVaultAddress("senha forte de teste!", "ana@exemplo.com"), saved);
});

test("DM do cofre na malha — só aceita o tipo, a versão e os campos assinados", () => {
  const body = { ...mesh.buildGuardBody({ to: "vx_b", address: A1, record: RECORD, updatedAt: 1 }), author: "vx_a", sig: "s", pubKey: {} };
  assert.deepEqual(mesh.parseMeshDm(mesh.serializeMeshDm(body)), body);
  const wrapped = (payload, kind = "cofre-malha") => JSON.stringify({ __vox_dm_v2: 1, kind, payload });
  assert.equal(mesh.parseMeshDm(wrapped(body, "guardian")), null, "outro tipo de DM");
  assert.equal(mesh.parseMeshDm(wrapped({ ...body, v: 1 })), null, "versão desconhecida");
  assert.equal(mesh.parseMeshDm(wrapped({ ...body, type: "vox-cofre-outro" })), null, "tipo desconhecido");
  for (const missing of ["author", "to", "sig", "pubKey"]) {
    const { [missing]: _, ...rest } = body;
    assert.equal(mesh.parseMeshDm(wrapped(rest)), null, `sem ${missing}`);
  }
  assert.equal(mesh.parseMeshDm("texto comum"), null);
  assert.equal(mesh.parseMeshDm("{quebrado"), null);
});

test("corpos — decisão só tem dois valores; o resto vira veto", () => {
  assert.equal(mesh.buildDecisionBody({ to: "vx_h", requestId: "r", decision: "sim" }).decision, "sim");
  assert.equal(mesh.buildDecisionBody({ to: "vx_h", requestId: "r", decision: "talvez" }).decision, "nao");
  assert.deepEqual(mesh.buildReleaseBody({ to: "vx_h" }), { type: mesh.RELEASE_TYPE, v: 0, to: "vx_h" });
  const notice = mesh.buildNoticeBody({ to: "vx_a", requestId: "r", firstSeen: 5 });
  assert.equal(notice.type, mesh.NOTICE_TYPE);
});

test("pedido — ida e volta; velho, do futuro, chave inválida ou outro tipo são recusados", async () => {
  const { publicJwk } = await cryptoDm.generateDmKeypair();
  const now = 1_000_000_000_000;
  const req = mesh.buildRequest({ publicJwk, now, nonce: "n1" });
  assert.deepEqual(mesh.parseRequest(JSON.stringify(req), now), req);
  assert.equal(mesh.parseRequest(JSON.stringify(req), now + 73 * HOUR), null, "mais de 72 h");
  assert.ok(mesh.parseRequest(JSON.stringify(req), now + 71 * HOUR), "dentro de 72 h");
  assert.equal(mesh.parseRequest(JSON.stringify({ ...req, t: now + HOUR }), now), null, "do futuro");
  assert.equal(mesh.parseRequest(JSON.stringify({ ...req, k: "nao-e-ponto" }), now), null, "chave inválida");
  assert.equal(mesh.parseRequest(JSON.stringify({ ...req, type: "outro" }), now), null);
  assert.equal(mesh.parseRequest("{", now), null);
});

test("pedido — id estável, muda com o nonce", async () => {
  const { publicJwk } = await cryptoDm.generateDmKeypair();
  const a = mesh.buildRequest({ publicJwk, nonce: "n1" });
  const b = { ...a, n: "n2" };
  assert.equal(await mesh.requestIdOf(a), await mesh.requestIdOf({ ...a }));
  assert.notEqual(await mesh.requestIdOf(a), await mesh.requestIdOf(b));
  assert.notEqual(mesh.buildRequest({ publicJwk }).n, mesh.buildRequest({ publicJwk }).n, "nonce sorteado");
});

test("resposta — só vale para o mesmo pedido", () => {
  const text = mesh.buildReplyText(RECORD, "r1");
  assert.deepEqual(mesh.parseReplyText(text, "r1"), RECORD);
  assert.equal(mesh.parseReplyText(text, "r2"), null);
  assert.equal(mesh.parseReplyText(JSON.stringify({ type: mesh.REPLY_TYPE, v: 0, requestId: "r1" }), "r1"), null, "sem cofre");
  assert.equal(mesh.parseReplyText("x", "r1"), null);
});

test("guarda — aceita, recusa forma errada, cofre grande e versão velha; versão nova substitui", () => {
  assert.equal(mesh.acceptGuard(guard("vx_a")), "ok");
  assert.equal(mesh.heldCount(), 1);
  assert.equal(mesh.acceptGuard(guard("vx_a", { address: "zz" })), "invalid");
  assert.equal(mesh.acceptGuard(guard("vx_a", { record: { ct: "x".repeat(mesh.MAX_RECORD_CHARS) } })), "invalid");
  assert.equal(mesh.acceptGuard(guard("vx_a", { record: "texto" })), "invalid");
  assert.equal(mesh.acceptGuard(guard("vx_a", { updatedAt: "x" })), "invalid");
  assert.equal(mesh.acceptGuard(guard("vx_a", { updatedAt: 100 })), "stale", "mesma versão");
  assert.equal(mesh.acceptGuard(guard("vx_a", { updatedAt: 99 })), "stale", "versão velha não volta (anti-rollback)");
  assert.equal(mesh.acceptGuard(guard("vx_a", { updatedAt: 200, address: A2 })), "ok");
  assert.equal(mesh.loadHeld().vx_a.address, A2, "um cofre por dona: troca de senha substitui");
  assert.equal(mesh.heldCount(), 1);
});

test("guarda — pedidos em andamento ficam se o endereço é o mesmo e somem se mudou", () => {
  mesh.acceptGuard(guard("vx_a"));
  const held = mesh.loadHeld();
  held.vx_a.requests = { r1: { k: "k", t: 1, firstSeen: 1 } };
  mesh.saveHeld(held);
  mesh.acceptGuard(guard("vx_a", { updatedAt: 150 }));
  assert.ok(mesh.loadHeld().vx_a.requests.r1);
  mesh.acceptGuard(guard("vx_a", { updatedAt: 160, address: A2 }));
  assert.deepEqual(mesh.loadHeld().vx_a.requests, {});
});

test("guarda — teto de donas; dona que já está continua podendo atualizar", () => {
  for (let i = 0; i < mesh.MAX_HELD; i++) assert.equal(mesh.acceptGuard(guard(`vx_${i}`)), "ok");
  assert.equal(mesh.acceptGuard(guard("vx_nova")), "full");
  assert.equal(mesh.acceptGuard(guard("vx_0", { updatedAt: 999 })), "ok");
  assert.equal(mesh.heldCount(), mesh.MAX_HELD);
});

test("guarda — soltar apaga só a dona pedida", () => {
  mesh.acceptGuard(guard("vx_a"));
  mesh.acceptGuard(guard("vx_b"));
  assert.equal(mesh.dropHeld("vx_a"), true);
  assert.equal(mesh.dropHeld("vx_a"), false);
  assert.deepEqual(Object.keys(mesh.loadHeld()), ["vx_b"]);
});

test("decisão — veto e já entregue descartam; aprovação entrega; sem resposta espera 24 h; mais de 72 h descarta", () => {
  const t = 1_000_000;
  const base = { t, firstSeen: t };
  assert.equal(mesh.decideRequest(base, t + HOUR), "wait");
  assert.equal(mesh.decideRequest(base, t + 24 * HOUR - 1), "wait");
  assert.equal(mesh.decideRequest(base, t + 24 * HOUR), "release");
  assert.equal(mesh.decideRequest({ ...base, decision: "sim" }, t + 1), "release");
  assert.equal(mesh.decideRequest({ ...base, decision: "nao" }, t + 48 * HOUR), "drop", "veto vale mesmo depois da espera");
  assert.equal(mesh.decideRequest({ ...base, answered: true }, t + 48 * HOUR), "drop", "entrega uma vez só");
  assert.equal(mesh.decideRequest({ ...base, decision: "sim" }, t + 73 * HOUR), "drop", "pedido vencido");
  assert.equal(mesh.decideRequest({ t, firstSeen: t + 30 * HOUR }, t + 40 * HOUR), "wait", "a espera conta do aviso");
});

test("cofre desta conta — lembra, avisa a página e zera quem recebeu quando o endereço muda", () => {
  let events = 0;
  const onChange = () => events++;
  globalThis.addEventListener?.("vox-cofre-malha-mudou", onChange);
  mesh.rememberMine({ routeId: "vx_a", address: A1, record: RECORD, updatedAt: 1 });
  mesh.markSent(["vx_1", "vx_2"]);
  mesh.markSent(["vx_2", "vx_3"]);
  assert.deepEqual(mesh.loadMine().sentTo, ["vx_1", "vx_2", "vx_3"]);
  mesh.rememberMine({ routeId: "vx_a", address: A2, record: RECORD, updatedAt: 2 });
  const mine = mesh.loadMine();
  assert.equal(mine.address, A2);
  assert.deepEqual(mine.sentTo, []);
  assert.deepEqual(mine.previousHolders, ["vx_1", "vx_2", "vx_3"], "quem guardava recebe o cofre novo primeiro");
  mesh.rememberMine({ routeId: "vx_outra", address: A1, record: RECORD });
  assert.deepEqual(mesh.loadMine().previousHolders, [], "outra conta não herda a lista");
  if (globalThis.addEventListener) assert.equal(events, 3);
  globalThis.removeEventListener?.("vox-cofre-malha-mudou", onChange);
});

test("cofre desta conta — endereço inválido, conta vazia ou cofre grande não são lembrados", () => {
  mesh.rememberMine({ routeId: "vx_a", address: "x", record: RECORD });
  mesh.rememberMine({ routeId: "", address: A1, record: RECORD });
  mesh.rememberMine({ routeId: "vx_a", address: A1, record: { ct: "x".repeat(mesh.MAX_RECORD_CHARS) } });
  assert.equal(mesh.loadMine(), null);
  mesh.rememberMine({ routeId: "vx_a", address: A1, record: RECORD });
  mesh.forgetMine();
  assert.equal(mesh.loadMine(), null);
});

test("quem guarda — no máximo 7, sem repetir, os antigos primeiro", () => {
  const ids = Array.from({ length: 10 }, (_, i) => `vx_${i}`);
  assert.deepEqual(mesh.pickHolders({ sentTo: [] }, ids), ids.slice(0, 7));
  assert.deepEqual(mesh.pickHolders({ sentTo: ["vx_0", "vx_1"] }, ids), ids.slice(2, 7));
  assert.deepEqual(mesh.pickHolders({ sentTo: ids.slice(0, 7) }, ids), []);
  assert.deepEqual(mesh.pickHolders({ sentTo: [], previousHolders: ["vx_9"] }, ["vx_1", "vx_9", ""]), ["vx_9", "vx_1"]);
});

test("avisos — sem repetir pedido do mesmo guarda; decidir tira os avisos de todos os guardas", () => {
  assert.equal(mesh.addNotice({ holder: "vx_h1", requestId: "r1", firstSeen: 1 }), true);
  assert.equal(mesh.addNotice({ holder: "vx_h1", requestId: "r1", firstSeen: 2 }), false);
  mesh.addNotice({ holder: "vx_h2", requestId: "r1", firstSeen: 3 });
  mesh.addNotice({ holder: "vx_h1", requestId: "r2", firstSeen: 4 });
  const taken = mesh.takeNotices("r1");
  assert.deepEqual(taken.map((n) => n.holder), ["vx_h1", "vx_h2"]);
  assert.deepEqual(mesh.loadNotices().map((n) => n.requestId), ["r2"]);
});

test("pedido do aparelho novo — guardado até vencer em 72 h", async () => {
  const { publicJwk } = await cryptoDm.generateDmKeypair();
  const now = 1_000_000_000_000;
  mesh.savePending({ address: A1, request: mesh.buildRequest({ publicJwk, now }), requestId: "r", sealedPrivate: {} });
  assert.equal(mesh.loadPending(now + HOUR).address, A1);
  assert.equal(mesh.loadPending(now + 73 * HOUR), null);
  mesh.savePending(null);
  assert.equal(mesh.loadPending(now), null);
});

test("armazenamento quebrado não derruba nada (a malha é atalho)", () => {
  localStorage.setItem(mesh.HELD_STORAGE, "{quebrado");
  localStorage.setItem(mesh.NOTICES_STORAGE, "\"não é lista\"");
  assert.deepEqual(mesh.loadHeld(), {});
  assert.deepEqual(mesh.loadNotices(), []);
  assert.equal(mesh.acceptGuard(guard("vx_a")), "ok");
});
