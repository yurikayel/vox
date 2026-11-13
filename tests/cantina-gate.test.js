import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANTINA_STORAGE_KEY,
  hasPassedCantinaGate,
  shouldShowCantinaGate,
} from "../client/js/app/cantina-gate.js";

describe("cantina-gate policy", () => {
  it("telas de escrita pedem a entrada até a pessoa entrar", () => {
    localStorage.clear();
    assert.equal(shouldShowCantinaGate("compose-community"), true);
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    assert.equal(shouldShowCantinaGate("compose-community"), false);
  });

  it("ajuda-teste reachable without pass", () => {
    localStorage.clear();
    assert.equal(shouldShowCantinaGate("ajuda-teste"), false);
    assert.equal(shouldShowCantinaGate("dm-thread"), true);
  });

  it("hasPassedCantinaGate reads storage", () => {
    localStorage.clear();
    assert.equal(hasPassedCantinaGate(), false);
    localStorage.setItem(CANTINA_STORAGE_KEY, "true");
    assert.equal(hasPassedCantinaGate(), true);
  });
});

describe("PM-54 ler antes de entrar", () => {
  it("home, pessoas, convite e conteúdo abrem para leitura; telas de escrita pedem a entrada", () => {
    localStorage.clear();
    for (const r of ["home", "people", "connect", "sync", "topic", "community", "profile", "handle-lookup", "tag-feed", "proposal"]) {
      assert.equal(shouldShowCantinaGate(r), false, r);
    }
    for (const r of ["compose-community", "dm-thread", "wallet", "vote"]) {
      assert.equal(shouldShowCantinaGate(r), true, r);
    }
  });
});
