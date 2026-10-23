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

test("listing - normalizePriceLabel formata valores em reais com R$", () => {
  assert.equal(listing.normalizePriceLabel(""), "");
  assert.equal(listing.normalizePriceLabel(null), "");
  assert.equal(listing.normalizePriceLabel("45"), "R$ 45");
  assert.equal(listing.normalizePriceLabel("28,50"), "R$ 28,50");
  assert.equal(listing.normalizePriceLabel("R$ 55"), "R$ 55");
  assert.equal(listing.normalizePriceLabel("r$ 30,00"), "R$ 30,00");
});

test("listing - normalizeLocationLabel limita tamanho e apara espaços", () => {
  assert.equal(listing.normalizeLocationLabel("   Vila Madalena, SP   "), "Vila Madalena, SP");
  assert.equal(listing.normalizeLocationLabel(""), "");
  assert.equal(listing.normalizeLocationLabel(null), "");
  const longText = "A".repeat(100);
  assert.equal(listing.normalizeLocationLabel(longText, 60).length, 60);
});

test("listing - formatListingStatus traduz status para português", () => {
  assert.equal(listing.formatListingStatus("available"), "Disponível");
  assert.equal(listing.formatListingStatus("sold"), "Vendido");
  assert.equal(listing.formatListingStatus("reserved"), "Reservado");
  assert.equal(listing.formatListingStatus(null), "Disponível");
});

test("listing - validateListingInput rejeita títulos vazios ou descrição ausente", () => {
  assert.equal(listing.validateListingInput({ title: "", body: "ok" }).valid, false);
  assert.equal(listing.validateListingInput({ title: "Título", body: "" }).valid, false);
  assert.equal(listing.validateListingInput({ title: "Título", body: "Descrição" }).valid, true);
});
