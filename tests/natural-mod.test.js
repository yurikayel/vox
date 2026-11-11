import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const natural = await import("../client/js/natural-mod.js");
const voxLink = await import("../client/js/vox-link.js");
const flow = await import("../client/js/app/natural-mod-flow.js");

const TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";
/** Vínculo assinado (as duas metades) entre quem convidou e quem aceitou. */
function link(inviter, invitee, { sponsor = false, ts = 1 } = {}) {
  const accept = { ...voxLink.buildAccept({ me: invitee, inviter, token: TOKEN, sponsor, now: ts }), author: invitee, sig: "ok" };
  return { ...voxLink.buildConfirm(accept, ts), author: inviter, sig: "ok" };
}
const verify = async (r) => r.sig === "ok";

async function graph() {
  return natural.collectLinks([
    link("vx_bia", "vx_ana", { sponsor: true, ts: 10 }),
    link("vx_caio", "vx_ana", { ts: 5 }),
    link("vx_ana", "vx_davi", { ts: 7 }),
    link("vx_ana", "vx_eva", { sponsor: true, ts: 20 }),
    link("vx_ana", "vx_fabi", { sponsor: true, ts: 30 }),
    { ...link("vx_zeca", "vx_ana", { ts: 1 }), sig: "falsa" },
  ], verify);
}

test("moderador natural — só vínculos com as duas assinaturas; par repetido conta uma vez", async () => {
  const links = await graph();
  assert.equal(links.length, 5);
  assert.ok(!links.some((l) => l.inviter === "vx_zeca"), "assinatura falsa fica de fora");
  const dup = await natural.collectLinks([link("vx_bia", "vx_ana", { ts: 9 }), link("vx_bia", "vx_ana", { ts: 3 })], verify);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].since, 3);
});

test("moderador natural — padrinho primeiro; sem padrinho, o vínculo comum mais antigo", async () => {
  const links = await graph();
  assert.equal(natural.sponsorOf(links, "vx_ana"), "vx_bia");
  assert.deepEqual(natural.godchildrenOf(links, "vx_ana"), ["vx_eva", "vx_fabi"]);
  assert.deepEqual(natural.naturalModeratorOf(links, "vx_ana"), { route: "vx_bia", via: "padrinho" });
  assert.deepEqual(natural.naturalModeratorOf(links, "vx_davi"), { route: "vx_ana", via: "proximo" });
  assert.equal(natural.naturalModeratorOf(links, "vx_ninguem"), null);
});

test("moderador natural — nunca a outra parte; membro da comunidade tem preferência", async () => {
  const links = await graph();
  assert.deepEqual(natural.naturalModeratorOf(links, "vx_ana", { exclude: ["vx_bia"] }), { route: "vx_caio", via: "proximo" });
  const members = new Set(["vx_davi"]);
  assert.equal(natural.closestOf(links, "vx_ana", { members }), "vx_davi");
  assert.equal(natural.closestOf(links, "vx_ana"), "vx_caio");
  const { n1, n2 } = natural.caseModerators(links, { target: "vx_eva", reporter: "vx_ana" });
  assert.equal(n1, null, "o padrinho de Eva é Ana, que denunciou: ninguém do lado de Eva");
  assert.deepEqual(n2, { route: "vx_bia", via: "padrinho" });
});

test("moderador natural — 'Meus vínculos' mostra padrinho, afilhados e vínculos comuns", async () => {
  const model = natural.myLinksModel(await graph(), "vx_ana");
  assert.deepEqual(model, { sponsor: "vx_bia", closest: "vx_caio", godchildren: ["vx_eva", "vx_fabi"], common: ["vx_caio", "vx_davi"] });
  const html = flow.renderMyLinksHtml(model);
  assert.ok(html.includes("Seu padrinho:"));
  assert.ok(html.includes("Você é padrinho de 2:"));
  assert.ok(html.includes("não quem denunciou"));
  const alone = flow.renderMyLinksHtml(natural.myLinksModel([], "vx_x"));
  assert.ok(alone.includes("vão direto para a moderação da comunidade"));
});

test("moderador natural — a tela só monta com a flag de laboratório", async () => {
  const main = { html: "", querySelector: () => null, insertAdjacentHTML(_, h) { this.html += h; } };
  const deps = { me: "vx_ana", getRecords: async () => [link("vx_bia", "vx_ana", { sponsor: true })], verify };
  await flow.mountMyLinks(main, { ...deps, storage: { getItem: () => null } });
  assert.equal(main.html, "");
  await flow.mountMyLinks(main, { ...deps, storage: { getItem: () => "1" } });
  assert.ok(main.html.includes("Meus vínculos"));
});

const mediation = await import("../client/js/app/mediation-dm.js");
const fs = await import("node:fs");

test("mediação (lote E) — vai ao moderador natural de cada parte, sem repetir e sem a própria pessoa", async () => {
  const links = await graph();
  assert.deepEqual(mediation.mediationRecipients(links, { self: "vx_davi", target: "vx_ana" }), [
    { route: "vx_bia", via: "padrinho", side: "target" },
  ], "Davi só tem vínculo com Ana, que é a outra parte");
  const both = mediation.mediationRecipients(links, { self: "vx_eva", target: "vx_davi" });
  assert.deepEqual(both.map((r) => [r.route, r.side]), [["vx_ana", "target"]], "mesmo moderador nos dois lados vai uma vez");
  assert.deepEqual(mediation.mediationRecipients([], { self: "vx_x", target: "vx_y" }), []);
});

test("mediação (lote E) — mensagem cifrada com o cartão do post; sem chave fica marcado", async () => {
  const sent = [];
  const deps = {
    loadLinks: graph,
    getMembers: async () => null,
    getDmPub: async (addr) => (addr === "vx_bia" ? "pub-bia" : null),
    seal: async (pub, text, meta) => ({ id: "e1", ts: 1, pub, text, ...meta }),
    dispatch: async (addr, env) => { sent.push([addr, env]); return "delivered"; },
    saveDm: async () => {},
  };
  const out = await mediation.requestMediation("vx_caio", { postId: "p1", communityId: "c1", target: "vx_ana" }, deps);
  assert.deepEqual(out.map((r) => [r.route, r.status]), [["vx_bia", "delivered"]], "Caio só tem vínculo com Ana (a outra parte)");
  const noKey = await mediation.requestMediation("vx_eva", { postId: "p1", target: "vx_davi" }, deps);
  assert.deepEqual(noKey.map((r) => [r.route, r.status]), [["vx_ana", "no-key"]]);
  const payload = JSON.parse(sent[0][1].text);
  assert.equal(payload.kind, "message");
  assert.deepEqual([payload.contextCard.type, payload.contextCard.id, payload.contextCard.title], ["topic", "p1", "Pedido de mediação"]);
  assert.match(payload.text, /Ninguém arquivou nada/);
  const src = fs.readFileSync(new URL("../client/js/app/mediation-dm.js", import.meta.url), "utf8");
  assert.ok(!/quarantine|review-hide|dispatchModAction|broadcastGossip/.test(src), "mediação não arquiva e não vai para a malha");
});
