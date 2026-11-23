/**
 * @file Cobertura de `app/screens-people.js` (lote T1): busca de pessoas, avisos "adicionou você",
 * compartilhar convite e a tela de conexão (`#/connect`).
 */
import "./setup.js";
import test, { before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/cov-t1-dom.mjs";
import { installRelay, installClipboard, restoreEnv, settle } from "./helpers/cov-t1-dm-env.mjs";
import * as contacts from "../client/js/contacts.js";
import * as contactNotify from "../client/js/contact-notify.js";
import * as localAccount from "../client/js/identity/local-account.js";
import { INVITE_ARRIVAL_KEY, peekInviteArrival } from "../client/js/invite-arrival.js";
import { CANTINA_STORAGE_KEY } from "../client/js/app/cantina-gate.js";
import { showPeople, showConnect } from "../client/js/app/screens-people.js";

const dom = installFakeDom();
let me = "";

const freshLocation = () => ({ hash: "#/people", origin: "https://vox.test", pathname: "/app/", search: "" });
const TOKEN = "A".repeat(22);

before(async () => {
  localStorage.clear();
  me = (await localAccount.ensureLocalAccount()).routeId;
});

afterEach(() => {
  restoreEnv();
  contacts.__resetContactsForTests();
  localStorage.removeItem(INVITE_ARRIVAL_KEY);
  localStorage.removeItem(CANTINA_STORAGE_KEY);
  dom.reset();
  globalThis.location = freshLocation();
});

function addPeopleEls() {
  return {
    form: dom.add("form-people-search"),
    input: dom.add("people-search-input"),
    share: dom.add("btn-people-share-connect"),
    results: dom.add("people-results-container"),
    added: dom.add("people-added-you-container"),
  };
}

/** Aviso "adicionou você" de verdade, gravado pelo mesmo caminho do recebimento. */
function seedAddedYou(routeId, name) {
  contactNotify.recordIncomingContactNotice({ author: routeId, displayName: name, ts: Date.now() });
}

test("pessoas — sem consulta lista as seções e mostra o link de convite da conta", async () => {
  installRelay(me);
  addPeopleEls();
  await showPeople();
  assert.match(dom.main.innerHTML, /people-search-input/);
  assert.ok(dom.main.innerHTML.includes(encodeURIComponent(me)) || dom.main.innerHTML.includes(me));
});

test("pessoas — com consulta pela chave exata mostra o resultado e esconde os avisos", async () => {
  installRelay(me);
  seedAddedYou("vx_cov_aviso_q", "Aviso Q");
  addPeopleEls();
  await showPeople(me);
  assert.ok(dom.main.innerHTML.includes(me), "a busca pela própria chave traz o resultado");
  assert.doesNotMatch(dom.main.innerHTML, /Aviso Q/);
});

test("pessoas — enviar a busca vai para a conexão quando é uma chave vx_ e para a busca quando é texto", async () => {
  installRelay(me);
  const els = addPeopleEls();
  await showPeople();
  els.input.value = "vx_cov_alvo";
  const ev = els.form.fire("submit");
  assert.equal(ev.defaultPrevented, true);
  assert.equal(location.hash, "#/connect/vx_cov_alvo");
  els.input.value = " maria silva ";
  els.form.fire("submit");
  assert.equal(location.hash, "#/people?q=maria%20silva");
  els.input.value = "  ";
  els.form.fire("submit");
  assert.equal(location.hash, "#/people");
});

test("pessoas — digitar na busca atualiza os resultados; limpar volta às seções e aos avisos", async () => {
  installRelay(me);
  seedAddedYou("vx_cov_aviso_d", "Aviso Dois");
  const els = addPeopleEls();
  await showPeople();
  els.input.value = me;
  els.input.fire("input");
  await settle(60);
  assert.ok(els.results.innerHTML.includes(me));
  assert.equal(els.added.innerHTML, "");
  els.input.value = "";
  els.input.fire("input");
  await settle(60);
  assert.match(els.added.innerHTML, /Aviso Dois/);
});

test("pessoas — 'adicionar de volta' cria o contato e dispensa o aviso; 'dispensar' só dispensa", async () => {
  installRelay(me);
  seedAddedYou("vx_cov_volta", "Volta");
  seedAddedYou("vx_cov_dispensa", "Dispensa");
  const els = addPeopleEls();
  await showPeople();
  const target = (cls, route, label = "") => ({ closest: (sel) => (sel === cls ? { dataset: { route, label } } : null) });
  els.added.fire("click", { target: { closest: () => null } });
  els.added.fire("click", { target: target(".btn-added-you-back", "vx_cov_volta", "Volta") });
  els.added.fire("click", { target: target(".btn-added-you-dismiss", "vx_cov_dispensa") });
  await settle(60);
  assert.equal(contacts.hasContact("vx_cov_volta"), true);
  assert.equal(contacts.hasContact("vx_cov_dispensa"), false);
  const pending = contactNotify.listIncomingContactNotices().filter((n) => !n.dismissed).map((n) => n.routeId);
  assert.equal(pending.includes("vx_cov_volta"), false);
  assert.equal(pending.includes("vx_cov_dispensa"), false);
});

test("pessoas — evento de aviso recebido atualiza só a seção de avisos", async () => {
  installRelay(me);
  const els = addPeopleEls();
  await showPeople();
  seedAddedYou("vx_cov_evento", "Chegou Agora");
  els.input.value = "";
  dom.document.docFire("vox:contact-added-received");
  assert.match(els.added.innerHTML, /Chegou Agora/);
  els.input.value = "busca ativa";
  dom.document.docFire("vox:contact-added-received");
  assert.equal(els.added.innerHTML, "", "com busca ativa a seção fica vazia");
});

test("pessoas — compartilhar convite copia o link de conexão com convite da conta", async () => {
  installRelay(me);
  const clip = installClipboard();
  const els = addPeopleEls();
  await showPeople();
  els.share.fire("click");
  await settle(60);
  assert.equal(clip.copied.length, 1);
  assert.ok(clip.copied[0].includes(encodeURIComponent(me)) || clip.copied[0].includes(me));
});

test("pessoas — conexão mostra o perfil e adiciona o contato, remontando a tela", async () => {
  installRelay(me);
  const add = dom.add("btn-connect-add");
  add.dataset.route = "vx_cov_conn";
  add.currentTarget = add;
  await showConnect("vx_cov_conn");
  assert.match(dom.main.innerHTML, /btn-connect-add/);
  assert.equal(contacts.hasContact("vx_cov_conn"), false);
  dom.main.innerHTML = "SENTINELA";
  add.fire("click");
  await settle(60);
  assert.equal(contacts.hasContact("vx_cov_conn"), true);
  assert.match(dom.main.innerHTML, /btn-connect-add/, "tela foi remontada");
});

test("pessoas — conexão com convite e sem entrada pelo portão guarda a chegada do convite", async () => {
  installRelay(me);
  await showConnect("vx_cov_inviter", TOKEN);
  const arrival = peekInviteArrival();
  assert.equal(arrival.inviter, "vx_cov_inviter");
  assert.equal(arrival.token, TOKEN);
});

test("pessoas — conexão com convite de quem já passou pelo portão não guarda chegada", async () => {
  installRelay(me);
  localStorage.setItem(CANTINA_STORAGE_KEY, "true");
  await showConnect("vx_cov_inviter2", TOKEN);
  assert.equal(peekInviteArrival(), null);
});

test("pessoas — compartilhar na conexão copia o link da pessoa", async () => {
  installRelay(me);
  const clip = installClipboard();
  const shareBtn = dom.add("btn-connect-share");
  await showConnect("vx_cov_comp");
  shareBtn.fire("click");
  await settle(60);
  assert.equal(clip.copied.length, 1);
  assert.ok(clip.copied[0].includes("vx_cov_comp"));
});
