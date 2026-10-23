import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as listing from "../client/js/listing.js";

test("listing - isCommercialEnabled reconhece flag booleana e tags", () => {
  assert.equal(listing.isCommercialEnabled(null), false);
  assert.equal(listing.isCommercialEnabled({}), false);
  assert.equal(listing.isCommercialEnabled({ commercialEnabled: false }), false);
  assert.equal(listing.isCommercialEnabled({ commercialEnabled: true }), true);
  assert.equal(listing.isCommercialEnabled({ commercialEnabled: "true" }), true);
  assert.equal(listing.isCommercialEnabled({ tags: { "Commercial-Posts": "enabled" } }), true);
});

test("listing - normalizePriceLabel formata valores em reais com R$ e preserva termos especiais", () => {
  assert.equal(listing.normalizePriceLabel(""), "");
  assert.equal(listing.normalizePriceLabel(null), "");
  assert.equal(listing.normalizePriceLabel("45"), "R$ 45");
  assert.equal(listing.normalizePriceLabel("28,50"), "R$ 28,50");
  assert.equal(listing.normalizePriceLabel("R$ 55"), "R$ 55");
  assert.equal(listing.normalizePriceLabel("r$ 30,00"), "R$ 30,00");
  // Termos especiais sem prefixo R$
  assert.equal(listing.normalizePriceLabel("grátis"), "Grátis");
  assert.equal(listing.normalizePriceLabel("GRATUITO"), "Gratuito");
  assert.equal(listing.normalizePriceLabel("a combinar"), "A combinar");
  assert.equal(listing.normalizePriceLabel("troca"), "Troca");
  assert.equal(listing.normalizePriceLabel("doação"), "Doação");
});

test("listing - normalizeLocationLabel limita tamanho e apara espaços", () => {
  assert.equal(listing.normalizeLocationLabel("   Vila Madalena, SP   "), "Vila Madalena, SP");
  assert.equal(listing.normalizeLocationLabel(""), "");
  assert.equal(listing.normalizeLocationLabel(null), "");
  const longText = "A".repeat(100);
  assert.equal(listing.normalizeLocationLabel(longText, 60).length, 60);
});

test("listing - normalizeListingStatus e formatListingStatus lidam com inglês, português e caixa mista", () => {
  assert.equal(listing.normalizeListingStatus("available"), "available");
  assert.equal(listing.normalizeListingStatus("AVAILABLE"), "available");
  assert.equal(listing.normalizeListingStatus("sold"), "sold");
  assert.equal(listing.normalizeListingStatus("Vendido"), "sold");
  assert.equal(listing.normalizeListingStatus("reserved"), "reserved");
  assert.equal(listing.normalizeListingStatus("Reservado"), "reserved");
  assert.equal(listing.normalizeListingStatus(null), "available");

  assert.equal(listing.formatListingStatus("available"), "Disponível");
  assert.equal(listing.formatListingStatus("sold"), "Vendido");
  assert.equal(listing.formatListingStatus("vendido"), "Vendido");
  assert.equal(listing.formatListingStatus("reserved"), "Reservado");
  assert.equal(listing.formatListingStatus("reservado"), "Reservado");
  assert.equal(listing.formatListingStatus(null), "Disponível");
});

test("listing - validateListingInput rejeita títulos vazios, descrição ausente e limites de caracteres", () => {
  assert.equal(listing.validateListingInput({ title: "", body: "ok" }).valid, false);
  assert.equal(listing.validateListingInput({ title: "   ", body: "ok" }).valid, false);
  assert.equal(listing.validateListingInput({ title: "Título", body: "" }).valid, false);
  assert.equal(listing.validateListingInput({ title: "Título", body: "   " }).valid, false);

  const longTitle = "T".repeat(121);
  const titleVal = listing.validateListingInput({ title: longTitle, body: "Descrição" });
  assert.equal(titleVal.valid, false);
  assert.ok(titleVal.error.includes("Título muito longo"));

  const longBody = "B".repeat(2001);
  const bodyVal = listing.validateListingInput({ title: "Título", body: longBody });
  assert.equal(bodyVal.valid, false);
  assert.ok(bodyVal.error.includes("Descrição muito longa"));

  assert.equal(listing.validateListingInput({ title: "Título", body: "Descrição" }).valid, true);
});
