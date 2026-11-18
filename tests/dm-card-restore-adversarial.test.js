/**
 * @file DM — cartão de contexto, citação e foto vindos de um backup malicioso: o caminho real
 * `backup no e-mail → restoreInboxBackup → IndexedDB → renderDmThread`, com criptografia de verdade.
 *
 * `safeCardRoute` só rodava ao interpretar o fio; a restauração gravava o cartão cru e a tela o lia cru. Estes
 * testes fixam as duas pontas: a restauração normaliza o que grava e a tela revalida o que lê (linhas que
 * ficaram no IndexedDB antes da correção continuam passando pela tela).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mockStores } from "./setup.js";
import * as backup from "../client/js/identity/inbox-backup.js";
import * as cacheNode from "../client/js/cache-node.js";
import * as localAccount from "../client/js/identity/local-account.js";
import * as keyLock from "../client/js/identity/key-lock.js";
import { renderDmThread } from "../client/js/render/dm.js";

const SENHA = "senha soberana de teste 2026";
const PEER = "vx_peer_do_cartao_001";
let seq = 0;

function wipeDevice() {
  localStorage.clear();
  for (const store of mockStores.values()) store.map?.clear();
  keyLock.__resetKeyLockForTests?.();
}

const rawDm = (me, over) => ({ id: `dm_card_${++seq}`, peerAddress: PEER, from: PEER, to: me, text: "veja", ts: Date.now(), status: "received", ...over });

/** Guarda as DMs cruas, monta o backup de verdade, apaga o aparelho e restaura; devolve as mensagens do fio. */
async function restoreThrough(dmsFor) {
  wipeDevice();
  const acc = await localAccount.ensureLocalAccount();
  for (const m of dmsFor(acc.routeId)) await cacheNode.saveDmMessage(m);
  await backup.enableInboxBackup(SENHA);
  const built = await backup.buildInboxBackup("completo");
  wipeDevice();
  await backup.restoreInboxBackup(built.text, SENHA);
  return { me: acc.routeId, messages: await cacheNode.getDmMessages(PEER) };
}

function htmlOf(me, messages) {
  const main = { innerHTML: "" };
  renderDmThread(main, PEER, messages, me, {});
  return main.innerHTML;
}

const EVIL_URLS = [
  "javascript:alert(1)",
  "  JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "//evil.example/phish",
  "https://evil.example/phish",
  "&#106;avascript:alert(1)",
  "#/ok with space",
  `#/${"a".repeat(600)}`,
];

