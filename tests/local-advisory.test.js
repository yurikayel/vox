import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePrePublishAdvisory,
  renderLocalAdvisoryBanner,
} from "../client/js/shared/local-advisory.js";
import * as moderation from "../client/js/moderation.js";

test("local-advisory - texto comum e entradas vazias retornam consultivo sem avisos", () => {
  for (const input of ["", null, undefined, 123, "Reunião da praça às 19h em 2026-11-24."]) {
    const res = analyzePrePublishAdvisory(input);
    assert.equal(res.advisoryOnly, true);
    assert.equal(res.blocksPublish, false);
    assert.equal(res.hasWarnings, false);
    assert.deepEqual(res.warnings, []);
  }
});

test("local-advisory - detecta exposição acidental de CPF, e-mail e telefone BR", () => {
  const cpfRes = analyzePrePublishAdvisory("Meu CPF é 123.456.789-01 para cadastro.");
  assert.equal(cpfRes.advisoryOnly, true);
  assert.equal(cpfRes.blocksPublish, false);
  assert.equal(cpfRes.hasWarnings, true);
  assert.equal(cpfRes.warnings[0].code, "pii-exposure");
  assert.deepEqual(cpfRes.warnings[0].kinds, ["CPF"]);

  const emailRes = analyzePrePublishAdvisory("Fale comigo em contato.teste@exemplo.org hoje.");
  assert.equal(emailRes.warnings[0].code, "pii-exposure");
  assert.deepEqual(emailRes.warnings[0].kinds, ["e-mail"]);

  const phoneRes = analyzePrePublishAdvisory("Liga no +55 (11) 98765-4321 ou 21 3456-7890.");
  assert.equal(phoneRes.warnings[0].code, "pii-exposure");
  assert.deepEqual(phoneRes.warnings[0].kinds, ["telefone"]);

  const allRes = analyzePrePublishAdvisory(
    "CPF 111.222.333-44, e-mail a@b.com e telefone (31) 99999-0000."
  );
  assert.deepEqual(allRes.warnings[0].kinds, ["CPF", "e-mail", "telefone"]);
});

test("local-advisory - detecta encurtadores opacos e http:// não-loopback, liberando https:// e loopback", () => {
  const shortRes = analyzePrePublishAdvisory("Veja os detalhes em https://bit.ly/reuniao-bairros");
  assert.equal(shortRes.hasWarnings, true);
  assert.equal(shortRes.warnings[0].code, "opaque-or-insecure-link");
  assert.deepEqual(shortRes.warnings[0].reasons, ["shortener"]);

  const bareShortRes = analyzePrePublishAdvisory("Confira tinyurl.com/ata-assembleia");
  assert.equal(bareShortRes.hasWarnings, true);
  assert.deepEqual(bareShortRes.warnings[0].reasons, ["shortener"]);

  const httpRes = analyzePrePublishAdvisory("Fonte: http://exemplo.org/documento");
  assert.equal(httpRes.hasWarnings, true);
  assert.deepEqual(httpRes.warnings[0].reasons, ["insecure-http"]);

  const bothRes = analyzePrePublishAdvisory("Acesse http://is.gd/abc123 agora");
  assert.equal(bothRes.hasWarnings, true);
  assert.deepEqual(bothRes.warnings[0].reasons, ["shortener", "insecure-http"]);

  const safeUrls = [
    "https://exemplo.org/documento",
    "http://localhost:8000/preview",
    "http://sub.localhost:3000/rota",
    "http://127.0.0.1:8080/status",
    "http://[::1]:8080/health",
    "http://[::url-malformada",
  ];
  for (const text of safeUrls) {
    const res = analyzePrePublishAdvisory(text);
    assert.equal(res.hasWarnings, false, `Não deve alertar para: ${text}`);
  }
});

test("local-advisory - detecta CAIXA ALTA agressiva apenas em textos extensos (>=24 letras e >=80%)", () => {
  const capsRes = analyzePrePublishAdvisory(
    "ISSO É UM ABSURDO TOTAL E INACEITÁVEL NESTA COMUNIDADE!!"
  );
  assert.equal(capsRes.advisoryOnly, true);
  assert.equal(capsRes.blocksPublish, false);
  assert.equal(capsRes.hasWarnings, true);
  assert.equal(capsRes.warnings[0].code, "aggressive-caps");
  assert.ok(capsRes.warnings[0].ratio >= 0.8);

  const shortCaps = analyzePrePublishAdvisory("URGENTE: REUNIÃO HOJE!");
  assert.equal(shortCaps.hasWarnings, false);

  const mixedLong = analyzePrePublishAdvisory(
    "URGENTE: precisamos conversar com calma sobre o cronograma da praça comunitária."
  );
  assert.equal(mixedLong.hasWarnings, false);
});

