/**
 * @file Cobertura de `app/compose-proposal.js` e `app/compose-listing.js` (lote T4): telas e envio assinado.
 *
 * Shell, render, identidade e cache são os módulos reais; a rede é desligada e os toasts
 * são lidos pelo helper `captureToasts`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument, captureToasts } from "./helpers/cov-t4-dom.mjs";
import { waitUntil } from "./helpers/wait-until.js";

globalThis.fetch = async () => { throw new Error("offline"); };

const proposal = await import("../client/js/app/compose-proposal.js");
const listing = await import("../client/js/app/compose-listing.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");
const mock = await import("../client/js/mock.js");

/**
 * Monta shell falso e campos de formulário com os ids/valores dados.
 * @param {Record<string, string>} fields Mapa id → valor inicial.
 * @returns {{ dom: object, main: FakeEl, els: Record<string, FakeEl>, toasts: object }} Cenário.
 */
function mountForm(fields) {
  const dom = installFakeDocument();
  const main = new FakeEl("app-main");
  dom.add(new FakeEl("app-root"), main);
  const els = {};
  for (const [id, value] of Object.entries(fields)) {
    els[id] = new FakeEl(id, { value });
    dom.add(els[id]);
  }
  return { dom, main, els, toasts: captureToasts(dom) };
}

const PROPOSAL_FIELDS = { "form-compose-proposal": "", "prop-title": "  Mais bancos  ", "prop-body": "Instalar bancos na praça", "prop-diff": "", "btn-submit-proposal": "" };

test("compose-proposal — tela usa o título da comunidade local e liga o envio", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "vizinhos", type: "community", title: "Vizinhos do Sul" });
  const { dom, main, els, toasts } = mountForm(PROPOSAL_FIELDS);
  try {
    await proposal.showComposeProposal("vizinhos");
    assert.ok(main.innerHTML.includes("Vizinhos do Sul"));
    assert.ok(els["form-compose-proposal"].listeners.has("submit"));
    main.innerHTML = "";
    await proposal.showComposeProposal();
    assert.ok(main.innerHTML.includes(mock.MOCK_DEMO_COMMUNITY.title), "sem id, usa a comunidade de demonstração");
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-proposal — enviar valida, assina, guarda e navega para a proposta", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const { dom, els, toasts } = mountForm(PROPOSAL_FIELDS);
  try {
    proposal.attachComposeProposalHandlers("vizinhos", "vx_me");
    let prevented = 0;
    await els["form-compose-proposal"].fire("submit", { preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
    const [saved] = await cacheNode.getLocalPosts({ type: "governance-proposal" });
    assert.equal(saved.title, "Mais bancos");
    assert.equal(saved.communityId, "vizinhos");
    assert.equal(saved.author, await localAccount.getRouteId(), "a assinatura fixa o autor na conta ativa");
    assert.equal(saved.state, "open");
    assert.equal(saved.minQuorum, 2);
    assert.equal(saved.closesAt - saved.createdAt, 7 * 24 * 3600 * 1000);
    assert.equal(location.hash, `#/c/vizinhos/proposal/${encodeURIComponent(saved.id)}`);
    assert.equal(els["btn-submit-proposal"].textContent, "Publicando…");
    assert.equal(toasts.list().at(-1).text, "Proposta publicada na governança!");
  } finally {
    toasts.stop();
    dom.restore();
    await localAccount.wipeLocalAccount();
  }
});

test("compose-proposal — validação recusa título vazio sem gravar nem travar o botão", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, els, toasts } = mountForm({ ...PROPOSAL_FIELDS, "prop-title": "   " });
  try {
    proposal.attachComposeProposalHandlers("vizinhos", "vx_me");
    await els["form-compose-proposal"].fire("submit", { preventDefault() {} });
    assert.deepEqual(toasts.list().at(-1), { text: "Título da proposta não pode ser vazio.", type: "error" });
    assert.equal((await cacheNode.getLocalPosts({ type: "governance-proposal" })).length, 0);
    assert.equal(els["btn-submit-proposal"].disabled, false);
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-proposal — attachComposeProposalHandlers sem formulário não lança e publishProposal falho devolve o botão", async () => {
  const dom = installFakeDocument();
  assert.equal(proposal.attachComposeProposalHandlers("x", "u"), undefined);
  dom.restore();
  const { dom: dom2, toasts } = mountForm({});
  const btn = new FakeEl("", { tag: "BUTTON" });
  btn.disabled = true;
  const subtle = globalThis.crypto.subtle;
  const realSign = subtle.sign;
  subtle.sign = async () => { throw new Error("sem chave"); };
  try {
    await proposal.publishProposal({ communityId: "c", title: "t", body: "b", diffText: "", user: "u", btn });
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, "Publicar Proposta Assinada");
    assert.deepEqual(toasts.list().at(-1), { text: "Erro ao publicar proposta: sem chave", type: "error" });
  } finally {
    subtle.sign = realSign;
    toasts.stop();
    dom2.restore();
  }
});

const LISTING_FIELDS = {
  "form-compose-listing": "", "listing-title": "Bicicleta", "listing-price": "R$ 200", "listing-location": "Centro",
  "listing-pix": "", "listing-image": "", "listing-body": "Aro 26, em bom estado", "btn-submit-listing": "",
};

