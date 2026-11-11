import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const termo = await import("../client/js/community-termo.js");
const report = await import("../client/js/report.js");
const flow = await import("../client/js/app/community-termo-flow.js");

const META = { id: "c1", owner: "vx_dono", moderators: "vx_mod" };
const TEXT = "Respeito acima de tudo.\nSem ataques pessoais e sem spam.";
const signed = (author, text, ts) => ({ ...termo.buildTermo("c1", text, ts), author, sig: "s" });

test("termo — texto de 20 a 2000 caracteres, limpo e no topo", () => {
  assert.equal(termo.validateTermoText("curto"), "curto");
  assert.equal(termo.validateTermoText("x".repeat(2001)), "longo");
  assert.equal(termo.validateTermoText(TEXT), "");
  const body = termo.buildTermo("c1", `  ${TEXT.replace("\n", "\r\n")}  `, 5);
  assert.deepEqual(body, { type: "community-termo", communityId: "c1", termoText: TEXT, ts: 5 });
  assert.throws(() => termo.buildTermo("c1", "curto"), /de 20 a 2000/);
});

test("termo — vale o mais recente de dono ou moderação; de fora é ignorado", () => {
  const items = [signed("vx_dono", TEXT, 1), signed("vx_mod", `${TEXT} Novo.`, 2), signed("vx_estranho", `${TEXT} Falso.`, 3)];
  assert.equal(termo.latestTermo(items, "c1", META).author, "vx_mod");
  assert.equal(termo.latestTermo(items, "c2", META), null);
});

test("termo — a entrada assina o hash; texto mudado pede nova assinatura", async () => {
  const atual = signed("vx_dono", TEXT, 1);
  const fields = await termo.membershipTermoFields(atual);
  assert.match(fields.termoHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(await termo.membershipTermoFields(null), {});
  assert.equal(await termo.termoStatus(null, {}), "sem-termo");
  assert.equal(await termo.termoStatus(atual, { termoHash: fields.termoHash }), "assinou");
  assert.equal(await termo.termoStatus(atual, {}), "nao-assinou");
  assert.equal(await termo.termoStatus(signed("vx_dono", `${TEXT} Mais.`, 2), fields), "mudou");
});

test("termo — tela: texto escapado, reassinar só para membro e editor só para moderação", () => {
  const atual = { ...signed("vx_dono", "Sem <script> aqui, por favor.\nObrigado.", 1) };
  const visitor = flow.renderTermoHtml(atual, "nao-assinou");
  assert.ok(visitor.includes("&lt;script&gt;"));
  assert.ok(visitor.includes("<br>"));
  assert.ok(visitor.includes("Ao participar, você assina este termo."));
  assert.ok(!visitor.includes("form-termo"));
  const member = flow.renderTermoHtml(atual, "mudou", { isMember: true });
  assert.ok(member.includes('id="btn-termo-assinar"'));
  assert.ok(member.includes("<details class=\"card community-termo\" open>"));
  assert.ok(flow.renderTermoHtml(null, "sem-termo", { isMod: true }).includes("Escrever o termo"));
  assert.equal(flow.renderTermoHtml(null, "sem-termo"), "");
});

test("termo — a entrada na comunidade leva os campos do termo", () => {
  const src = fs.readFileSync(new URL("../client/js/app/screens-community.js", import.meta.url), "utf8");
  assert.match(src, /joinTermoFields\(communityId\)[\s\S]{0,200}type: "membership", communityId, joinedAt: Date\.now\(\), \.\.\.termoFields/);
});

test("mediação — conversa com a moderação e cartão do post; não oculta nada", () => {
  const hash = report.buildMediationDmHash("vx_dono", { postId: "p1", communityId: "c1" });
  assert.equal(hash, "#/dm/vx_dono?ctxType=topic&ctxId=p1&ctxTitle=Pedido+de+media%C3%A7%C3%A3o&c=c1");
  assert.equal(report.buildMediationDmHash("", { postId: "p1" }), "");
  const menu = fs.readFileSync(new URL("../client/js/render/post-more-menu.js", import.meta.url), "utf8");
  assert.ok(menu.includes('data-action="mediation">Pedir mediação</button>'));
  const body = menu.slice(menu.indexOf("async function openMediation"), menu.indexOf("async function onSheetAction"));
  assert.ok(!/quarantine|saveReport|archive/i.test(body), "mediação não arquiva nem oculta");
});
