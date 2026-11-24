/**
 * PM-105 — Testes da rota read-first de caminho de volta POSSE (UI + verificação offline + paridade CLI).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalReturnUrl, validateReturnUrl } from "../scripts/posse-return-check.mjs";
import { bytesToB64Url, computeRouteId } from "../client/js/signed-verify.js";
import { canonicalString } from "../client/js/sig-format.js";
import { parseRoute, routeTitle } from "../client/js/app/route-parse.js";
import { isReadFirstRoute } from "../client/js/app/read-first.js";
import { shouldShowCantinaGate } from "../client/js/app/cantina-gate.js";
import {
  formatSourceLabel,
  isValidPosseToken,
  parsePosseReturnTarget,
  renderPosseReturnHtml,
  renderSignatureBadgeHtml,
} from "../client/js/render/posse-return.js";
import {
  loadPosseReturnData,
  showPosseReturn,
  verifyPossePost,
} from "../client/js/app/screens-posse-return.js";

/**
 * Cria um post assinado com par de chaves ECDSA P-256 real em WebCrypto.
 *
 * @param {object} fields Campos do post.
 * @returns {Promise<object>} Post assinado compatível com `verifyPayload`.
 */
async function createSignedPost(fields) {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const author = await computeRouteId(pubKey);
  const payload = { ...fields, author, sigv: 2 };
  const data = new TextEncoder().encode(canonicalString(payload));
  const rawSig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, data);
  return { ...payload, pubKey, sig: bytesToB64Url(rawSig) };
}

/**
 * Contêiner leve em memória para testar `showPosseReturn` sem acoplar ao DOM inteiro.
 *
 * @returns {{ innerHTML: string, listeners: Map<string, Function>, querySelector: Function, trigger: Function }}
 */
function makeFakeContainer() {
  const listeners = new Map();
  return {
    innerHTML: "",
    listeners,
    querySelector(sel) {
      if (sel === "#btn-posse-retry" && !this.innerHTML.includes('id="btn-posse-retry"')) return null;
      if (sel === "#btn-posse-participate" && !this.innerHTML.includes('id="btn-posse-participate"')) return null;
      return { addEventListener: (_ev, fn) => listeners.set(sel, fn) };
    },
    trigger(sel) {
      listeners.get(sel)?.();
    },
  };
}

test("PM-105 UI: roteamento read-first reconhece #/c/<cid>/t/<tid> e #/posse sem exigir conta", () => {
  localStorage.clear();
  location.hash = "#/c/feira_centro/t/top_abc123";
  assert.deepEqual(parseRoute(), {
    name: "posse-return",
    communityId: "feira_centro",
    topicId: "top_abc123",
    rawUrl: "",
  });
  assert.equal(routeTitle({ name: "posse-return" }), "Publicação · Vox");
  assert.equal(isReadFirstRoute("posse-return"), true);
  assert.equal(shouldShowCantinaGate("posse-return"), false);

  location.hash = "#/posse?t=top_xyz99&c=bairro_sul";
  assert.deepEqual(parseRoute(), {
    name: "posse-return",
    topicId: "top_xyz99",
    communityId: "bairro_sul",
    rawUrl: "",
  });

  location.hash = "#/posse/top_direto1";
  assert.deepEqual(parseRoute(), {
    name: "posse-return",
    topicId: "top_direto1",
    communityId: "",
    rawUrl: "",
  });
});

test("PM-105 UI: verificação offline aprova assinatura ECDSA P-256 válida e reprova conteúdo adulterado", async () => {
  const signed = await createSignedPost({
    id: "top_sig_ok",
    title: "Ata da feira",
    body: "Texto original assinado na praça.",
    communityId: "feira_centro",
  });
  const valid = await verifyPossePost(signed);
  assert.equal(valid.status, "verified");
  assert.equal(valid.authorRouteId, signed.author);

  const tampered = { ...signed, body: "Texto adulterado por intermediário." };
  const invalid = await verifyPossePost(tampered);
  assert.equal(invalid.status, "invalid");
  assert.match(invalid.reason, /não confere/i);

  const unsigned = await verifyPossePost({ id: "top_no_sig", title: "Sem selo", body: "Corpo" });
  assert.equal(unsigned.status, "unsigned");
});

test("PM-105 UI: abre original + conversa associada sem conta, deduplica respostas e oferece CTA discreto", async () => {
  const signed = await createSignedPost({
    id: "top_conv1",
    title: "Mutirão de sábado",
    body: "Encontro na praça às 9h.\n\nTragam ferramentas.",
    authorDisplay: "Ana",
    communityId: "vila_nova",
  });
  const container = makeFakeContainer();
  let participated = false;
  const state = await showPosseReturn(
    { topicId: "top_conv1", communityId: "vila_nova" },
    {
      container,
      activeUser: "",
      hasAccount: () => false,
      getLocalPost: async () => signed,
      getLocalPosts: async () => [{ id: "rep_1", authorDisplay: "Beto", body: "Estarei lá!" }],
      fetchReplies: async () => ({
        items: [
          { id: "rep_1", authorDisplay: "Beto", body: "Duplicada do gateway" },
          { id: "rep_2", author: "vx_carla123456789012", body: "Levo café." },
        ],
      }),
      onParticipate: () => { participated = true; },
    },
  );
  assert.equal(state.status, "ok");
  assert.equal(state.verification.status, "verified");
  assert.equal(state.replies.length, 2);
  assert.match(container.innerHTML, /data-sig-status="verified"/);
  assert.match(container.innerHTML, /Conversa \(2\)/);
  assert.match(container.innerHTML, /Estarei lá!/);
  assert.match(container.innerHTML, /Levo café\./);
  assert.match(container.innerHTML, /data-requires-entry="1"/);
  container.trigger("#btn-posse-participate");
  assert.equal(participated, true);
});