test("cartão e backup - restauração não grava href perigoso e a tela não cria link", async () => {
  const { me, messages } = await restoreThrough((me) =>
    EVIL_URLS.map((url) => rawDm(me, { contextCard: { type: "topic", title: "Tópico", url, href: url } }))
  );
  assert.equal(messages.length, EVIL_URLS.length);
  for (const m of messages) {
    assert.equal(m.contextCard.url, "", "url gravada cai para vazio");
    assert.equal(m.contextCard.href, "", "href gravado cai para vazio");
  }
  const html = htmlOf(me, messages);
  assert.ok(!html.includes("dm-context-link"), "sem botão Abrir");
  assert.ok(!/href="[^#"]/i.test(html.replace(/href="#\/(?:dm|u|c)\/[^"]*"/g, "")), "nenhum href externo ou com esquema");
});

test("cartão e backup - a tela revalida linha que já estava gravada crua no aparelho", () => {
  const messages = EVIL_URLS.map((url, i) => ({ id: `dm_cru_${i}`, from: PEER, text: "x", ts: i + 1, status: "received", contextCard: { type: "listing", title: "Bike", url } }));
  const html = htmlOf("vx_me", messages);
  assert.ok(!html.includes("dm-context-link"), "sem botão Abrir para rota fora de #/");
  assert.ok(!/href="\s*(?:javascript|data|https?|\/\/)/i.test(html));
});

test("cartão e backup - controle: cartão legítimo sobrevive à restauração e à tela com a rota interna", async () => {
  const { me, messages } = await restoreThrough((me) => [
    rawDm(me, { contextCard: { type: "listing", id: "l1", title: "Bicicleta", price: "R$ 300", pixKey: "ana@exemplo.com", communityId: "horta", url: "#/c/horta?tab=listings" } }),
  ]);
  assert.equal(messages[0].contextCard.url, "#/c/horta?tab=listings");
  const html = htmlOf(me, messages);
  assert.ok(html.includes('href="#/c/horta?tab=listings"'));
  assert.ok(html.includes('data-pix="ana@exemplo.com"'));
});

test("cartão e backup - entidades e aspas no cartão saem escapadas, sem atributo ou tag novos", async () => {
  const sneaky = '#/t/x"onmouseover="alert(1)';
  const { me, messages } = await restoreThrough((me) => [
    rawDm(me, { contextCard: { type: 'pix"><script>alert(1)</script>', title: "&lt;b&gt;<img src=x onerror=alert(2)>", url: sneaky, pixKey: '"><svg onload=alert(3)>' } }),
  ]);
  const html = htmlOf(me, messages);
  assert.ok(!/<script|<img[^>]*onerror|<svg/i.test(html), "nenhuma tag injetada");
  assert.ok(!/\sonmouseover=/i.test(html), "nenhum atributo injetado");
  assert.ok(!/\sonload=/i.test(html));
});

test("cartão e backup - tipo de cartão fora da lista não vira cartão", async () => {
  const { me, messages } = await restoreThrough((me) => [
    rawDm(me, { text: "só texto", contextCard: { type: "malware", title: "Clique", url: "#/t/x" } }),
  ]);
  assert.equal(messages[0].contextCard, null);
  assert.ok(!htmlOf(me, messages).includes("dm-context-card"));
});

test("cartão e backup - campos extras do cartão não são gravados", async () => {
  const { messages } = await restoreThrough((me) => [
    rawDm(me, { contextCard: { type: "topic", title: "T", onclick: "alert(1)", __proto__: { admin: true }, html: "<b>x</b>", extra: { a: 1 } } }),
  ]);
  const keys = Object.keys(messages[0].contextCard).sort();
  assert.deepEqual(keys, ["communityId", "href", "id", "pixKey", "price", "priceBrl", "title", "type", "url"]);
});

test("cartão e backup - cartão que não é objeto (texto, lista, número) é descartado sem derrubar a tela", async () => {
  const lixo = ["javascript:alert(1)", ["#/t/x"], 42, true];
  const { me, messages } = await restoreThrough((me) => lixo.map((contextCard) => rawDm(me, { contextCard })));
  assert.equal(messages.length, lixo.length);
  for (const m of messages) assert.equal(m.contextCard, null);
  assert.ok(!htmlOf(me, messages).includes("dm-context-card"));
  const crus = lixo.map((contextCard, i) => ({ id: `dm_lixo_${i}`, from: PEER, text: "x", ts: i + 1, status: "received", contextCard }));
  assert.ok(!htmlOf("vx_me", crus).includes("dm-context-link"), "a tela sozinha também aguenta");
});

test("cartão e backup - campos enormes do cartão não entram inteiros na restauração nem na tela", async () => {
  const huge = "Z".repeat(1_000_000);
  const { me, messages } = await restoreThrough((me) => [
    rawDm(me, { contextCard: { type: "listing", id: huge, title: huge, price: huge, pixKey: huge, communityId: huge, url: `#/${huge}` } }),
  ]);
  const card = messages[0].contextCard;
  for (const [campo, valor] of Object.entries(card)) assert.ok(String(valor).length <= 600, `${campo} acima do teto: ${String(valor).length}`);
  assert.ok(htmlOf(me, messages).length < 20_000, "HTML do fio não cresce com o lixo");
});

test("cartão e backup - a tela corta campos enormes de linha já gravada crua", () => {
  const huge = "Z".repeat(1_000_000);
  const m = { id: "dm_enorme", from: PEER, text: "x", ts: 1, status: "received", contextCard: { type: "listing", title: huge, price: huge, pixKey: huge } };
  assert.ok(htmlOf("vx_me", [m]).length < 20_000);
});

test("cartão e backup - foto de fora do formato (URL externa, svg, html) não vira <img> na restauração nem na tela", async () => {
  const evil = ["https://evil.example/pixel.png", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:text/html;base64,PHNjcmlwdD4=", 'data:image/png;base64,AAAA" onerror="x'];
  const { me, messages } = await restoreThrough((me) => evil.map((mediaDataUrl) => rawDm(me, { mediaDataUrl })));
  for (const m of messages) assert.equal(m.mediaDataUrl, "");
  assert.ok(!htmlOf(me, messages).includes("<img"), "nenhuma imagem carregada");
  const crus = evil.map((mediaDataUrl, i) => ({ id: `dm_img_${i}`, from: PEER, text: "x", ts: i + 1, status: "received", mediaDataUrl }));
  assert.ok(!htmlOf("vx_me", crus).includes("<img"), "a tela sozinha também não carrega");
});

test("cartão e backup - citação enorme ou sem forma é normalizada na restauração e cortada na tela", async () => {
  const huge = "Q".repeat(1_000_000);
  const { me, messages } = await restoreThrough((me) => [
    rawDm(me, { replyTo: { id: "r1", author: huge, snippet: huge } }),
    rawDm(me, { replyTo: "texto solto" }),
  ]);
  const [grande, solta] = [messages.find((m) => m.replyTo), messages.find((m) => !m.replyTo)];
  assert.ok(grande.replyTo.snippet.length <= 90);
  assert.ok(grande.replyTo.author.length <= 200, "autor da citação também tem teto");
  assert.ok(solta, "citação sem forma vira nenhuma");
  assert.ok(htmlOf(me, messages).length < 20_000);
});
