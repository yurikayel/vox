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