test("PM-105 UI: fallback para gateway, degradação honesta LAN-21 e recarga em falha", async () => {
  const signed = await createSignedPost({ id: "top_gw1", title: "Do gateway", body: "Conteúdo remoto." });
  const fromGw = await loadPosseReturnData(
    { topicId: "top_gw1" },
    {
      getLocalPost: async () => null,
      getLocalPosts: async () => [],
      fetchTopicById: async () => ({ id: "top_gw1", gateway: "arweave.net", author: signed.author }),
      fetchTransactionData: async () => signed,
      fetchReplies: async () => ({ items: [] }),
      hasAccount: () => true,
    },
  );
  assert.equal(fromGw.status, "ok");
  assert.equal(fromGw.source.kind, "gateway");
  assert.equal(fromGw.hasAccount, true);
  assert.match(renderPosseReturnHtml(fromGw), /Responder na conversa completa/);

  const notFound = await loadPosseReturnData(
    { topicId: "top_missing" },
    { getLocalPost: async () => null, fetchTopicById: async () => null },
  );
  assert.equal(notFound.status, "not-found");
  assert.match(renderPosseReturnHtml(notFound), /Publicação não encontrada/);

  const container = makeFakeContainer();
  let calls = 0;
  const failed = await showPosseReturn(
    { topicId: "top_offline" },
    {
      container,
      activeUser: "",
      getLocalPost: async () => null,
      fetchTopicById: async () => {
        calls += 1;
        throw new TypeError("Failed to fetch network");
      },
    },
  );
  assert.equal(failed.status, "error");
  assert.equal(failed.errorKind, "offline");
  assert.match(container.innerHTML, /Sem conexão com a internet/);
  container.trigger("#btn-posse-retry");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls, 2);
});

test("PM-105 UI: escapeHtml neutraliza XSS em título, corpo, autor, gateway, respostas e erros", () => {
  const payload = `<script>alert("xss")</script><img src=x onerror="evil()">`;
  const html = renderPosseReturnHtml({
    status: "ok",
    topicId: "top_xss1",
    communityId: "com_ok",
    post: { id: "top_xss1", title: payload, body: payload, authorDisplay: payload },
    source: { kind: "gateway", label: payload },
    verification: { status: "invalid", reason: payload },
    replies: [{ id: "r1", authorDisplay: payload, body: payload }],
    hasAccount: false,
  });
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img\s/i);
  assert.match(html, /&lt;script&gt;alert\(&quot;xss&quot;\)&lt;\/script&gt;/);
  assert.match(html, /data-sig-status="invalid"/);

  const errHtml = renderPosseReturnHtml({ status: "invalid-link", errorReason: payload });
  assert.doesNotMatch(errHtml, /<script>/i);
  assert.match(errHtml, /&lt;script&gt;/);
  assert.equal(formatSourceLabel({ kind: "mesh" }), "Malha P2P");
  assert.equal(formatSourceLabel({ kind: "gateway" }), "Gateway remoto");
  assert.match(renderSignatureBadgeHtml({ status: "unsigned" }), /data-sig-status="unsigned"/);
});

test("PM-105 UI: paridade estrita entre parsePosseReturnTarget e scripts/posse-return-check.mjs", async () => {
  const canonicalPlain = buildCanonicalReturnUrl({ baseUrl: "https://vox.example/vox", topicId: "top_par1" });
  const canonicalScoped = buildCanonicalReturnUrl({
    baseUrl: "https://vox.example/",
    topicId: "top_par2",
    communityId: "praca_sul",
  });
  const cases = [
    canonicalPlain,
    canonicalScoped,
    "http://127.0.0.1:8080/#/t/top_local1",
    "javascript:alert(1)",
    "http://evil.example/#/t/top_bad1",
    "https://user:pass@vox.example/#/t/top_bad2",
    "https://vox.example/?utm_source=wa#/t/top_bad3",
    "https://vox.example/#/t/top_bad4?fbclid=123",
    "https://vox.example/#/t/../etc/passwd",
    "https://vox.example/#/c/__proto__/t/top_bad5",
    "https://vox.example/t/top_bad6",
    "not-a-url",
  ];
  for (const url of cases) {
    const cli = validateReturnUrl(url);
    const ui = parsePosseReturnTarget({ rawUrl: url });
    assert.equal(ui.ok, cli.ok, `divergência de paridade para ${url}`);
    if (cli.ok) {
      assert.equal(ui.topicId, cli.topicId);
      assert.equal(ui.communityId, cli.communityId || "");
    }
  }
  assert.equal(isValidPosseToken("top_ok123"), true);
  assert.equal(isValidPosseToken("__proto__"), false);
  assert.equal(parsePosseReturnTarget({ topicId: "ab" }).ok, false);
  assert.equal(parsePosseReturnTarget({ topicId: "top_ok1", communityId: "constructor" }).ok, false);
  const badState = await loadPosseReturnData({ rawUrl: "javascript:alert(1)" });
  assert.equal(badState.status, "invalid-link");
});
