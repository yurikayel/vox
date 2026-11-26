/**
 * @file Cobertura T6: sorteio cívico na aba de avisos (`app/sorteio-flow.js`): criar, ser testemunha, fechar,
 * revelar, apurar e o resultado recalculável, com identidade e cache reais sobre um DOM de mentira.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";
import { waitUntil } from "./helpers/wait-until.js";

const doc = installFakeDom();
const toasts = captureToasts(doc);

const flow = await import("../client/js/app/sorteio-flow.js");
const sorteio = await import("../client/js/sorteio.js");
const account = await import("../client/js/identity/index.js");
const cache = await import("../client/js/cache-node.js");

const me = await account.getRouteId();
const OTHERS = ["vx_ana", "vx_bia", "vx_caio", "vx_davi"];
const ctx = {
  communityId: "c1",
  meta: { id: "c1", owner: me, moderators: "" },
  members: new Set([me, ...OTHERS]),
  routeId: me,
  isMod: true,
};
const lastToast = () => toasts.at(-1)?.text;
const card = (host) => host.querySelector(".sorteio-card");
const button = (host, action) => host.querySelector(`[data-sorteio-action="${action}"]`);

async function until(check, label) {
  const got = await waitUntil(check, 3000);
  if (got) return got;
  throw new Error(`tempo esgotado: ${label}`);
}

const host = mount(doc, '<div class="aviso-screen"></div>');
const stored = (type) => cache.getLocalPosts({ type, communityId: "c1" });

test("sem host nada acontece; sem sorteios, só a moderação vê a seção com o formulário", async () => {
  assert.equal(await flow.mountSorteios(null, ctx), undefined);
  await flow.mountSorteios(host, { ...ctx, isMod: false });
  assert.equal(host.querySelector(".sorteios"), null, "membro sem sorteio não vê seção");
  await flow.mountSorteios(host, ctx);
  assert.ok(host.querySelector(".sorteios #form-sorteio"));
  assert.match(host.querySelector(".sorteios h2").textContent, /Sorteios/);
  await flow.mountSorteios(host, ctx);
  assert.equal(host.querySelectorAll(".sorteios").length, 1, "montar de novo substitui a seção");
});

test("criar: rascunho inválido mostra o erro; válido publica o sorteio com a lista de membros congelada", async () => {
  const form = host.querySelector("#form-sorteio");
  form.fields = { title: "x", seats: "2", commitUntil: "2031-01-01T10:00" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => /Sorteio inválido: title/.test(lastToast() || ""), "erro do rascunho");
  assert.equal(toasts.at(-1).type, "error");
  assert.equal((await stored("sorteio")).length, 0);
  form.fields = { title: "Comissão de contas", seats: "2", commitUntil: "2031-01-01T10:00" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => card(host), "cartão do sorteio");
  assert.equal(lastToast(), "Sorteio publicado.");
  const [draw] = await stored("sorteio");
  assert.equal(draw.author, me);
  assert.deepEqual(sorteio.decodeRoster(draw.roster).sort(), [me, ...OTHERS].sort());
  assert.equal(draw.seats, 2);
  assert.match(card(host).textContent, /Sorteio cívico · 2 de 5 membros/);
  assert.match(card(host).textContent, /Recebendo testemunhas/);
  assert.ok(button(host, "testemunhar") && button(host, "fechar"));
});

test("ser testemunha: o segredo fica só no aparelho e só o hash vai no compromisso público", async () => {
  click(button(host, "testemunhar"));
  await until(() => lastToast() === "Compromisso publicado. Seu segredo ficou só neste aparelho.", "compromisso");
  const secrets = JSON.parse(localStorage.getItem(flow.SECRETS_KEY));
  const [draw] = await stored("sorteio");
  const secret = secrets[draw.id];
  assert.match(secret, /^[0-9a-f]{64}$/);
  const [commit] = await stored("sorteio-compromisso");
  assert.equal(commit.author, me);
  assert.equal(commit.sorteioId, draw.id);
  assert.ok(!JSON.stringify(commit).includes(secret), "o segredo não vai na rede");
  await until(() => /Você é testemunha/.test(card(host)?.textContent || ""), "estado de testemunha");
  assert.equal(button(host, "testemunhar"), null);
  assert.match(button(host, "fechar").textContent, /Fechar compromissos \(1\)/);
});

async function seedOthers(type, build) {
  const [draw] = await stored("sorteio");
  for (const who of ["vx_ana", "vx_bia"]) {
    const body = await build(draw, who);
    await cache.saveLocalPost({ ...body, id: `${type}_${who}`, author: who, owner: who, sig: "s" });
  }
}
const secretOf = (who) => who.padEnd(64, "0").replace(/[^0-9a-f]/g, "a");

test("fechar compromissos: com 3 testemunhas a fase vira revelação e o botão de revelar aparece", async () => {
  await seedOthers("sorteio-compromisso", (draw, who) => sorteio.buildCommit(draw, secretOf(who)));
  await flow.mountSorteios(host, ctx);
  assert.match(button(host, "fechar").textContent, /Fechar compromissos \(3\)/);
  click(button(host, "fechar"));
  await until(() => lastToast() === "Compromissos fechados. As testemunhas já podem revelar.", "fecho");
  await until(() => /Testemunhas revelando/.test(card(host)?.textContent || ""), "fase de revelação");
  assert.match(card(host).textContent, /testemunhas: 3/);
  assert.ok(button(host, "revelar"), "quem está no fecho e guardou o segredo pode revelar");
  assert.match(button(host, "apurar").textContent, /Apurar \(0 de 3 revelaram\)/);
});

test("revelar e apurar: o resultado é sorteado, com sementes e vencedoras da lista, recalculável", async () => {
  click(button(host, "revelar"));
  await until(() => lastToast() === "Segredo revelado.", "revelação");
  await seedOthers("sorteio-revela", (draw, who) => sorteio.buildReveal(draw, secretOf(who)));
  await flow.mountSorteios(host, ctx);
  assert.match(button(host, "apurar").textContent, /Apurar \(3 de 3 revelaram\)/);
  assert.equal(button(host, "revelar"), null, "quem já revelou não vê o botão");
  click(button(host, "apurar"));
  await until(() => lastToast() === "Apuração publicada.", "apuração");
  await until(() => host.querySelector(".sorteio-winners"), "resultado");
  const winners = host.querySelectorAll(".sorteio-winners li");
  assert.equal(winners.length, 2);
  const [draw] = await stored("sorteio");
  const roster = sorteio.decodeRoster(draw.roster);
  for (const li of winners) assert.ok(roster.some((r) => `${r.slice(0, 12)}…` === li.textContent), `${li.textContent} está na lista`);
  assert.match(card(host).textContent, /Sorteado/);
  assert.match(card(host).textContent, /Semente [0-9a-f]{16}: qualquer aparelho recalcula/);
  assert.equal(button(host, "apurar"), null);
  const [close] = await stored("sorteio-fecho");
  const [tally] = await stored("sorteio-apuracao");
  const again = await sorteio.sorteioState(draw, { close, reveals: await stored("sorteio-revela"), tally });
  assert.deepEqual(winners.map((li) => li.textContent), again.winners.map((w) => `${w.slice(0, 12)}…`));
});

test("cartão: sem testemunhas suficientes e avisos de quem não revelou ou ficou fora, com escape", () => {
  const draw = { id: "d9", title: "Título <b>", seats: 1, roster: "vx_a,vx_b,vx_c", rosterHash: "abcdef1234567890", commitUntil: Date.UTC(2031, 0, 1) };
  const viewer = { isMod: false, routeId: "vx_a", secrets: {} };
  const semTestemunhas = flow.renderSorteioCard(
    { draw, close: null, commits: [], reveals: [], state: { phase: "sem-testemunhas", witnesses: 1, missing: ["vx_<i>"], ignored: ["vx_b"] } },
    viewer,
  );
  assert.match(semTestemunhas, /Sem testemunhas suficientes \(mínimo 2\)/);
  assert.match(semTestemunhas, /Não revelaram: vx_&lt;i&gt;…\./);
  assert.match(semTestemunhas, /deixou de fora revelações válidas de: vx_b…/);
  assert.ok(!semTestemunhas.includes("<b>"), "título é escapado");
  assert.ok(semTestemunhas.includes("Título &lt;b&gt;"));
  const semBotoes = semTestemunhas.match(/<div class="aviso-actions">([\s\S]*?)<\/div>/)[1];
  assert.equal(semBotoes.trim(), "", "fase final não oferece ações");
});

test("seção: lista vazia some para membro e mostra o formulário para moderação", () => {
  assert.equal(flow.renderSorteiosHtml([], { isMod: false }), "");
  const html = flow.renderSorteiosHtml([], { isMod: true });
  assert.match(html, /id="form-sorteio"/);
  assert.match(html, /Assinar e publicar o sorteio/);
});

test("segredos ilegíveis no armazenamento não derrubam a montagem", async () => {
  localStorage.setItem(flow.SECRETS_KEY, "{não é json");
  await flow.mountSorteios(host, ctx);
  assert.ok(card(host), "o cartão aparece mesmo assim");
  assert.equal(button(host, "revelar"), null);
});
