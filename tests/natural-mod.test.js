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
  assert.deepEqual(model, { sponsor: "vx_bia", closest: "vx_caio", godchildren: ["vx_eva", "vx_fabi"], common: ["vx_caio", "vx_davi"], mediationOnly: [], switching: null });
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

const cases = await import("../client/js/app/natural-case-flow.js");
const moderation = await import("../client/js/moderation.js");

function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

test("casos (lote B) — N1 é avisado pela moderação, N2 por quem denunciou; o aviso nunca leva quem denunciou", async () => {
  const sent = [];
  const deps = {
    loadLinks: graph,
    getDmPub: async () => "pub",
    seal: async (pub, text, meta) => ({ id: `e${sent.length}`, ts: 1, text, ...meta }),
    dispatch: async (addr, env) => { sent.push([addr, env]); return "delivered"; },
    saveDm: async () => {},
  };
  const rec = { id: "rep1", postId: "p1", communityId: "c1", reason: "spam" };
  const n1 = await cases.sendCaseNotice("vx_dono", rec, { side: "target", target: "vx_eva", reporter: "vx_caio" }, deps);
  assert.deepEqual([n1.to, n1.side], ["vx_ana", "target"]);
  assert.equal(sent[0][1].from, "vx_dono", "o aviso de N1 sai do aparelho da moderação, não de quem denunciou");
  const notice = natural.parseCaseDm(sent[0][1].text);
  assert.ok(!JSON.stringify(notice).includes("vx_caio"), "o aviso não leva quem denunciou");
  const n2 = await cases.sendCaseNotice("vx_caio", rec, { side: "reporter", target: "vx_eva", reporter: "vx_caio" }, deps);
  assert.equal(n2, null, "Caio só tem vínculo com Ana, que já é N1: não recebe o aviso que revelaria quem denunciou");
  const n2ok = await cases.sendCaseNotice("vx_ana", rec, { side: "reporter", target: "vx_davi", reporter: "vx_ana" }, deps);
  assert.deepEqual([n2ok.to, n2ok.side], ["vx_bia", "reporter"]);
  assert.equal(await cases.sendCaseNotice("vx_dono", { ...rec, reason: "crianca" }, { side: "target", target: "vx_eva", reporter: "vx_caio" }, deps), null);
  assert.equal(natural.parseCaseDm('{"__vox_dm_v2":1,"kind":"moderacao-natural","natCase":{}}'), null);
});

test("casos (lote B) — a moderação avisa N1 ao receber a denúncia, com quem é o alvo", async () => {
  const reportDm = await import("../client/js/app/report-dm.js");
  const calls = [];
  const storage = memStorage();
  const signed = { type: "vox-report", reportId: "rep9", postId: "p9", communityId: "c1", reason: "spam", ts: Date.now(), author: "vx_caio", sig: "s" };
  await reportDm.receiveReportDm({}, signed, {
    verify: async () => true, getSelves: async () => ["vx_dono"], getCommunity: async () => ({ owner: "vx_dono" }),
    getPost: async () => ({ id: "p9", owner: "vx_eva" }), checkMembership: async () => true,
    dispatchModAction: async () => {}, notify: () => {}, storage, now: () => Date.now(),
    notifyNatural: async (s, ctx) => calls.push([s.reportId, ctx]),
  });
  assert.deepEqual(calls, [["rep9", { self: "vx_dono", target: "vx_eva" }]]);
});

