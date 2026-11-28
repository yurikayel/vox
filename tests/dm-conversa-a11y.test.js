/**
 * @file Conversa aberta da DM (`#/dm/<addr>`) para teclado e leitor de tela: o 📷 recebe foco (2.1.1), os campos têm
 * nome sem depender do placeholder (3.3.2), a lista de mensagens é `role="log"` para anunciar a que chega (4.1.3) e a
 * reação diz se está ligada com `aria-pressed` (4.1.2).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const dm = await import("../client/js/render/dm.js");

const PEER = "vx_par000000000001";
const ME = "vx_eu00000000000001";

function threadHtml() {
  const main = { innerHTML: "", closest: () => null };
  const msg = { id: "m1", from: PEER, text: "oi", ts: 1, status: "received", reactions: { "👍": [ME, PEER], "❤️": [PEER] } };
  dm.renderDmThread(main, PEER, [msg], ME, { hasDmPub: true });
  return main.innerHTML;
}

/** Tag de abertura do elemento com o id dado. */
function tagOf(html, id) {
  return new RegExp(`<[a-z]+\\b[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0] ?? "";
}

test("o anexo 📷 é um campo de arquivo focável, com o rótulo visível logo antes", () => {
  const html = threadHtml();
  const input = tagOf(html, "dm-media-input");
  assert.match(input, /type="file"/);
  assert.match(input, /class="[^"]*\bsr-only\b/, "fica em .sr-only");
  assert.doesNotMatch(input, /\bhidden\b|display\s*:\s*none|tabindex="-1"/, "não sai da ordem de Tab");
  assert.match(input, /aria-label="Anexar foto"/);
  assert.match(html, /<label for="dm-media-input"[^>]*>📷<\/label>\s*<input[^>]*id="dm-media-input"/, "o :has(+ …) do style.css mostra o foco no 📷");
});

test("o campo da mensagem tem nome acessível próprio, sem depender do placeholder", () => {
  assert.match(tagOf(threadHtml(), "dm-message-input"), /aria-label="Mensagem"/);
});

test("o campo do convite na lista também tem nome próprio", () => {
  const main = { innerHTML: "", closest: () => null };
  dm.renderDmList(main, [], ME, { contactList: [] });
  assert.match(tagOf(main.innerHTML, "dm-peer-input"), /aria-label="Convite ou contato"/);
});

test("a lista de mensagens é um log, para anunciar a mensagem que chega", () => {
  const lista = tagOf(threadHtml(), "dm-thread-container");
  assert.match(lista, /role="log"/);
  assert.match(lista, /aria-label="[^"]+"/);
});

test("a reação diz se está ligada: aria-pressed true só na que eu dei", () => {
  const html = threadHtml();
  const pilulas = [...html.matchAll(/<button[^>]*class="dm-reaction-pill[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(pilulas.length, 2);
  const minha = pilulas.find((p) => p.includes('data-emoji="👍"'));
  const alheia = pilulas.find((p) => p.includes('data-emoji="❤️"'));
  assert.match(minha, /\bactive\b[^>]*aria-pressed="true"/);
  assert.match(alheia, /aria-pressed="false"/);
  assert.doesNotMatch(alheia, /\bactive\b/);
});
