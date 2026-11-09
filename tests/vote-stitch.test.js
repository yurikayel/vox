import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../client/js/app/route-parse.js";
import { renderVoteDashboard, computeVoteStats, matchesVoteFilter } from "../client/js/render/vote.js";
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

describe("vote-stitch — Democracia Direta (pautas reais)", () => {
  it("parseRoute resolves #/vote and #/votacao", () => {
    withLocation({ hash: "#/vote" }, () => {
      assert.deepEqual(parseRoute(), { name: "vote" });
    });
    withLocation({ hash: "#/votacao" }, () => {
      assert.deepEqual(parseRoute(), { name: "vote" });
    });
  });

  it("renderVoteDashboard sem pautas mostra estado vazio honesto (sem números inventados)", () => {
    const html = renderVoteDashboard([]);
    assert.ok(html.includes("agora-vote-hero"));
    assert.ok(html.includes("Democracia Direta"));
    assert.ok(html.includes("Nenhuma pauta por aqui ainda"));
    assert.ok(html.includes("#/compose/proposal?c=vox"));
    for (const fake of ["82.4%", "ZK-BRL", "Tesouro", "ed25519", "13.071", "Fradique"]) {
      assert.ok(!html.includes(fake), `não deve conter dado fictício: ${fake}`);
    }
  });

  it("renderVoteDashboard renderiza apuração real e ações conforme elegibilidade", () => {
    const base = {
      communityId: "vox",
      communityTitle: "Vox",
      title: "Horário da feira",
      body: "Mudar para sábado.",
      closesAt: Date.now() + 3 * 3600 * 1000,
      minQuorum: 2,
    };
    const items = [
      { ...base, id: "p1", state: "open", isMember: true, isEligible: true, tally: { yes: 3, no: 1, abstain: 0, totalEligible: 4 } },
      { ...base, id: "p2", state: "open", isMember: false, isEligible: false, tally: { yes: 0, no: 0, abstain: 0, totalEligible: 0 } },
      { ...base, id: "p3", state: "merged", isMember: true, isEligible: true, tally: { yes: 5, no: 0, abstain: 0, totalEligible: 5 } },
    ];
    const html = renderVoteDashboard(items);
    assert.ok(html.includes("75% a favor (3)"));
    assert.ok(html.includes('data-vote-choice="yes" data-proposal-id="p1"'));
    assert.ok(html.includes("Entrar na comunidade para votar"));
    assert.ok(html.includes("Aprovada"));
    assert.ok(html.includes("Em votação (2)"));
    assert.ok(html.includes("Aprovadas (1)"));

    const onlyMerged = renderVoteDashboard(items, { filter: "merged" });
    assert.ok(onlyMerged.includes('data-proposal-id="p3"'));
    assert.ok(!onlyMerged.includes('data-proposal-id="p1"'));
  });

  it("computeVoteStats e matchesVoteFilter agregam só dados recebidos", () => {
    const stats = computeVoteStats([
      { state: "open", communityId: "a", tally: { totalEligible: 2 } },
      { state: "rejected", communityId: "b", tally: { totalEligible: 3 } },
    ]);
    assert.deepEqual(stats, { open: 1, merged: 0, votes: 5, communities: 2, total: 2 });
    assert.ok(matchesVoteFilter({ state: "expired" }, "closed"));
    assert.ok(!matchesVoteFilter({ state: "open" }, "closed"));
  });

  it("perfil próprio mostra catálogo real de selos (bloqueados sem recibos)", () => {
    const dummyMain = { innerHTML: "" };
    renderProfile(dummyMain, "vx_test_user_123", [], true, {
      displayName: "Maria Cidadã",
      handle: "maria_cidada",
      posts: [],
    });
    assert.ok(dummyMain.innerHTML.includes("profile-civic-highlights"));
    assert.ok(dummyMain.innerHTML.includes("Selos &amp; Insígnias Cívicas"));
    assert.ok(dummyMain.innerHTML.includes("Farol de Entrada"));
    assert.ok(dummyMain.innerHTML.includes("is-locked"));
    assert.ok(!dummyMain.innerHTML.includes("Guardiã Nvl 4"));
    assert.ok(dummyMain.innerHTML.includes("tab=voxels"));
  });

  it("perfil de terceiros não exibe selos que este aparelho não pode verificar", () => {
    const dummyMain = { innerHTML: "" };
    renderProfile(dummyMain, "vx_other_456", [], false, { displayName: "Outra Pessoa", posts: [] });
    assert.ok(!dummyMain.innerHTML.includes("profile-civic-highlights"));
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