test("casos (lote B) — recebe sem repetir; tela oferece arquivar só com poder firme e sempre a recusa", () => {
  const storage = memStorage();
  const notice = natural.buildCaseNotice({ caseId: "rep1", postId: "p1", communityId: "c1", target: "vx_eva", reason: "spam", side: "target" });
  assert.equal(cases.receiveCase({ ...notice, reporter: "vx_davi", from: "vx_davi" }, { storage }), true);
  assert.equal(cases.receiveCase(notice, { storage }), false);
  const list = cases.listCases(storage);
  assert.equal(list[0].status, "aberto");
  assert.ok(!JSON.stringify(list).includes("vx_davi"), "o caso guardado não tem quem denunciou nem quem mandou o aviso");
  const firm = cases.renderCasesHtml(list, () => true);
  assert.ok(firm.includes('data-case-action="arquivar"'));
  assert.ok(firm.includes('data-case-action="recusar"'));
  assert.ok(firm.includes("Spam, golpe ou fraude"));
  const soft = cases.renderCasesHtml(list, () => false);
  assert.ok(soft.includes('data-case-action="revisao"') && !soft.includes('data-case-action="arquivar"'));
});

async function hideBy(hider, target, proof, ts = 100) {
  return { ...natural.buildNaturalHide({ communityId: "c1", postId: "p1", target, proofRecord: proof }, ts), author: hider, sig: "ok" };
}

test("arquivamento firme (lote C) — só o padrinho, com a prova do vínculo assinada", async () => {
  const proof = link("vx_ana", "vx_eva", { sponsor: true, ts: 20 });
  assert.ok(await natural.verifyNaturalHide(await hideBy("vx_ana", "vx_eva", proof), verify));
  assert.equal(await natural.verifyNaturalHide(await hideBy("vx_bia", "vx_eva", proof), verify), null, "prova de outra pessoa");
  assert.equal(await natural.verifyNaturalHide(await hideBy("vx_ana", "vx_davi", link("vx_ana", "vx_davi")), verify), null, "vínculo comum não arquiva de vez");
  assert.equal(await natural.verifyNaturalHide({ ...(await hideBy("vx_ana", "vx_eva", proof)), sig: "x" }, verify), null);
});

test("arquivamento firme (lote D) — até 30 afilhados e menos de 3 reversões em 90 dias", async () => {
  const many = await natural.collectLinks(Array.from({ length: 31 }, (_, i) => link("vx_madrinha", `vx_af${String(i).padStart(2, "0")}`, { sponsor: true, ts: i + 1 })), verify);
  assert.equal(natural.hasFirmPower(many, "vx_madrinha", "vx_af29"), true);
  assert.equal(natural.hasFirmPower(many, "vx_madrinha", "vx_af30"), false, "o 31º afilhado não");
  assert.equal(natural.hasFirmPower(many, "vx_madrinha", "vx_af00", { reversals: 3 }), false);
  const hides = [{ hider: "vx_m", postId: "a", ts: 10 }, { hider: "vx_m", postId: "b", ts: 10 }, { hider: "vx_m", postId: "c", ts: 10 }];
  const DAY = 864e5;
  const unhides = [{ target: "a", ts: 20 }, { target: "b", ts: 5 }, { target: "c", ts: 20 }, { target: "x", ts: 20 }];
  assert.equal(natural.reversalsAgainst("vx_m", { hides, unhides, now: 30 }), 2, "unhide antes do arquivamento e de outro post não contam");
  assert.equal(natural.reversalsAgainst("vx_m", { hides, unhides, now: 20 + 91 * DAY }), 0, "fora da janela de 90 dias");
});

test("arquivamento firme — esconde só o post do afilhado; unhide da moderação desfaz; de fora não se forja", () => {
  const items = [{ id: "p1", owner: "vx_eva" }, { id: "p2", owner: "vx_bia" }];
  const nat = (target, author, ts = 10) => ({ id: `n_${target}`, action: "natural-hide", target, targetAuthor: author, ts, naturalVerified: true });
  assert.deepEqual(moderation.applyFilters(items, [nat("p1", "vx_eva")], "vx_dono").map((i) => i.id), ["p2"]);
  assert.deepEqual(moderation.applyFilters(items, [nat("p2", "vx_eva")], "vx_dono").map((i) => i.id), ["p1", "p2"], "afilhado errado: não esconde");
  const undo = { id: "u", action: "unhide", target: "p1", owner: "vx_dono", ts: 20 };
  assert.equal(moderation.applyFilters(items, [nat("p1", "vx_eva"), undo], "vx_dono").length, 2);
  const forged = { ...nat("p1", "vx_eva"), naturalVerified: "true" };
  assert.equal(moderation.applyFilters(items, [forged], "vx_dono").length, 2, "só o aparelho constrói a ação conferida");
  const authorView = moderation.applyFilters(items, [nat("p1", "vx_eva")], "vx_dono", "", "vx_eva");
  assert.equal(authorView.find((i) => i.id === "p1")?.inReview, true, "o autor vê o próprio post em revisão");
  const src = fs.readFileSync(new URL("../client/js/moderation.js", import.meta.url), "utf8");
  assert.equal((src.match(/naturalVerified: false/g) || []).length, 2, "ação vinda de fora perde a marca de conferida");
});