test("compose-listing — comunidade sem comércio ativo mostra o aviso de feira desligada", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "sem_feira", type: "community", title: "Sem Feira", commercialEnabled: false });
  const { dom, main, toasts } = mountForm({});
  try {
    await listing.showComposeListing("sem_feira");
    assert.ok(main.innerHTML.includes("Feira comunitária não ativada"));
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-listing — comunidade com comércio ativo abre o formulário e liga o envio", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "feira_viva", type: "community", title: "Feira Viva", commercialEnabled: true });
  const { dom, main, els, toasts } = mountForm(LISTING_FIELDS);
  try {
    await listing.showComposeListing("feira_viva");
    assert.ok(main.innerHTML.includes("Feira Viva"));
    assert.ok(els["form-compose-listing"].listeners.has("submit"));
    let prevented = 0;
    await els["form-compose-listing"].fire("submit", { preventDefault: () => prevented++ });
    assert.ok(prevented >= 1, "submit não recarrega a página");
    // O envio é disparado sem ser esperado pela escuta: espera terminar para a oferta não cair no teste seguinte.
    toasts.stop(); // devolve o `setTimeout` real, que `waitUntil` usa
    const publicada = await waitUntil(async () => (await cacheNode.getLocalPosts({ type: "listing" }))[0]);
    assert.equal(publicada?.communityId, "feira_viva", "a oferta enviada termina de gravar antes do teste acabar");
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-listing — demonstração de feira é comercial por padrão quando nada foi salvo", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, main, toasts } = mountForm(LISTING_FIELDS);
  try {
    await listing.showComposeListing();
    assert.ok(!main.innerHTML.includes("Feira comunitária não ativada"));
    assert.ok(main.innerHTML.includes(mock.MOCK_DEMO_COMMUNITY_FEIRA.title));
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-listing — enviar oferta assina, guarda, normaliza o Pix e vai para a aba de ofertas", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const { dom, els, toasts } = mountForm({ ...LISTING_FIELDS, "listing-pix": "pessoa@exemplo.com" });
  try {
    await listing.handleComposeListingSubmit("vx_me", "feira viva");
    const [saved] = await cacheNode.getLocalPosts({ type: "listing" });
    assert.equal(saved.title, "Bicicleta");
    assert.equal(saved.communityId, "feira viva");
    assert.equal(saved.author, await localAccount.getRouteId(), "a assinatura fixa o autor na conta ativa");
    assert.equal(saved.listingStatus, "available");
    assert.equal(saved.contactPix, "pessoa@exemplo.com");
    assert.ok(saved.sig);
    assert.equal(location.hash, "#/c/feira%20viva?tab=listings");
    assert.equal(els["btn-submit-listing"].textContent, "Publicando…");
    assert.equal(toasts.list().at(-1).text, "Oferta publicada na feira!");
  } finally {
    toasts.stop();
    dom.restore();
    await localAccount.wipeLocalAccount();
  }
});

test("compose-listing — título vazio e Pix inválido avisam e não gravam", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, els, toasts } = mountForm({ ...LISTING_FIELDS, "listing-title": "" });
  try {
    await listing.handleComposeListingSubmit("vx_me", "feira");
    assert.deepEqual(toasts.list().at(-1), { text: "Informe o título do produto ou serviço.", type: "error" });
    els["listing-title"].value = "Item";
    els["listing-pix"].value = "chave inválida !!";
    await listing.handleComposeListingSubmit("vx_me", "feira");
    assert.ok(toasts.list().at(-1).text.startsWith("Chave Pix inválida: "));
    assert.equal((await cacheNode.getLocalPosts({ type: "listing" })).length, 0);
    assert.equal(els["btn-submit-listing"].disabled, false, "botão nunca chegou a travar");
  } finally {
    toasts.stop();
    dom.restore();
  }
});

test("compose-listing — falha ao assinar avisa o erro, não grava e devolve o botão", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const { dom, els, toasts } = mountForm(LISTING_FIELDS);
  const subtle = globalThis.crypto.subtle;
  const realSign = subtle.sign;
  subtle.sign = async () => { throw new Error("sem chave"); };
  try {
    // Comunidade só desta tentativa: um post de outro teste que chegue tarde ao cache não se passa por gravado aqui.
    await listing.handleComposeListingSubmit("vx_me", "feira-sem-chave");
    assert.deepEqual(toasts.list().at(-1), { text: "Erro ao publicar oferta: sem chave", type: "error" });
    assert.equal(els["btn-submit-listing"].disabled, false);
    assert.equal(els["btn-submit-listing"].textContent, "Publicar na Feira");
    const saved = await cacheNode.getLocalPosts({ type: "listing", communityId: "feira-sem-chave" });
    assert.equal(saved.length, 0, `nada gravado: ${JSON.stringify(saved.map((p) => [p.id, p.title, p.communityId]))}`);
  } finally {
    subtle.sign = realSign;
    toasts.stop();
    dom.restore();
    await localAccount.wipeLocalAccount();
  }
});
