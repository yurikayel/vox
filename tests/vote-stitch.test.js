import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../client/js/app/route-parse.js";
import { renderVoteDashboard } from "../client/js/render/vote.js";
import { renderProfile } from "../client/js/render/profile.js";
import { renderShell } from "../client/js/render/shell.js";

function withLocation({ hash = "", search = "" }, fn) {
  const loc = { hash, search };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("vote-stitch — Democracia Direta e Deliberação Vicinal", () => {
  it("parseRoute resolves #/vote and #/votacao", () => {
    withLocation({ hash: "#/vote" }, () => {
      assert.deepEqual(parseRoute(), { name: "vote" });
    });
    withLocation({ hash: "#/votacao" }, () => {
      assert.deepEqual(parseRoute(), { name: "vote" });
    });
  });

  it("renderVoteDashboard renders Stitch constitutional header and metrics", () => {
    const html = renderVoteDashboard();
    assert.ok(html.includes("vote-banner"));
    assert.ok(html.includes("Democracia Direta &amp; Deliberação Vicinal"));
    assert.ok(html.includes("Quórum da Sessão"));
    assert.ok(html.includes("82.4%"));
    assert.ok(html.includes("70% min"));
    assert.ok(html.includes("Tesouro em Pauta"));
    assert.ok(html.includes("vote-filters-bar"));
    assert.ok(html.includes("vote-proposal-item"));
    assert.ok(html.includes("btn-vote-choice btn-vote-yes"));
    assert.ok(html.includes("btn-vote-endorse"));
  });

  it("profile grid header embeds civic highlights carousel", () => {
    const dummyMain = { innerHTML: "" };
    renderProfile(dummyMain, "vx_test_user_123", [], true, "", {
      displayName: "Maria Cidadã",
      handle: "maria_cidada",
      posts: [],
    });
    assert.ok(dummyMain.innerHTML.includes("profile-civic-highlights"));
    assert.ok(dummyMain.innerHTML.includes("Selos &amp; Insígnias Cívicas"));
    assert.ok(dummyMain.innerHTML.includes("Guardiã Nvl 4"));
    assert.ok(dummyMain.innerHTML.includes("Microrrede Solar"));
    assert.ok(dummyMain.innerHTML.includes("tab=voxels"));
  });

  it("shell navigation includes Vote destination", () => {
    const prevDoc = globalThis.document;
    const dummyRoot = { innerHTML: "" };
    globalThis.document = {
      getElementById: (id) => (id === "app-root" ? dummyRoot : null),
      documentElement: { setAttribute: () => {} },
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    try {
      renderShell({ activeTab: "vote" });
      assert.ok(dummyRoot.innerHTML.includes('href="#/vote"'));
      assert.ok(dummyRoot.innerHTML.includes("tab-item active"));
    } finally {
      globalThis.document = prevDoc;
    }
  });
});
