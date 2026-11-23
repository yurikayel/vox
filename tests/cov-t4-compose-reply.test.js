/**
 * @file Cobertura de `app/compose-reply.js` (lote T4): tela de resposta, trava de moderação e persistência assinada.
 *
 * Identidade, cache e moderação são os módulos reais (IndexedDB de mentira); a rede é desligada.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument } from "./helpers/cov-t4-dom.mjs";

globalThis.fetch = async () => { throw new Error("offline"); };

const reply = await import("../client/js/app/compose-reply.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");

/**
 * Monta shell falso (`app-root`/`app-main`) e o formulário de resposta.
 * @returns {{ dom: object, main: FakeEl, form: FakeEl, body: FakeEl, btn: FakeEl }} Cenário.
 */
function mountReplyScreen() {
  const dom = installFakeDocument();
  const main = new FakeEl("app-main");
  const form = new FakeEl("form-compose-reply");
  const body = new FakeEl("reply-body", { tag: "TEXTAREA" });
  const btn = new FakeEl("btn-submit-reply");
  dom.add(new FakeEl("app-root"), main, form, body, btn);
  return { dom, main, form, body, btn };
}

/**
 * Grava no cache um tópico trancado pela moderação de uma comunidade.
 * @returns {Promise<void>} Resolve quando os posts estão salvos.
 */
async function seedLockedTopic() {
  await cacheNode.saveLocalPost({ id: "c_lockc", communityId: "lockc", type: "community", title: "Trancada", author: "vx_dono" });
  await cacheNode.saveLocalPost({ id: "top_lock", type: "topic", communityId: "lockc", title: "Debate", body: "x", author: "vx_dono" });
  await cacheNode.saveLocalPost({ id: "ma_1", type: "mod-action", communityId: "lockc", action: "lock", target: "top_lock", author: "vx_dono", ts: 1 });
}

test("compose-reply — persistLocalReply assina, guarda e devolve a resposta com dados do perfil", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Bia");
  localAccount.setProfileEnrichment({ displayName: "Bia", avatarUrl: "https://example.com/b.png" });
  const signed = await reply.persistLocalReply("top_1", "geral", "Concordo", { parentId: "rep_0" });
  assert.match(signed.id, /^rep_/);
  assert.equal(signed.type, "reply");
  assert.equal(signed.replyTo, "top_1");
  assert.equal(signed.parentId, "rep_0");
  assert.equal(signed.authorDisplay, "Bia");
  assert.equal(signed.authorAvatar, "https://example.com/b.png");
  assert.ok(signed.sig, "resposta assinada");
  assert.equal((await cacheNode.getLocalPost(signed.id)).body, "Concordo");
  const plain = await reply.persistLocalReply("top_1", "geral", "Sem pai");
  assert.equal(plain.parentId, "");
  localAccount.wipeLocalAccount();
});

test("compose-reply — tópico trancado pela moderação recusa a resposta e não grava nada", async () => {
  await cacheNode.clearLocalPosts();
  await seedLockedTopic();
  await assert.rejects(reply.persistLocalReply("top_lock", "lockc", "tarde demais"), /encerrado pela moderação/);
  const replies = await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_lock" });
  assert.equal(replies.length, 0);
});

test("compose-reply — tela de tópico trancado mostra o aviso e o caminho de volta", async () => {
  await cacheNode.clearLocalPosts();
  await seedLockedTopic();
  const { dom, main, form } = mountReplyScreen();
  await reply.showComposeReply("top_lock", "lockc");
  assert.ok(main.innerHTML.includes("Discussão Encerrada"));
  assert.ok(main.innerHTML.includes('href="#/t/top_lock?c=lockc"'));
  assert.equal(form.listeners.size, 0, "sem formulário ligado");
  dom.restore();
});

test("compose-reply — tela mostra o autor e o trecho do comentário pai (cortado em 100 caracteres)", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "rep_pai", type: "reply", replyTo: "top_9", author: "vx_x", authorDisplay: "Caio", body: "p".repeat(130) });
  const { dom, main } = mountReplyScreen();
  await reply.showComposeReply("top_9", "geral", "rep_pai");
  assert.ok(main.innerHTML.includes("Caio"));
  assert.ok(main.innerHTML.includes(`${"p".repeat(100)}…`));
  assert.ok(!main.innerHTML.includes("p".repeat(101)));
  main.innerHTML = "";
  await reply.showComposeReply("top_9", "geral", "rep_inexistente");
  assert.ok(main.innerHTML.includes("form-compose-reply"), "pai desconhecido ainda abre o formulário");
  dom.restore();
});

test("compose-reply — enviar grava a resposta, troca o botão e navega de volta ao tópico", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, form, body, btn } = mountReplyScreen();
  await reply.showComposeReply("top_5", "geral c", "rep_pai");
  body.value = "  Minha resposta  ";
  let prevented = 0;
  await form.fire("submit", { preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  const saved = await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_5" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].body, "Minha resposta");
  assert.equal(saved[0].parentId, "rep_pai");
  assert.equal(btn.textContent, "Enviando…");
  assert.equal(location.hash, "#/t/top_5?c=geral%20c");
  dom.restore();
});

test("compose-reply — falha ao assinar mostra erro e devolve o botão ao estado inicial", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, form, body, btn } = mountReplyScreen();
  await reply.showComposeReply("top_6", "geral");
  body.value = "vai falhar";
  const subtle = globalThis.crypto.subtle;
  const realSign = subtle.sign;
  subtle.sign = async () => { throw new Error("chave indisponível"); };
  try {
    await form.fire("submit", { preventDefault() {} });
  } finally {
    subtle.sign = realSign;
  }
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "Enviar Resposta");
  assert.equal((await cacheNode.getLocalPosts({ type: "reply", replyTo: "top_6" })).length, 0);
  dom.restore();
});
