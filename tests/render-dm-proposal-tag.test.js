/**
 * Testes de render/dm, render/proposal e render/tag-polis: texto de DM, pauta, votos e tags
 * vindos de outras pessoas saem escapados; links só entram com esquema seguro.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const dm = await import("../client/js/render/dm.js");
const proposal = await import("../client/js/render/proposal.js");
const tagPolis = await import("../client/js/render/tag-polis.js");

const XSS = '<img src=x onerror=alert(1)>"\'';
const PEER = "vx_par000000000001";
const ME = "vx_eu00000000000001";

function fakeMain() {
  return { innerHTML: "", closest: () => null };
}

test("dm - inbox: prévia e rótulo hostis ficam escapados", () => {
  const main = fakeMain();
  dm.renderDmList(main, [{ peerAddress: PEER, lastText: XSS, lastTs: 1, unreadCount: 2 }]);
  assert.ok(!main.innerHTML.includes("<img src=x"));
  assert.ok(main.innerHTML.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.match(main.innerHTML, /aria-label="2 não lidas"/);
});

test("dm - inbox: busca refletida no value não quebra o atributo", () => {
  const main = fakeMain();
  dm.renderDmList(main, [], ME, { searchQuery: '"><script>1</script>', compact: true });
  assert.ok(!main.innerHTML.includes("<script>1"));
  assert.match(main.innerHTML, /Nenhuma conversa encontrada/);
});

test("dm - inbox: endereço do par é codificado na URL do link", () => {
  const main = fakeMain();
  dm.renderDmList(main, [{ peerAddress: 'x"/><b>', lastText: "oi", lastTs: 1 }]);
  assert.ok(!main.innerHTML.includes("<b>"));
  assert.ok(main.innerHTML.includes("#/dm/x%22%2F%3E%3Cb%3E"));
});

test("dm - thread: texto, resposta citada e reações vindos do par ficam escapados", () => {
  const main = fakeMain();
  const msg = {
    id: 'm"1', from: PEER, text: XSS, ts: 1, status: "delivered",
    replyTo: { id: "r1", snippet: XSS, author: PEER },
    reactions: { [XSS]: [PEER] },
  };
  dm.renderDmThread(main, PEER, [msg], ME, { hasDmPub: true });
  assert.ok(!main.innerHTML.includes("<img src=x"), "nenhuma tag injetada");
  assert.ok(!main.innerHTML.includes('data-msg-id="m"1"'), "id não fecha atributo");
  assert.match(main.innerHTML, /dm-bubble received/);
});

test("dm - thread: sem chave do par mostra aviso e desabilita o envio", () => {
  const main = fakeMain();
  dm.renderDmThread(main, PEER, [], ME, { hasDmPub: false });
  assert.match(main.innerHTML, /Falta a chave desta pessoa/);
  assert.match(main.innerHTML, /id="btn-send-dm"[^>]*disabled/);
});

test("dm - thread: cartão de contexto recebido com href javascript: não vira link ativo", () => {
  const main = fakeMain();
  const bad = { id: "m_js", from: PEER, text: "oi", ts: 1, contextCard: { type: "topic", title: "Tópico", url: "javascript:alert(1)" } };
  const ok = { id: "m_ok", from: PEER, text: "oi", ts: 2, contextCard: { type: "topic", title: "Interno", url: "#/t/123" } };
  dm.renderDmThread(main, PEER, [bad, ok], ME, { hasDmPub: true });
  assert.ok(!main.innerHTML.includes("javascript:"), "esquema javascript: descartado");
  assert.ok(main.innerHTML.includes('href="#/t/123"'), "rota interna válida preservada");
});

test("dm - thread: mediaDataUrl recebida só aceita imagem raster em base64", () => {
  const main = fakeMain();
  const bad = { id: "m_html", from: PEER, text: "oi", ts: 1, mediaDataUrl: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" };
  const ok = { id: "m_png", from: PEER, text: "foto", ts: 2, mediaDataUrl: "data:image/png;base64,iVBORw0KGgo=" };
  dm.renderDmThread(main, PEER, [bad, ok], ME, { hasDmPub: true });
  assert.ok(!main.innerHTML.includes("data:text/html"), "data:text/html descartado");
  assert.ok(main.innerHTML.includes('src="data:image/png;base64,iVBORw0KGgo="'), "imagem raster válida preservada");
});

const TALLY = { yes: 3, no: 1, abstain: 0, totalEligible: 4, state: "open", ineligibleCount: 2, votesDetail: [] };

test("proposal - apuração calcula porcentagens e mostra descartados", () => {
  const html = proposal.renderProposalTally(TALLY);
  assert.match(html, /Sim:<\/strong> 3<\/span><span class="agora-proposal-tally-pct">75%/);
  assert.match(html, /Não:<\/strong> 1<\/span><span class="agora-proposal-tally-pct">25%/);
  assert.match(html, /Descartados pós-corte:<\/strong> 2/);
});

test("proposal - apuração sem elegíveis não divide por zero", () => {
  const html = proposal.renderProposalTally({ yes: 5, totalEligible: 0 });
  assert.ok(!html.includes("NaN") && !html.includes("Infinity"));
  assert.match(html, /0%/);
});

test("proposal - cédula: encerrada, sem conta e aberta com voto atual", () => {
  const ctx = { isEligible: true, isMember: true, userAddress: ME };
  assert.match(proposal.renderProposalVotingBox({}, { state: "closed" }, ctx), /encerrada/);
  assert.match(proposal.renderProposalVotingBox({}, { state: "open" }, { ...ctx, userAddress: "" }), /conectado à sua conta/);
  const open = proposal.renderProposalVotingBox({}, { state: "open" }, { ...ctx, userVote: { choice: "yes" } });
  assert.match(open, /data-choice="yes" aria-pressed="true"/);
  assert.match(open, /data-choice="no" aria-pressed="false"/);
});

test("proposal - cédula: avisa quem entrou depois do corte", () => {
  const late = proposal.renderProposalVotingBox({}, { state: "open" }, { isEligible: false, isMember: true, userAddress: ME });
  assert.match(late, /marco de corte/);
  const outsider = proposal.renderProposalVotingBox({}, { state: "open" }, { isEligible: false, isMember: false, userAddress: ME });
  assert.match(outsider, /ainda não é membro/);
});

test("proposal - lista de votos escapa motivo e escolha vindos da malha", () => {
  const html = proposal.renderProposalVotesList({ votesDetail: [{ author: PEER, choice: XSS, eligible: false, reason: XSS, ts: 1 }] });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.equal(proposal.renderProposalVotesList({ votesDetail: [] }), "");
});

test("proposal - diff e detalhe escapam título, corpo e patch da pauta", () => {
  assert.equal(proposal.renderProposalDiff(""), "");
  const main = fakeMain();
  proposal.renderProposalDetail(main, { communityId: 'c"x', title: XSS, body: "texto", author: PEER, diffText: `+${XSS}`, ts: 1 }, TALLY, { community: { id: "c", title: XSS }, userAddress: ME, isEligible: true, isMember: true });
  assert.ok(!main.innerHTML.includes("<img src=x"));
  assert.ok(!main.innerHTML.includes('c"x'), "communityId codificado na URL");
  assert.match(main.innerHTML, /Patch proposto/);
});

test("tag-polis - feed vazio mostra estado vazio com a tag escapada", () => {
  const main = fakeMain();
  tagPolis.renderTagFeed(main, '"><script>1</script>', []);
  assert.ok(!main.innerHTML.includes("<script>1"));
  assert.match(main.innerHTML, /Nenhum post com/);
});

test("tag-polis - contagem no singular e main nulo não quebra", () => {
  tagPolis.renderTagFeed(null, "x", []);
  const main = fakeMain();
  tagPolis.renderTagFeed(main, "vox", [{ id: "p1", author: PEER, title: "Oi", ts: 1 }]);
  assert.match(main.innerHTML, /1 post no seu índice/);
});

test("tag-polis - relatório Pol.is escapa texto e id da declaração", () => {
  assert.equal(tagPolis.renderPolisReportHtml(null), "");
  const html = tagPolis.renderPolisReportHtml({ totalVoters: 2, statements: [{ id: 'a"b', text: XSS, agreePct: 150, disagreePct: "x", passPct: 0 }] });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes('data-statement-id="a"b"'));
});

test("tag-polis - porcentagem não numérica vira 0 e nunca NaN", () => {
  const html = tagPolis.renderPolisReportHtml({ statements: [{ id: "s", text: "t", agreePct: "<b>", disagreePct: undefined, passPct: null }] });
  assert.ok(!html.includes("NaN"));
  assert.ok(!html.includes("<b>"));
});
