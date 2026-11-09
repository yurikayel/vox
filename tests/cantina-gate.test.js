import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANTINA_STORAGE_KEY,
  hasPassedCantinaGate,
  shouldShowCantinaGate,
  hrefTargetsAjudaTeste,
  hashFromAjudaTesteHref,
} from "../client/js/app/cantina-gate.js";

describe("cantina-gate policy", () => {
  it("home requires gate until pass", () => {
    localStorage.clear();
    assert.equal(shouldShowCantinaGate("home"), true);
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    assert.equal(shouldShowCantinaGate("home"), false);
  });

  it("ajuda-teste reachable without pass", () => {
    localStorage.clear();
    assert.equal(shouldShowCantinaGate("ajuda-teste"), false);
    assert.equal(shouldShowCantinaGate("home"), true);
  });

  it("hasPassedCantinaGate reads storage", () => {
    localStorage.clear();
    assert.equal(hasPassedCantinaGate(), false);
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    assert.equal(hasPassedCantinaGate(), true);
  });
});

describe("cantina-gate ajuda/teste hrefs", () => {
  it("recognizes in-app hash links", () => {
    assert.equal(hrefTargetsAjudaTeste("#/ajuda/teste"), true);
    assert.equal(hrefTargetsAjudaTeste("#/ajuda/teste?x=1"), true);
    assert.equal(hrefTargetsAjudaTeste("./#/ajuda/teste"), true);
    assert.equal(hrefTargetsAjudaTeste("#/status"), false);
    assert.equal(hrefTargetsAjudaTeste("#/"), false);
  });

  it("normalizes hash navigation", () => {
    assert.equal(hashFromAjudaTesteHref("#/ajuda/teste"), "#/ajuda/teste");
    assert.equal(hashFromAjudaTesteHref("#ajuda/teste"), "#/ajuda/teste");
    assert.equal(hashFromAjudaTesteHref("./#/ajuda/teste"), "#/ajuda/teste");
  });
});

describe("PM-54 ler antes de entrar", () => {
  it("link direto para conteúdo não abre o portão; home e telas de escrita continuam com portão", () => {
    localStorage.clear();
    for (const r of ["topic", "community", "profile", "handle-lookup", "tag-feed", "proposal"]) {
      assert.equal(shouldShowCantinaGate(r), false, r);
    }
    for (const r of ["home", "compose-topic", "dm-thread", "wallet", "vote"]) {
      assert.equal(shouldShowCantinaGate(r), true, r);
    }
  });
});
