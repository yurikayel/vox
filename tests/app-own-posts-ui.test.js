/**
 * Seção "Seus posts num arquivo" (`app/own-posts-ui.js`): HTML, botão de exportar
 * com estado ocupado e importação de arquivo (própria, de outra conta, inválida).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const localAccount = await import("../client/js/identity/local-account.js");
const cacheNode = await import("../client/js/cache-node.js");
const ownPosts = await import("../client/js/own-posts.js");
const ui = await import("../client/js/app/own-posts-ui.js");

function mount() {
  const btn = { disabled: false, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  const input = { value: "x", files: [], listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  const byId = { "btn-own-posts-export": btn, "own-posts-import": input };
  globalThis.document = { getElementById: (id) => byId[id] || null };
  return { btn, input };
}

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
/** Espera uma condição ficar verdadeira (até `ms`), em vez de contar turnos do loop de eventos, que varia no CI. */
const waitFor = async (cond, ms = 3000) => { const fim = Date.now() + ms; while (!cond() && Date.now() < fim) await new Promise((r) => setTimeout(r, 5)); };
const fileOf = (text) => ({ text: async () => text });

async function freshAccountWithPost() {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const signed = await localAccount.signPayload({
    id: `top_own_ui_${Date.now()}`, type: "topic", title: "Meu post", body: "Texto do post", ts: Date.now(),
  });
  await cacheNode.saveLocalPost(signed);
  return signed;
}

test("renderOwnPostsSection: traz botão de baixar e campo de arquivo JSON oculto", () => {
  const html = ui.renderOwnPostsSection();
  assert.match(html, /id="btn-own-posts-export"/);
  assert.match(html, /id="own-posts-import"[^>]*accept="\.json,application\/json"[^>]*hidden/);
});

test("bindOwnPostsSection: sem os elementos no DOM não quebra", () => {
  globalThis.document = { getElementById: () => null };
  assert.doesNotThrow(() => ui.bindOwnPostsSection());
});

test("exportar sem posts: não baixa nada e o botão volta a ficar ativo", async () => {
  await cacheNode.clearLocalPosts();
  await localAccount.ensureLocalAccount();
  const { btn } = mount();
  ui.bindOwnPostsSection();
  btn.listeners.click();
  assert.equal(btn.disabled, true, "ocupado enquanto monta o arquivo");
  await settle();
  assert.equal(btn.disabled, false);
});

test("importar: arquivo que não é do Vox não chama onDone e limpa o campo", async () => {
  const { input } = mount();
  let done = 0;
  ui.bindOwnPostsSection(() => { done += 1; });
  input.files = [fileOf("isto não é json")];
  input.listeners.change();
  assert.equal(input.value, "", "limpa para permitir escolher o mesmo arquivo de novo");
  await settle();
  assert.equal(done, 0);
});

test("importar: sem arquivo escolhido não faz nada", async () => {
  const { input } = mount();
  let done = 0;
  ui.bindOwnPostsSection(() => { done += 1; });
  input.files = [];
  input.listeners.change();
  await settle();
  assert.equal(done, 0);
});

test("importar: arquivo de outra conta é recusado e nada é restaurado", async () => {
  await freshAccountWithPost();
  const stranger = ownPosts.buildOwnPostsFile("vx_outra_conta", [{ post: { id: "p_alheio", sig: "s", author: "vx_outra_conta" }, blob: null }]);
  const { input } = mount();
  let done = 0;
  ui.bindOwnPostsSection(() => { done += 1; });
  input.files = [fileOf(stranger.text)];
  input.listeners.change();
  await settle();
  assert.equal(done, 0);
  assert.equal((await cacheNode.getAllLocalPosts()).some((p) => p.id === "p_alheio"), false);
});

test("importar: arquivo da própria conta restaura o post apagado e chama onDone", async () => {
  const signed = await freshAccountWithPost();
  const file = await ownPosts.exportOwnPosts();
  assert.equal(file.count >= 1, true);
  await cacheNode.clearLocalPosts();
  assert.equal((await cacheNode.getAllLocalPosts()).some((p) => p.id === signed.id), false);
  const { input } = mount();
  let done = 0;
  ui.bindOwnPostsSection(() => { done += 1; });
  input.files = [fileOf(file.text)];
  input.listeners.change();
  await waitFor(() => done === 1);
  assert.equal(done, 1);
  assert.equal((await cacheNode.getAllLocalPosts()).some((p) => p.id === signed.id), true);
});
