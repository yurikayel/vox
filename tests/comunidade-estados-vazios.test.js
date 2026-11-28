/**
 * @file Estados vazios das comunidades no molde do cartão de estado: posts, avisos, feira, propostas, assembleias, busca
 * sem resultado e "fixados" sem pauta mostram `.sv-state--empty` com `role="status"` e a frase de sempre.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/cov-t2-dom.mjs";

globalThis.fetch = () => Promise.reject(new Error("offline"));
installFakeDom();

const topics = await import("../client/js/render/community-topics.js");
const aviso = await import("../client/js/render/aviso.js");
const governance = await import("../client/js/render/community-governance.js");
const assembly = await import("../client/js/render/assembly-panel.js");
const controls = await import("../client/js/app/community-controls.js");

const CARD = /<div class="sv-state sv-state--empty" role="status">[\s\S]*?<p class="sv-state-text">([^<]*)<\/p>/;

/** Frase do cartão vazio do HTML, ou `null` se não houver cartão. */
const cardText = (html) => CARD.exec(html)?.[1] ?? null;

test("comunidade sem posts: cartão vazio com o link 'Criar o primeiro post' do cartão", () => {
  const html = topics.renderCommunityTopicFeedInner([], "vox", "Vox", "#/compose/topic?c=vox");
  assert.equal(cardText(html), "Nenhum post nesta comunidade ainda.");
  assert.match(html, /<a class="sv-state-link" href="#\/compose\/topic\?c=vox">Criar o primeiro post<\/a>/);
});

test("comunidade sem posts e sem permissão de criar: cartão sem link", () => {
  const html = topics.renderCommunityTopicFeedInner([], "vox", "Vox", "");
  assert.equal(cardText(html), "Nenhum post nesta comunidade ainda.");
  assert.doesNotMatch(html, /<a /);
});

test("tela de avisos sem avisos mostra o cartão vazio", () => {
  const main = { innerHTML: "" };
  aviso.renderAvisosScreen(main, { communityId: "vox", title: "Vox", items: [], isMod: false, canRespond: false });
  assert.equal(cardText(main.innerHTML), "Nenhum aviso da coordenação ainda.");
});

test("feira sem ofertas mostra o cartão vazio com o link de criar", () => {
  const html = governance.renderCommunityListingsTab("feira", "Feira", { id: "feira", commercialEnabled: true }, []);
  assert.equal(cardText(html), "Nenhuma oferta cadastrada nesta feira ainda.");
  assert.match(html, /<a class="sv-state-link" href="#\/compose\/listing\?c=feira">[^<]*<\/a>/);
});

test("governança sem propostas mostra o cartão vazio com o link de criar", () => {
  const html = governance.renderCommunityGovernanceTab("vox", "Vox", { id: "vox" }, []);
  assert.equal(cardText(html), "Nenhuma proposta em deliberação nesta comunidade ainda.");
  assert.match(html, /<a class="sv-state-link" href="#\/compose\/proposal\?c=vox">[^<]*<\/a>/);
});

test("painel de assembleias sem convocação mostra o cartão vazio", () => {
  const html = assembly.renderAssemblyPanel({ communityId: "vox", items: [] });
  assert.equal(cardText(html), "Nenhuma assembleia convocada nesta comunidade ainda.");
});

function listScene(topicsList) {
  const doc = installFakeDom();
  const main = doc.add("main", { id: "main" });
  const list = doc.add("div", { cls: "community-vox-topic-list", parent: main });
  const ctx = { main, communityId: "vox", meta: { id: "vox", title: "Vox" }, user: "vx_eu", peerSettings: { enabled: false, commOnly: false }, filteredTopics: topicsList };
  return { doc, main, list, ctx };
}

test("busca sem resultado mostra o cartão vazio com a consulta escapada", () => {
  const { doc, main, list, ctx } = listScene([{ id: "t1", title: "Feira", author: "vx_a", ts: 1, communityId: "vox" }]);
  const row = doc.add("article", { cls: "community-topic-row", parent: list });
  row.textContent = "Feira";
  const input = doc.add("input", { id: "input-comm-topic-search", parent: main });
  controls.bindCommunityHeaderEvents(ctx);
  input.value = "<b>zzz";
  input.fire("input", { target: input });
  const vazio = list.querySelector(".community-topic-search-empty");
  assert.equal(cardText(vazio.innerHTML), "Nenhum tópico encontrado para &quot;&lt;b&gt;zzz&quot;.");
});

test("'fixados' sem pauta mostra o cartão vazio", () => {
  const { doc, main, list, ctx } = listScene([{ id: "t1", title: "Feira", author: "vx_a", ts: 1, communityId: "vox" }]);
  const pinned = doc.add("button", { cls: "btn-sort-topic", parent: main, dataset: { sort: "pinned" } });
  controls.bindCommunityHeaderEvents(ctx);
  pinned.fire("click");
  assert.equal(cardText(list.innerHTML), "Nenhuma pauta ou tópico fixado no momento.");
});
