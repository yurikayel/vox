import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as testimonials from "../client/js/testimonials.js";

test("testimonials - validação de entrada rejeita texto vazio ou auto-depoimento", () => {
  assert.equal(
    testimonials.validateTestimonialInput({ text: "", recipientAddress: "addr_b", authorAddress: "addr_a" }).valid,
    false
  );

  assert.equal(
    testimonials.validateTestimonialInput({ text: "Bom companheiro", recipientAddress: "addr_a", authorAddress: "addr_a" }).valid,
    false
  );

  const ok = testimonials.validateTestimonialInput({
    text: "Grande articulador no território!",
    recipientAddress: "addr_bob",
    authorAddress: "addr_alice",
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.text, "Grande articulador no território!");
});

test("testimonials - tags ANS-104 estruturadas para depoimento e aprovação", () => {
  const tTags = testimonials.buildTestimonialTags({
    recipientAddress: "addr_bob",
    authorAddress: "addr_alice",
    ts: 1729000000000,
  });

  assert.ok(tTags.some((t) => t.name === "Type" && t.value === testimonials.TESTIMONIAL_TYPE));
  assert.ok(tTags.some((t) => t.name === "Recipient-Address" && t.value === "addr_bob"));
  assert.ok(tTags.some((t) => t.name === "Author-Address" && t.value === "addr_alice"));

  const aTags = testimonials.buildTestimonialApprovalTags({
    testimonialTxId: "tx_test_999",
    recipientAddress: "addr_bob",
    ts: 1729000001000,
  });
  assert.ok(aTags.some((t) => t.name === "Type" && t.value === testimonials.TESTIMONIAL_APPROVAL_TYPE));
  assert.ok(aTags.some((t) => t.name === "Testimonial-Tx" && t.value === "tx_test_999"));
});

test("testimonials - mediação por aprovação filtra apenas depoimentos aceitos pelo destinatário", () => {
  const rawList = [
    { id: "tx_dep_1", text: "Excelente camarada", recipientAddress: "addr_bob", authorAddress: "addr_alice" },
    { id: "tx_dep_2", text: "Tentativa de spam ou ataque", recipientAddress: "addr_bob", authorAddress: "addr_troll" },
  ];

  const approvals = [
    {
      testimonialTxId: "tx_dep_1",
      recipientAddress: "addr_bob",
    },
  ];

  const approvedOnly = testimonials.filterApprovedTestimonials(rawList, approvals);
  assert.equal(approvedOnly.length, 1);
  assert.equal(approvedOnly[0].id, "tx_dep_1");
  assert.equal(approvedOnly[0].status, testimonials.TESTIMONIAL_STATUS.APPROVED);
});

test("testimonials - renderCommunityBadgesHtml gera grade clássica Orkut de crachás", () => {
  const htmlEmpty = testimonials.renderCommunityBadgesHtml([]);
  assert.ok(htmlEmpty.includes("vox-badges-empty"));

  const communities = [
    { id: "com_sp", name: "Sindicato dos Metalúrgicos", avatar: "metal.jpg" },
    { id: "com_ce", name: "Banco Palmas & Bairro Palmeiras", avatar: "palmas.jpg" },
  ];

  const html = testimonials.renderCommunityBadgesHtml(communities);
  assert.ok(html.includes("vox-badges-grid"));
  assert.ok(html.includes("Sindicato dos Metalúrgicos"));
  assert.ok(html.includes("Banco Palmas"));
  assert.ok(html.includes("#/c/com_sp"));
  assert.ok(html.includes("#/c/com_ce"));
});