test("arquivamento natural não desfaz nem substitui o que a moderação escondeu", () => {
  const items = [{ id: "p1", owner: "vx_vitima" }];
  const shown = (actions) => moderation.applyFilters(items, actions, "vx_dono", "", "vx_leitor").length === 1;
  const modHide = { id: "h", action: "hide", target: "p1", owner: "vx_dono", ts: 1000 };
  const nat = (ts, author) => ({ id: "n", action: "natural-hide", target: "p1", targetAuthor: author, ts, naturalVerified: true });
  assert.equal(shown([modHide]), false, "controle: a moderação escondeu");
  assert.equal(shown([modHide, nat(2000, "vx_laranja")]), false, "padrinho de outra pessoa, depois do hide");
  assert.equal(shown([nat(500, "vx_laranja"), modHide]), false, "padrinho de outra pessoa, antes do hide");
  assert.equal(shown([modHide, nat(2000, "vx_vitima")]), false, "padrinho de verdade: segue escondido");
  const review = { id: "r", action: "review-hide", target: "p1", owner: "vx_dono", ts: 1000 };
  assert.equal(shown([review, nat(2000, "vx_laranja")]), false, "o mesmo vale para o arquivamento em revisão");
  const undo = { id: "u", action: "unhide", target: "p1", owner: "vx_dono", ts: 3000 };
  assert.equal(shown([modHide, nat(2000, "vx_vitima"), undo]), true, "o unhide da moderação continua desfazendo tudo");
});

test("arquivamento natural — data no futuro ou antes do post não vale", async () => {
  const MIN = 60 * 1000;
  const now = 1_000_000_000;
  const ok = (ts, postTs = now - 60 * MIN) => natural.isPlausibleHideTime({ ts }, { postTs, now });
  assert.equal(ok(now), true);
  assert.equal(ok(now + 4 * MIN), true, "folga de relógio");
  assert.equal(ok(now + 6 * MIN), false, "futuro: a moderação nunca desfaria");
  assert.equal(ok(now - 61 * MIN - 5 * MIN), false, "antes do post: escaparia da contagem de reversões");
  assert.equal(ok(0), false, "sem data");
  const hides = [{ postId: "p1", ts: now }, { postId: "p1", ts: now + 365 * 24 * 60 * MIN }, { postId: "p2", ts: now - 10 * MIN }, { postId: "sumiu", ts: now }];
  const posts = { p1: { ts: now - 60 * MIN }, p2: { ts: now - MIN } };
  const kept = await flow.withPlausibleTime(hides, async (id) => posts[id] || null, now);
  assert.deepEqual(kept, [hides[0]], "fica só o datado entre o post e agora; sem o post, fica de fora");
});

