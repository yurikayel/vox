/**
 * @file Cobertura T6: casos de moderação natural (`app/natural-case-flow.js`): armazenamento defensivo dos casos
 * e decisão do caso (revisão, recusa, arquivamento firme) com a moderação da comunidade resolvida no cache real.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const flow = await import("../client/js/app/natural-case-flow.js");
const account = await import("../client/js/identity/index.js");
const cache = await import("../client/js/cache-node.js");
const updates = await import("../client/js/community-updates.js");

const me = await account.getRouteId();

function memoryStorage(initial = null) {
  const map = new Map(initial === null ? [] : [[flow.CASES_KEY, initial]]);
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
}

const notice = (n, extra = {}) => ({ caseId: `caso_${n}`, postId: `post_${n}`, communityId: "c-nat", target: "vx_alvo", reason: "assedio", side: "target", ...extra });
const statusOf = (caseId, side = "target") => flow.listCases().find((c) => c.caseId === caseId && c.side === side)?.status;

function fakeDeps() {
  const calls = { dispatched: [], saved: [], sealed: [] };
  return {
    calls,
    getDmPub: async () => "PUB",
    seal: async (pub, payload, meta) => { calls.sealed.push({ payload, meta }); return { id: `env_${calls.sealed.length}`, ts: 99 }; },
    dispatch: async (to, envelope) => { calls.dispatched.push({ to, id: envelope.id }); return "delivered"; },
    saveDm: async (msg) => { calls.saved.push(msg); },
  };
}

await cache.saveLocalPost({ id: updates.canonicalCommunityPostId("c-nat"), type: "community", communityId: "c-nat", title: "Bairro", author: "vx_mod", ts: 1 });
await cache.saveLocalPost({ id: "post_1", type: "topic", communityId: "c-nat", title: "Post denunciado", author: "vx_alvo", ts: 1 });
await cache.saveLocalPost({ id: "post_2", type: "topic", communityId: "c-nat", title: "Outro post", author: "vx_alvo", ts: 1 });
await cache.saveLocalPost({ id: "post_3", type: "topic", communityId: "c-nat", title: "Terceiro post", author: "vx_alvo", ts: 1 });
await cache.saveLocalPost({ id: "post_4", type: "topic", communityId: "c-nat", title: "Quarto post", author: "vx_alvo", ts: 1 });

test("armazenamento: JSON quebrado ou que não é lista vira lista vazia; gravar mantém só os 200 últimos", () => {
  assert.deepEqual(flow.listCases(memoryStorage("{quebrado")), []);
  assert.deepEqual(flow.listCases(memoryStorage('{"não":"lista"}')), []);
  assert.deepEqual(flow.listCases({ getItem() { throw new Error("bloqueado"); } }), []);
  const storage = memoryStorage();
  for (let i = 0; i < 205; i++) flow.receiveCase(notice(i), { storage, now: i });
  const list = flow.listCases(storage);
  assert.equal(list.length, 200);
  assert.equal(list[0].caseId, "caso_5", "os 5 primeiros saíram");
  assert.equal(list.at(-1).caseId, "caso_204");
  assert.doesNotThrow(() => flow.receiveCase(notice(1000), { storage: { getItem: () => "[]", setItem() { throw new Error("cheio"); } } }));
});

test("revisão: avisa a moderação da comunidade por DM cifrada com cartão do post e marca o caso", async () => {
  flow.receiveCase(notice(1));
  const deps = fakeDeps();
  const msg = await flow.decideCase(me, flow.listCases().find((c) => c.caseId === "caso_1"), "revisao", deps);
  assert.equal(msg, "Mandado para a moderação revisar.");
  assert.deepEqual(deps.calls.dispatched, [{ to: "vx_mod", id: "env_1" }]);
  assert.deepEqual(deps.calls.sealed[0].meta, { from: me, to: "vx_mod" });
  const payload = JSON.parse(deps.calls.sealed[0].payload);
  assert.equal(payload.text, "O moderador natural concorda com a denúncia deste post. O caso segue em revisão com você.");
  assert.deepEqual(payload.contextCard, { type: "topic", id: "post_1", title: "Caso do moderador natural" });
  assert.equal(deps.calls.saved[0].peerAddress, "vx_mod");
  assert.equal(deps.calls.saved[0].status, "delivered");
  assert.equal(statusOf("caso_1"), "revisao");
});

test("recusa: devolve o caso à moderação com texto próprio e marca recusado", async () => {
  flow.receiveCase(notice(2));
  const deps = fakeDeps();
  const msg = await flow.decideCase(me, flow.listCases().find((c) => c.caseId === "caso_2"), "recusar", deps);
  assert.equal(msg, "Caso devolvido à moderação da comunidade.");
  assert.match(JSON.parse(deps.calls.sealed[0].payload).text, /não quis decidir/);
  assert.equal(statusOf("caso_2"), "recusado");
});

test("sem moderação conhecida, ou quando quem decide é a própria moderação, nada é enviado", async () => {
  flow.receiveCase(notice(3, { postId: "post_inexistente", communityId: "" }));
  const semMod = fakeDeps();
  await flow.decideCase(me, flow.listCases().find((c) => c.caseId === "caso_3"), "revisao", semMod);
  assert.equal(semMod.calls.dispatched.length, 0);
  assert.equal(statusOf("caso_3"), "revisao", "o caso é marcado mesmo assim");
  flow.receiveCase(notice(4));
  const proprio = fakeDeps();
  await flow.decideCase("vx_mod", flow.listCases().find((c) => c.caseId === "caso_4"), "recusar", proprio);
  assert.equal(proprio.calls.dispatched.length, 0);
  assert.equal(statusOf("caso_4"), "recusado");
});

test("arquivar sem o vínculo de padrinho neste aparelho falha e não muda o caso", async () => {
  flow.receiveCase(notice(5));
  const c = flow.listCases().find((x) => x.caseId === "caso_5");
  await assert.rejects(() => flow.decideCase(me, c, "arquivar"), /Não achei o vínculo de padrinho neste aparelho\./);
  assert.equal(statusOf("caso_5"), "aberto");
});

test("arquivar com o vínculo: assina o arquivamento com a prova, grava e marca arquivado", async () => {
  const proof = { id: "vlk_prova", type: "vox-link", kind: "confirm", author: me, to: "vx_alvo", sponsor: true, ts: 5 };
  await cache.saveLocalPost(proof);
  flow.receiveCase(notice(6));
  const msg = await flow.decideCase(me, flow.listCases().find((x) => x.caseId === "caso_6"), "arquivar");
  assert.equal(msg, "Arquivado para todos. A moderação da comunidade pode desfazer.");
  assert.equal(statusOf("caso_6"), "arquivado");
  const [hide] = await cache.getLocalPosts({ type: "natural-hide", communityId: "c-nat" });
  assert.equal(hide.id, "nat_caso_6");
  assert.equal(hide.author, me);
  assert.equal(hide.target, "vx_alvo");
  assert.equal(hide.postId, "post_6");
  assert.equal(JSON.parse(hide.proof).id, "vlk_prova");
  assert.ok(hide.sig, "o arquivamento sai assinado");
});

test("renderização dos casos já decididos mostra o resultado, sem botões", async () => {
  const html = flow.renderCasesHtml(flow.listCases().filter((c) => c.status !== "aberto"), () => true);
  assert.match(html, /Mandado para a moderação revisar\./);
  assert.match(html, /Você não quis decidir; seguiu para a moderação\./);
  assert.match(html, /Você arquivou para todos\./);
  assert.ok(!html.includes("data-case-action"));
});

const LINKS = [
  { inviter: "vx_bia", invitee: "vx_eva", sponsor: true, since: 1 },
  { inviter: "vx_caio", invitee: "vx_ana", sponsor: true, since: 2 },
];

test("plano do aviso: o lado do denunciado vai ao padrinho dele, o de quem denunciou ao padrinho dela", () => {
  const caso = { target: "vx_eva", reporter: "vx_ana" };
  assert.deepEqual(flow.casePlan(LINKS, { ...caso, side: "target", sender: "vx_dono" }), { to: "vx_bia", side: "target" });
  assert.deepEqual(flow.casePlan(LINKS, { ...caso, side: "reporter", sender: "vx_ana" }), { to: "vx_caio", side: "reporter" });
  assert.equal(flow.casePlan(LINKS, { ...caso, side: "target", sender: "vx_bia" }), null, "ninguém avisa a si mesmo");
  assert.equal(flow.casePlan([], { ...caso, side: "target", sender: "vx_dono" }), null, "sem vínculo não há quem avisar");
  const mesmo = [{ inviter: "vx_bia", invitee: "vx_eva", sponsor: true, since: 1 }, { inviter: "vx_bia", invitee: "vx_ana", sponsor: true, since: 1 }];
  assert.equal(flow.casePlan(mesmo, { ...caso, side: "reporter", sender: "vx_ana" }), null, "N1 e N2 iguais: só recebe o aviso de N1");
});

test("enviar aviso do caso: DM cifrada sem o nome de quem denunciou; motivo grave ou sem plano não envia", async () => {
  const deps = { ...fakeDeps(), loadLinks: async () => LINKS };
  const rec = { id: "den_1", postId: "post_1", communityId: "c-nat", reason: "assedio" };
  const done = await flow.sendCaseNotice("vx_dono", rec, { side: "target", target: "vx_eva", reporter: "vx_ana" }, deps);
  assert.deepEqual(done, { to: "vx_bia", side: "target", status: "delivered" });
  const sent = JSON.parse(deps.calls.sealed[0].payload);
  assert.equal(sent.kind, "moderacao-natural");
  assert.equal(sent.natCase.caseId, "den_1");
  assert.ok(!JSON.stringify(sent).includes("vx_ana"), "o aviso do alvo não revela quem denunciou");
  assert.match(sent.text, /quem denunciou fica em sigilo/);
  assert.equal(deps.calls.saved[0].peerAddress, "vx_bia");
  assert.equal(await flow.sendCaseNotice("vx_dono", { ...rec, reason: "crianca" }, { side: "target", target: "vx_eva", reporter: "vx_ana" }, deps), null);
  assert.equal(await flow.sendCaseNotice("vx_dono", rec, { side: "target", target: "vx_solto", reporter: "vx_ana" }, deps), null);
  assert.equal(deps.calls.dispatched.length, 1);
});

test("sem chave de mensagem do destino, o envio devolve no-key e não grava nada", async () => {
  const deps = { ...fakeDeps(), getDmPub: async () => { throw new Error("sem chave"); } };
  const status = await flow.sendDm("vx_a", "vx_b", { payload: "{}", text: "oi" }, deps);
  assert.equal(status, "no-key");
  assert.equal(deps.calls.saved.length, 0);
});

test("lista de casos abertos: moderador com poder firme vê Arquivar; sem poder, Concordo; ambos podem recusar", () => {
  const aberto = { ...notice(7), status: "aberto", caseId: "caso<7>" };
  const firme = flow.renderCasesHtml([aberto], (alvo) => alvo === "vx_alvo");
  assert.match(firme, /data-case-action="arquivar"/);
  assert.match(firme, /data-case-action="recusar"/);
  assert.ok(!firme.includes("data-case-action=\"revisao\""));
  assert.match(firme, /data-case-id="caso&lt;7&gt;"/, "id escapado");
  assert.match(firme, /href="#\/t\/post_7"/);
  const macio = flow.renderCasesHtml([aberto], () => false);
  assert.match(macio, /data-case-action="revisao"/);
  assert.ok(!macio.includes("data-case-action=\"arquivar\""));
  const lado = flow.renderCasesHtml([{ ...aberto, side: "reporter" }], () => true);
  assert.match(lado, /data-case-action="revisao"/, "só o lado do alvo pode arquivar");
  assert.match(lado, /Denúncia feita por alguém pelo qual você responde/);
  assert.equal(flow.renderCasesHtml([]), "");
});
