import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const arrival = await import("../client/js/invite-arrival.js");
const render = await import("../client/js/render.js");

class Store {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const T0 = Date.UTC(2026, 10, 13);

test("convite: guarda quem chamou e devolve enquanto vale", () => {
  const s = new Store();
  assert.equal(arrival.rememberInviteArrival({ inviter: "vx_ana", token: TOKEN, name: " Ana " }, s, T0), true);
  assert.deepEqual(arrival.peekInviteArrival(s, T0 + 1000), { inviter: "vx_ana", token: TOKEN, name: "Ana", at: T0 });
  assert.equal(arrival.inviteArrivalHash({ inviter: "vx_ana", token: TOKEN }), `#/connect/vx_ana?convite=${TOKEN}`);
});

test("convite: token inválido, sem quem chamou ou vencido não vale", () => {
  const s = new Store();
  assert.equal(arrival.rememberInviteArrival({ inviter: "vx_ana", token: "curto" }, s, T0), false);
  assert.equal(arrival.rememberInviteArrival({ inviter: " ", token: TOKEN }, s, T0), false);
  assert.equal(arrival.peekInviteArrival(s, T0), null);
  arrival.rememberInviteArrival({ inviter: "vx_ana", token: TOKEN }, s, T0);
  assert.equal(arrival.peekInviteArrival(s, T0 + arrival.INVITE_ARRIVAL_TTL_MS + 1), null, "vence em 7 dias");
  assert.equal(arrival.peekInviteArrival(s, T0 - 1), null, "data no futuro não vale");
  s.setItem(arrival.INVITE_ARRIVAL_KEY, "{quebrado");
  assert.equal(arrival.peekInviteArrival(s, T0), null);
});

test("convite: o nome não vai para o armazenamento; nome igual à chave não vira nome; esquecer apaga", () => {
  const s = new Store();
  arrival.rememberInviteArrival({ inviter: "vx_bia", token: TOKEN, name: "Bia" }, s, T0);
  assert.ok(!s.getItem(arrival.INVITE_ARRIVAL_KEY).includes("Bia"), "só chave e token são gravados");
  arrival.rememberInviteArrival({ inviter: "vx_ana", token: TOKEN, name: "vx_ana" }, s, T0);
  assert.equal(arrival.peekInviteArrival(s, T0).name, "");
  arrival.clearInviteArrival(s);
  assert.equal(arrival.peekInviteArrival(s, T0), null);
});

test("entrada por convite: diz quem chamou, com o nome escapado; sem convite, nada muda", () => {
  const c = { innerHTML: "" };
  render.renderOAuthEnrich(c, { invite: { name: "<b>Ana</b>" } });
  assert.ok(c.innerHTML.includes("<strong>&lt;b&gt;Ana&lt;/b&gt;</strong> te chamou para o Vox"));
  render.renderOAuthEnrich(c, { invite: { name: "" } });
  assert.ok(c.innerHTML.includes("Alguém te chamou para o Vox"));
  render.renderOAuthEnrich(c);
  assert.ok(!c.innerHTML.includes("te chamou"));
});
