import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModLogEntry,
  summarizeModerationDecisions,
  formatModerationLogMarkdown,
  buildLocalModerationTransparencyExport,
} from "../client/js/moderation-log.js";
import { renderModerationSettingsSection } from "../client/js/render/network-sections.js";

test("PM-31 - normalizeModLogEntry extrai campos públicos e descarta dados privados de denúncia", () => {
  const raw = {
    id: "act_1",
    action: "hide",
    target: "post_99",
    communityId: "praca-central",
    owner: "vx_moderador123456789",
    reason: "spam",
    ts: 1700000100000,
    reporter: "vx_denunciante_secreto",
    detail: "Mensagem privada da DM que nunca deve sair",
    signature: "sig_privada",
  };

  const entry = normalizeModLogEntry(raw);
  assert.deepEqual(entry, {
    id: "act_1",
    action: "hide",
    targetId: "post_99",
    communityId: "praca-central",
    moderator: "vx_modera",
    reason: "spam",
    ts: 1700000100000,
  });
  assert.equal("reporter" in entry, false);
  assert.equal("detail" in entry, false);
  assert.equal("signature" in entry, false);
});

test("PM-31 - normalizeModLogEntry rejeita entradas inválidas ou incompletas", () => {
  assert.equal(normalizeModLogEntry(null), null);
  assert.equal(normalizeModLogEntry("invalido"), null);
  assert.equal(normalizeModLogEntry({ action: "hide" }), null);
  assert.equal(normalizeModLogEntry({ target: "post_1" }), null);
});

test("PM-31 - summarizeModerationDecisions filtra, deduplica por id, ordena por ts decrescente e agrega", () => {
  const actions = [
    { id: "a1", action: "hide", target: "p1", communityId: "c1", owner: "vx_mod111111", reason: "spam", ts: 1000 },
    { id: "a1", action: "hide", target: "p1", communityId: "c1", owner: "vx_mod111111", reason: "spam", ts: 1000 },
    { id: "a2", action: "ban", target: "vx_troll", communityId: "c1", owner: "vx_mod222222", reason: "assedio", ts: 3000 },
    { id: "a3", action: "review-hide", target: "p2", communityId: "c1", owner: "vx_mod111111", reason: "odio", ts: 2000 },
    { id: "a4", action: "pin", target: "p3", communityId: "c2", owner: "vx_mod333333", ts: 2500 },
  ];

  const c1Summary = summarizeModerationDecisions(actions, {
    communityId: "c1",
    sinceTs: 1000,
    untilTs: 3000,
  });

  assert.equal(c1Summary.total, 3);
  assert.deepEqual(
    c1Summary.entries.map((e) => e.id),
    ["a2", "a3", "a1"],
  );
  assert.deepEqual(c1Summary.byAction, { ban: 1, "review-hide": 1, hide: 1 });
  assert.deepEqual(c1Summary.byCommunity, { c1: 3 });

  const windowed = summarizeModerationDecisions(actions, { sinceTs: 1500, untilTs: 2600 });
  assert.deepEqual(
    windowed.entries.map((e) => e.id),
    ["a4", "a3"],
  );
});

test("PM-31 - formatModerationLogMarkdown gera tabela agregada e trilha datada sem vazar dados privados", () => {
  const summary = summarizeModerationDecisions([
    {
      id: "act_10",
      action: "review-hide",
      target: "post_abc",
      communityId: "vila-esperanca",
      owner: "vx_mod987654321",
      reason: "spam",
      ts: Date.UTC(2026, 4, 10, 12, 0, 0),
      reporter: "vx_anonimo_999",
      detail: "Denúncia confidencial via DM",
    },
  ]);

  const md = formatModerationLogMarkdown(summary, { generatedAt: "2026-05-10T15:00:00.000Z" });
  assert.ok(md.includes("# Relatório de Transparência de Moderação — Vox"));
  assert.ok(md.includes("2026-05-10T15:00:00.000Z"));
  assert.ok(md.includes("| review-hide | 1 |"));
  assert.ok(md.includes("| 2026-05-10T12:00:00.000Z | vila-esperanca | review-hide | post_abc | spam (Spam, golpe ou fraude) | vx_mod987 |"));
  assert.equal(md.includes("vx_anonimo_999"), false);
  assert.equal(md.includes("Denúncia confidencial"), false);
});

test("PM-31 - buildLocalModerationTransparencyExport inclui apenas contagens agregadas de listas pessoais", () => {
  const exported = buildLocalModerationTransparencyExport({
    localActions: [
      { id: "m1", action: "hide", target: "p_1", communityId: "c1", owner: "vx_mod1234567", reason: "outro", ts: 5000 },
    ],
    blockedUsers: [
      { routeId: "vx_priv_blocked_1", reason: "motivo pessoal privado" },
      { routeId: "vx_priv_blocked_2", reason: "outro motivo pessoal" },
    ],
    mutedUsers: [{ routeId: "vx_priv_muted_1" }],
    now: Date.UTC(2026, 5, 1, 0, 0, 0),
  });

  assert.equal(exported.total, 1);
  assert.equal(exported.blockedCount, 2);
  assert.equal(exported.mutedCount, 1);
  assert.equal(exported.generatedAt, "2026-06-01T00:00:00.000Z");

  const serialized = JSON.stringify(exported);
  assert.equal(serialized.includes("vx_priv_blocked_1"), false);
  assert.equal(serialized.includes("motivo pessoal privado"), false);
  assert.equal(serialized.includes("vx_priv_muted_1"), false);

  const md = formatModerationLogMarkdown(exported);
  assert.ok(md.includes("2 bloqueado(s), 1 silenciado(s)"));
  assert.equal(md.includes("vx_priv_blocked_1"), false);
});

test("PM-31 - renderModerationSettingsSection expõe botão #btn-export-mod-log", () => {
  const html = renderModerationSettingsSection([], []);
  assert.ok(html.includes('id="btn-export-mod-log"'));
  assert.ok(html.includes("Relatório de Transparência (.md)"));
});