test("reversões — com a data presa ao post, datar para trás não devolve o poder sobre post novo", () => {
  const DAY = 864e5;
  const now = 200 * DAY;
  const past = [1, 2, 3].map((i) => ({ hider: "vx_m", postId: `p${i}`, ts: now - 10 * DAY }));
  const unhides = [1, 2, 3].map((i) => ({ target: `p${i}`, ts: now - 5 * DAY }));
  const count = (ts) => natural.reversalsAgainst("vx_m", { hides: past, unhides: unhides.filter((u) => u.ts < ts), now: ts });
  const backdated = { ts: now - 6 * DAY };
  assert.equal(count(backdated.ts), 0, "a contagem sozinha seria enganada pela data retroativa");
  assert.equal(natural.isPlausibleHideTime(backdated, { postTs: now - DAY, now }), false, "mas o post é de ontem: a data retroativa é recusada");
  assert.equal(count(now), 3, "com a data honesta, as 3 reversões contam e o poder caiu");
});

const linkCard = await import("../client/js/render/vox-link.js");

test("lote F — vínculo só para mediação não dá poder; serve para mediação", async () => {
  const only = await natural.collectLinks([link("vx_ana", "vx_eva", { sponsor: true, ts: 1 })].map((r) => {
    const accept = { ...JSON.parse(r.accept), scope: "mediacao" };
    return { ...r, accept: JSON.stringify(accept) };
  }), verify);
  assert.equal(only[0].mediationOnly, true);
  assert.equal(natural.caseModerators(only, { target: "vx_eva" }).n1, null, "denúncia ignora o vínculo só de mediação");
  assert.deepEqual(natural.caseModerators(only, { target: "vx_eva", purpose: "mediacao" }).n1, { route: "vx_ana", via: "padrinho" });
  assert.equal(natural.hasFirmPower(only, "vx_ana", "vx_eva"), false);
  assert.deepEqual(natural.myLinksModel(only, "vx_eva").mediationOnly, ["vx_ana"]);
  const accept = voxLink.buildAccept({ me: "vx_eva", inviter: "vx_ana", token: TOKEN, mediationOnly: true });
  assert.equal(accept.scope, "mediacao");
});

test("lote F — troca de padrinho vale 7 dias depois; o padrinho antigo perde o afilhado", async () => {
  const DAY = 864e5;
  const swap = (() => {
    const accept = { ...voxLink.buildAccept({ me: "vx_ana", inviter: "vx_caio", token: TOKEN, sponsor: true, switchFrom: "vx_bia", now: 50 }), author: "vx_ana", sig: "ok" };
    return { ...voxLink.buildConfirm(accept, 50), author: "vx_caio", sig: "ok" };
  })();
  const links = await natural.collectLinks([link("vx_bia", "vx_ana", { sponsor: true, ts: 10 }), swap], verify);
  assert.equal(natural.sponsorOf(links, "vx_ana", 50 + DAY), "vx_bia", "antes de 7 dias, continua o de antes");
  assert.deepEqual(natural.pendingSwitch(links, "vx_ana", 50 + DAY), { to: "vx_caio", from: "vx_bia", at: 50 + 7 * DAY });
  assert.equal(natural.sponsorOf(links, "vx_ana", 50 + 8 * DAY), "vx_caio");
  assert.deepEqual(natural.godchildrenOf(links, "vx_bia", 50 + 8 * DAY), []);
  assert.equal(voxLink.buildAccept({ me: "vx_a", inviter: "vx_b", token: TOKEN, switchFrom: "vx_c" }).switchFrom, undefined, "troca só com padrinho");
  assert.ok(voxLink.hasSwitched([{ kind: "accept", author: "vx_ana", sponsor: true, switchFrom: "vx_bia" }], "vx_ana"));
});

test("lote F — o cartão do convite só mostra as opções novas com a flag", () => {
  const base = { name: "Caio", state: "none", canSponsor: false, canSwitch: true };
  assert.ok(!linkCard.renderInviteCardHtml(base).includes("vox-link-mediation"));
  const on = linkCard.renderInviteCardHtml({ ...base, options: true });
  assert.ok(on.includes('id="vox-link-mediation"') && on.includes('id="vox-link-switch"'));
  assert.ok(!linkCard.renderInviteCardHtml({ ...base, canSponsor: true, options: true }).includes("vox-link-switch"), "sem padrinho ainda, não há o que trocar");
});
