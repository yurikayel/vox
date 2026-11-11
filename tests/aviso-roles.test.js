import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const aviso = await import("../client/js/aviso.js");
const roles = await import("../client/js/aviso-roles.js");
const rolesDm = await import("../client/js/app/aviso-roles-dm.js");
const view = await import("../client/js/render/aviso.js");

const NOW = Date.UTC(2026, 11, 1, 12);
const DAY = 24 * 60 * 60 * 1000;
const META = { id: "c1", owner: "vx_dono", moderators: "vx_mod" };

const draft = (extra = {}) => ({
  communityId: "c1",
  avisoKind: "convocacao",
  title: "Ato na praça central",
  eventAt: NOW + 2 * DAY,
  roleSlots: "Jurídico 2, comunicação 3",
  ...extra,
});
const call = (extra = {}) => ({ ...aviso.buildAviso(draft(extra), NOW), id: "a1", author: "vx_dono", ...extra });
const claim = (author, role, ts) => ({ ...roles.buildRoleClaim(call(), role, {}, ts), author, sig: "s" });

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("chamada — papéis e vagas viram texto no topo; nomes com acento e quórum padrão", () => {
  assert.equal(roles.parseRoleInput("Jurídico 2, comunicação 3"), "jurídico:2,comunicação:3");
  assert.equal(roles.parseRoleInput(""), "");
  for (const bad of ["jurídico", "jurídico 0", "jurídico 100", "a 1", "x 1, x 2", "a:b 2", "p1 1,p2 1,p3 1,p4 1,p5 1,p6 1,p7 1"]) {
    assert.equal(roles.parseRoleInput(bad), null, bad);
  }
  const body = aviso.buildAviso(draft(), NOW);
  assert.equal(body.roleSlots, "jurídico:2,comunicação:3");
  assert.equal(body.quorumMin, 5);
  for (const value of Object.values(body)) assert.notEqual(typeof value, "object");
});

test("chamada — só convocação leva papéis; quórum entre 1 e o total de vagas", () => {
  assert.deepEqual(aviso.validateAvisoDraft(draft({ quorumMin: 4 })), []);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ avisoKind: "informe", eventAt: 0 })), ["roleSlots"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ roleSlots: "jurídico" })), ["roleSlots"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ quorumMin: 6 })), ["quorumMin"]);
  assert.deepEqual(aviso.validateAvisoDraft(draft({ roleSlots: "", quorumMin: 3 })), ["quorumMin"]);
  assert.equal(aviso.buildAviso(draft({ roleSlots: "" }), NOW).roleSlots, undefined);
});

test("chamada — resposta com papel: só papéis do aviso; desistir vale; DM ida e volta", () => {
  assert.throws(() => roles.buildRoleClaim(call(), "saúde"), /fora do aviso/);
  assert.equal(roles.buildRoleClaim(call(), "").role, "");
  const signed = claim("vx_ana", "Jurídico", NOW);
  assert.equal(signed.role, "jurídico");
  assert.deepEqual(roles.parseRoleClaimDm(roles.serializeRoleClaimDm(signed, "oi")), signed);
  assert.equal(roles.parseRoleClaimDm('{"__vox_dm_v2":1,"kind":"aviso-papel","claim":{}}'), null);
  assert.equal(roles.parseRoleClaimDm("texto comum"), null);
});

test("chamada — contagem: última resposta de cada um; quem desistiu sai; publica só números", () => {
  const claims = [claim("vx_ana", "jurídico", 1), claim("vx_bia", "jurídico", 2), claim("vx_ana", "", 3), claim("vx_caio", "comunicação", 4)];
  const counts = roles.tallyRoles(claims, "a1");
  assert.deepEqual(counts, { "jurídico": 1, "comunicação": 1 });
  const count = roles.buildRoleCount(call(), counts, NOW);
  assert.equal(count.countRoles, "jurídico:1,comunicação:1");
  assert.ok(!JSON.stringify(count).includes("vx_bia"));
  const fake = { ...count, author: "vx_estranho", countedAt: NOW + 1 };
  assert.equal(roles.latestRoleCount([{ ...count, author: "vx_dono" }, fake], "a1", META).author, "vx_dono");
});