test("local-advisory - renderLocalAdvisoryBanner escapa XSS, usa role=status e inclui ação de ignorar", () => {
  assert.equal(renderLocalAdvisoryBanner(null), "");
  assert.equal(renderLocalAdvisoryBanner({ hasWarnings: false, warnings: [] }), "");

  const xssResult = {
    advisoryOnly: true,
    blocksPublish: false,
    hasWarnings: true,
    warnings: [
      {
        code: 'xss" onclick="alert(1)',
        title: "<script>alert('x')</script>",
        detail: `Texto com <img src=x onerror="evil()"> & 'aspas'`,
      },
      {},
    ],
  };

  const html = renderLocalAdvisoryBanner(xssResult);
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('data-advisory-only="true"'));
  assert.ok(html.includes('data-advisory-action="publish-anyway"'));
  assert.ok(html.includes("Ignorar e publicar assim mesmo"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img "));
  assert.ok(html.includes("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"));
  assert.ok(html.includes("&quot; onclick=&quot;alert(1)"));
  assert.ok(html.includes("Aviso consultivo"));
});

test("local-advisory e helpers 1-toque em moderation.js fazem 0 chamadas fetch", () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => {
    fetchCalls += 1;
    throw new Error("Rede proibida em aviso local preventivo e ocultação local");
  };

  try {
    const res = moderation.analyzePrePublishAdvisory(
      "ATENÇÃO COMUNIDADE INTEIRA, MEU TELEFONE É (11) 98765-4321 E O LINK É http://bit.ly/ABC"
    );
    assert.equal(res.advisoryOnly, true);
    assert.equal(res.blocksPublish, false);
    assert.equal(res.warnings.length, 3);
    const banner = moderation.renderLocalAdvisoryBanner(res);
    assert.ok(banner.includes('role="status"'));

    moderation.blurPostLocally("post_zero_net");
    moderation.quickHidePost("post_zero_net_2", "Incômodo local");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("moderation - helpers locais de 1 toque (blurPostLocally, unblurPostLocally, isPostBlurredLocally, quickHidePost)", () => {
  localStorage.clear();

  assert.equal(moderation.isPostBlurredLocally(""), false);
  assert.equal(moderation.blurPostLocally(""), false);
  assert.equal(moderation.unblurPostLocally(""), false);
  assert.deepEqual(moderation.quickHidePost(""), {
    ok: false,
    postId: "",
    blurred: false,
    quarantined: false,
    localOnly: true,
    reason: "",
  });

  assert.equal(moderation.isPostBlurredLocally("p_blur_1"), false);
  assert.equal(moderation.blurPostLocally("p_blur_1"), true);
  assert.equal(moderation.blurPostLocally("p_blur_1"), true);
  assert.deepEqual(moderation.getBlurredPostIds(), ["p_blur_1"]);
  assert.equal(moderation.isPostBlurredLocally("p_blur_1"), true);
  assert.ok(localStorage.getItem(moderation.BLURRED_STORAGE_KEY).includes("p_blur_1"));

  assert.equal(moderation.unblurPostLocally("p_blur_1"), true);
  assert.equal(moderation.isPostBlurredLocally("p_blur_1"), false);
  assert.deepEqual(moderation.getBlurredPostIds(), []);

  const longReason = "x".repeat(140);
  const hidden = moderation.quickHidePost("p_quick_1", longReason);
  assert.equal(hidden.ok, true);
  assert.equal(hidden.postId, "p_quick_1");
  assert.equal(hidden.blurred, true);
  assert.equal(hidden.quarantined, true);
  assert.equal(hidden.localOnly, true);
  assert.equal(hidden.reason.length, 100);

  assert.equal(moderation.isPostBlurredLocally("p_quick_1"), true);
  assert.equal(moderation.isPostQuarantined("p_quick_1"), true);
  assert.equal(moderation.canEchoPost("p_quick_1"), false);

  const visible = moderation.filterFeedPosts([
    { id: "p_quick_1", author: "vx_a" },
    { id: "p_keep_2", author: "vx_a" },
  ]);
  assert.deepEqual(visible.map((p) => p.id), ["p_keep_2"]);

  moderation.unblurPostLocally("p_quick_1");
  moderation.unquarantinePost("p_quick_1");
  assert.equal(moderation.isPostBlurredLocally("p_quick_1"), false);
  assert.equal(moderation.canEchoPost("p_quick_1"), true);
});
