/**
 * @file Cobertura T6: página leve de conferência do aviso (`aviso/aviso-page.js`): inicialização (`boot`) sobre
 * `#aviso-root` e o desenho de cada estado (verde, amarelo, chave nova, inválido, encerrado) por `textContent`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const root = mount(doc, '<main id="aviso-root"></main>');

const { encodeAvisoFragment, avisoCode } = await import("../client/aviso/aviso-link.js");
const { canonicalString } = await import("../client/js/sig-format.js");
const { bytesToB64Url, computeRouteId } = await import("../client/js/signed-verify.js");

const DAY = 24 * 60 * 60 * 1000;

async function newSigner() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const pubKey = { kty, crv, x, y };
  const author = await computeRouteId(pubKey);
  return async (extra = {}) => {
    const body = {
      type: "topic", id: "a1", communityId: "c1", avisoKind: "informe", title: "Mutirão de limpeza", body: "Sábado.",
      authorDisplay: "Ana Lúcia", authorAvatar: "", ts: Date.now(), author, pubKey, ...extra,
    };
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonicalString(body)));
    return { ...body, sig: bytesToB64Url(sig) };
  };
}

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};

const sign = await newSigner();
const first = await sign();
globalThis.location.hash = `#${encodeAvisoFragment(first)}`;
const page = await import("../client/aviso/aviso-page.js");

const until = async (check, label) => {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`tempo esgotado: ${label}`);
};
const text = (selector) => root.querySelector(selector)?.textContent;

test("boot: com #aviso-root e link válido, a página mostra 'Primeira vez' e guarda a chave no aparelho", async () => {
  await until(() => root.querySelector(".aviso-status"), "página desenhada");
  assert.equal(root.querySelector(".aviso-status").className, "aviso-status aviso-amarelo");
  assert.equal(text("h1"), "Primeira vez");
  assert.equal(text(".aviso-title"), "Mutirão de limpeza");
  assert.equal(text(".aviso-body"), "Sábado.");
  const remembered = JSON.parse(localStorage.getItem(page.TRUST_KEY));
  assert.deepEqual(remembered.groups.c1, [first.author]);
  assert.deepEqual(remembered.names["ana lucia"], [first.author]);
});

test("paint verde: respostas de aviso sem data oferecem só 'Ciente', com o código no link do WhatsApp", async () => {
  const store = page.trustStore(memory());
  page.rememberKey(store, first);
  const result = await page.evaluateAviso(`#${encodeAvisoFragment(first)}`, store);
  assert.equal(result.state, "verde");
  page.paint(doc, root, result, store);
  assert.equal(text("h1"), "Veio da coordenação");
  assert.match(text(".aviso-status"), /Assinado por Ana Lúcia\. Código /);
  const links = root.querySelectorAll("a.aviso-reply");
  assert.deepEqual(links.map((a) => a.textContent), ["✅ Ciente"]);
  assert.equal(links[0].href, page.replyHref("✅ Ciente", await avisoCode(first)));
  assert.equal(links[0].rel, "noopener");
  assert.equal(root.querySelector(".aviso-confirm"), null);
  assert.match(text(".aviso-note"), /Print de tela verde não prova nada/);
});

test("paint de convocação: mostra quando e onde e oferece as quatro respostas", async () => {
  const eventAt = Date.now() + 3 * DAY;
  const convocacao = await sign({ id: "a2", avisoKind: "convocacao", title: "Assembleia de rua", eventAt, eventPlace: "Praça central" });
  const store = page.trustStore(memory());
  page.rememberKey(store, convocacao);
  const result = await page.evaluateAviso(`#${encodeAvisoFragment(convocacao)}`, store);
  page.paint(doc, root, result, store);
  assert.match(text(".aviso-when"), /^Quando: .*2026.* · Praça central$/);
  assert.deepEqual(
    root.querySelectorAll("a.aviso-reply").map((a) => a.textContent),
    ["✅ Ciente", "🙋 Vou", "🤔 Talvez", "❌ Não vou"],
  );
  assert.equal(text(".aviso-hint"), "Responder no grupo:");
});

test("paint de chave nova: sem respostas; confirmar guarda a chave e repinta de verde", async () => {
  const memoryStorage = memory();
  const store = page.trustStore(memoryStorage);
  page.rememberKey(store, first);
  const impostor = await (await newSigner())({ id: "a3", communityId: "c1", authorDisplay: "Ana Lúcia" });
  const result = await page.evaluateAviso(`#${encodeAvisoFragment(impostor)}`, store);
  assert.equal(result.state, "chave-nova");
  page.paint(doc, root, result, store);
  assert.equal(root.querySelector(".aviso-status").className, "aviso-status aviso-chave-nova");
  assert.equal(text("h1"), "Chave nova");
  assert.equal(root.querySelectorAll("a.aviso-reply").length, 0, "chave nova nunca oferece resposta");
  const confirm = root.querySelector("button.aviso-confirm");
  assert.equal(confirm.type, "button");
  click(confirm);
  assert.equal(text("h1"), "Veio da coordenação");
  assert.equal(root.querySelector("button.aviso-confirm"), null);
  assert.ok(JSON.parse(memoryStorage.getItem(page.TRUST_KEY)).groups.c1.includes(impostor.author));
  assert.equal(root.querySelectorAll("a.aviso-reply").length, 1);
});

test("paint inválido: só o aviso de perigo e a nota; nada do conteúdo adulterado é desenhado", async () => {
  const store = page.trustStore(memory());
  const adulterado = { ...first, title: "Pix urgente para esta conta" };
  const result = await page.evaluateAviso(`#${encodeAvisoFragment(adulterado)}`, store);
  assert.equal(result.state, "invalido");
  page.paint(doc, root, result, store);
  assert.equal(text("h1"), "Não confie");
  assert.equal(root.querySelector(".aviso-title"), null);
  assert.ok(!root.textContent.includes("Pix urgente"));
  assert.match(root.textContent, /alterado ou não tem assinatura válida/);
});

test("paint encerrado: mostra o conteúdo, sem respostas nem confirmação", async () => {
  const old = await sign({ id: "a4", ts: Date.now() - 400 * DAY });
  const store = page.trustStore(memory());
  const result = await page.evaluateAviso(`#${encodeAvisoFragment(old)}`, store);
  assert.equal(result.state, "encerrado");
  page.paint(doc, root, result, store);
  assert.equal(text("h1"), "Aviso encerrado");
  assert.equal(text(".aviso-title"), "Mutirão de limpeza");
  assert.equal(root.querySelectorAll("a.aviso-reply").length, 0);
  assert.equal(root.querySelector(".aviso-confirm"), null);
});