test("chamada — estado: aberta, quórum atingido e sem quórum depois do encontro", () => {
  const a = call({ quorumMin: 3 });
  const count = (s) => ({ countRoles: s });
  assert.equal(roles.actionCallState(a, null, NOW).counted, false);
  assert.equal(roles.actionCallState(a, count("jurídico:1,comunicação:1"), NOW).state, "aberta");
  const full = roles.actionCallState(a, count("jurídico:5,comunicação:1"), NOW);
  assert.equal(full.filled, 3, "vaga a mais não conta");
  assert.equal(full.state, "quorum");
  assert.equal(roles.actionCallState(a, count("jurídico:1"), NOW + 3 * DAY).state, "sem-quorum");
  assert.equal(roles.actionCallState({ roleSlots: "" }), null);
});

test("chamada — enviar: cifra para quem convocou, guarda no fio, lembra o papel e não usa gossip", async () => {
  const storage = memoryStorage();
  const sent = [];
  const deps = {
    getDmPub: async (addr) => (addr === "vx_dono" ? "pub-dono" : null),
    sign: async (body) => ({ ...body, author: "vx_ana", sig: "s" }),
    seal: async (pub, text, meta) => ({ id: "env1", ts: NOW, pub, text, ...meta }),
    dispatch: async (addr, env) => { sent.push([addr, env]); return "delivered"; },
    saveDm: async (msg) => sent.push(["dm", msg]),
    storage,
  };
  const status = await rolesDm.sendRoleClaim("vx_ana", call(), { role: "jurídico", code: "A7F3" }, deps);
  assert.equal(status, "delivered");
  assert.equal(sent[0][0], "vx_dono");
  assert.equal(sent[0][1].pub, "pub-dono");
  assert.equal(roles.parseRoleClaimDm(sent[0][1].text).role, "jurídico");
  assert.match(sent[1][1].text, /Jurídico.*A7F3/);
  assert.equal(rolesDm.myRoleFor("a1", storage), "jurídico");
  assert.equal(await rolesDm.sendRoleClaim("vx_ana", { ...call(), author: "vx_sem_chave" }, { role: "" }, deps), "no-key");
  const source = fs.readFileSync(new URL("../client/js/app/aviso-roles-dm.js", import.meta.url), "utf8");
  assert.ok(!/broadcastGossip|saveLocalPost/.test(source), "resposta com papel nunca vai para a malha");
});

test("chamada — receber: só quem convocou guarda, com assinatura válida, papel do aviso e sem repetir", async () => {
  const storage = memoryStorage();
  const deps = (over = {}) => ({
    verify: async (c) => c.sig === "s",
    getSelves: async () => ["vx_dono"],
    getPost: async () => call(),
    storage,
    ...over,
  });
  const ok = claim("vx_ana", "jurídico", NOW);
  assert.equal(await rolesDm.receiveRoleClaimDm({ ...ok, sig: "x" }, deps()), false);
  assert.equal(await rolesDm.receiveRoleClaimDm(ok, deps({ getSelves: async () => ["vx_mod"] })), false);
  assert.equal(await rolesDm.receiveRoleClaimDm({ ...ok, role: "saúde" }, deps()), false);
  assert.equal(await rolesDm.receiveRoleClaimDm(ok, deps()), true);
  assert.equal(await rolesDm.receiveRoleClaimDm(ok, deps()), false);
  assert.equal(rolesDm.receivedClaims("a1", storage).length, 1);
});

test("chamada — tela: vagas e quórum para todos; nomes só no painel de quem convocou", () => {
  const state = roles.actionCallState(call(), { countRoles: "jurídico:1,comunicação:0" }, NOW);
  const item = { aviso: { ...call(), avisoState: "ativo" }, code: "A7F3", tally: null, count: null, myChoice: "", call: state, myRole: "jurídico" };
  const member = view.renderAvisoCard(item, { canRespond: true });
  assert.ok(member.includes("<strong>Vagas:</strong> Jurídico 1/2 · Comunicação 0/3"));
  assert.ok(member.includes("<strong>Quórum:</strong> 1 de 5 · Aberta"));
  assert.match(member, /is-active" data-aviso-action="assumir" data-aviso-id="a1" data-role="jurídico"/);
  assert.ok(member.includes("Desistir do papel"));
  assert.ok(!member.includes("Só você vê os nomes"));
  const received = [claim("vx_ana", "jurídico", NOW)].map((c) => ({ ...c, authorDisplay: "Ana <b>" }));
  const coord = view.renderAvisoCard({ ...item, received }, { isMod: true, canRespond: true });
  assert.ok(coord.includes("<strong>Jurídico:</strong> Ana &lt;b&gt;"));
  assert.ok(coord.includes("<strong>Comunicação:</strong> ninguém ainda"));
  assert.ok(coord.includes('data-aviso-action="publicar-papeis"'));
});
