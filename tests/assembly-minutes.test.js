/**
 * PM-23 — Testes do validador e exportador de atas assinadas de assembleia.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderAssemblyMinutesMarkdown,
  runCli,
  tallyAssembly,
  validateAssemblyBundle,
} from "../scripts/assembly-minutes.mjs";

const SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/assembly-minutes.mjs");
const T0 = Date.UTC(2026, 10, 15, 14, 0, 0);

function makeBaseBundle(overrides = {}) {
  return {
    assemblyId: "asm-2026-11",
    communityId: "vila-esperanca",
    title: "Assembleia Ordinária de Novembro",
    convenedAt: T0,
    closedAt: T0 + 7_200_000,
    quorumMin: 2,
    agenda: [
      { id: "pauta-1", title: "Reforma da quadra", proposalId: "prop-quadra-01" },
    ],
    attendance: [
      { pubkey: "pk_ana", displayName: "Ana", signedAt: T0 + 1000, sig: "sig_att_ana" },
      { pubkey: "pk_bruno", displayName: "Bruno", signedAt: T0 + 2000, sig: "sig_att_bruno" },
    ],
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000, sig: "sig_v_ana" },
      { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "yes", signedAt: T0 + 6000, sig: "sig_v_bruno" },
    ],
    ...overrides,
  };
}

test("PM-23: apura quórum atingido (approved/rejected) e no_quorum quando abaixo do mínimo", () => {
  const approved = tallyAssembly(makeBaseBundle());
  assert.equal(approved.quorumMet, true);
  assert.equal(approved.attendanceCount, 2);
  assert.equal(approved.decisionStatus, "approved");
  assert.deepEqual(approved.agenda[0].counts, { yes: 2, no: 0, abstain: 0, block: 0, total: 2 });

  const tiedRejected = tallyAssembly(makeBaseBundle({
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000, sig: "s1" },
      { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "no", signedAt: T0 + 6000, sig: "s2" },
    ],
  }));
  assert.equal(tiedRejected.decisionStatus, "rejected");

  const noQuorum = tallyAssembly(makeBaseBundle({ quorumMin: 3 }));
  assert.equal(noQuorum.quorumMet, false);
  assert.equal(noQuorum.decisionStatus, "no_quorum");
  assert.equal(noQuorum.agenda[0].decisionStatus, "no_quorum");
});

test("PM-23: voto block com blockReason força status blocked e block sem blockReason é rejeitado", () => {
  const blocked = tallyAssembly(makeBaseBundle({
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000, sig: "s1" },
      { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "yes", signedAt: T0 + 6000, sig: "s2" },
      {
        agendaId: "pauta-1",
        voterPubkey: "pk_carla",
        choice: "block",
        blockReason: "Orçamento não detalha acessibilidade.",
        signedAt: T0 + 7000,
        sig: "s3",
      },
    ],
  }));
  assert.equal(blocked.decisionStatus, "blocked");
  assert.equal(blocked.agenda[0].decisionStatus, "blocked");
  assert.equal(blocked.blockReasons.length, 1);
  assert.equal(blocked.blockReasons[0].reason, "Orçamento não detalha acessibilidade.");

  assert.throws(() => validateAssemblyBundle(makeBaseBundle({
    votes: [{ agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "block", signedAt: T0 + 5000, sig: "s1" }],
  })), /blockReason é obrigatório/);

  assert.throws(() => validateAssemblyBundle(makeBaseBundle({
    votes: [{ agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "block", blockReason: "   ", signedAt: T0 + 5000, sig: "s1" }],
  })), /blockReason é obrigatório/);
});

test("PM-23: rejeita ausência de assinatura sig, datas invertidas e campos inválidos", () => {
  assert.throws(() => validateAssemblyBundle(makeBaseBundle({
    attendance: [{ pubkey: "pk_ana", signedAt: T0 + 1000, sig: "" }],
  })), /attendance\[0\]\.sig/);
  assert.throws(() => validateAssemblyBundle(makeBaseBundle({
    votes: [{ agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000 }],
  })), /votes\[0\]\.sig/);
  assert.throws(() => validateAssemblyBundle(makeBaseBundle({
    votes: [{ agendaId: "inexistente", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 5000, sig: "s1" }],
  })), /agendaId desconhecido/);
  assert.throws(() => validateAssemblyBundle(makeBaseBundle({ closedAt: T0 - 1 })), RangeError);
});

test("PM-23: deduplica presença por pubkey e votos por (agendaId, voterPubkey) mantendo o último signedAt", () => {
  const bundle = makeBaseBundle({
    attendance: [
      { pubkey: "pk_ana", displayName: "Ana", signedAt: T0 + 1000, sig: "sig_old" },
      { pubkey: "pk_ana", displayName: "Ana Atual", signedAt: T0 + 3000, sig: "sig_new" },
      { pubkey: "pk_bruno", displayName: "Bruno", signedAt: T0 + 2000, sig: "sig_bruno" },
    ],
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "block", blockReason: "Dúvida inicial", signedAt: T0 + 4000, sig: "sig_v1" },
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "yes", signedAt: T0 + 8000, sig: "sig_v2" },
      { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "yes", signedAt: T0 + 6000, sig: "sig_vb" },
    ],
  });
  const tally = tallyAssembly(bundle);
  assert.equal(tally.attendanceCount, 2);
  assert.equal(tally.duplicateAttendanceRemoved, 1);
  assert.equal(tally.duplicateVotesRemoved, 1);
  assert.equal(tally.decisionStatus, "approved");
  assert.deepEqual(tally.agenda[0].counts, { yes: 2, no: 0, abstain: 0, block: 0, total: 2 });
  assert.equal(tally.blockReasons.length, 0);
});

test("PM-23: minutesHash é determinístico frente a reordenação e muda se conteúdo mudar", () => {
  const b1 = makeBaseBundle();
  const b2 = makeBaseBundle({
    attendance: [...b1.attendance].reverse(),
    votes: [...b1.votes].reverse(),
  });
  const t1 = tallyAssembly(b1);
  const t2 = tallyAssembly(b2);
  assert.match(t1.minutesHash, /^[0-9a-f]{64}$/);
  assert.equal(t1.minutesHash, t2.minutesHash);

  const tChanged = tallyAssembly(makeBaseBundle({
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "no", signedAt: T0 + 5000, sig: "sig_v_ana" },
      { agendaId: "pauta-1", voterPubkey: "pk_bruno", choice: "yes", signedAt: T0 + 6000, sig: "sig_v_bruno" },
    ],
  }));
  assert.notEqual(t1.minutesHash, tChanged.minutesHash);
});

test("PM-23: renderAssemblyMinutesMarkdown inclui escopo de verificação, presença, pauta e minutesHash", () => {
  const tally = tallyAssembly(makeBaseBundle({
    votes: [
      { agendaId: "pauta-1", voterPubkey: "pk_ana", choice: "block", blockReason: "Falta ata anterior", signedAt: T0 + 5000, sig: "s1" },
    ],
  }));
  const md = renderAssemblyMinutesMarkdown(tally);
  assert.ok(md.includes("# Ata de Assembleia — Assembleia Ordinária de Novembro"));
  assert.ok(md.includes("`blocked`"));
  assert.ok(md.includes(tally.minutesHash));
  assert.ok(md.includes("structural_presence_only"));
  assert.ok(md.includes("verifyPayload"));
  assert.ok(md.includes("Falta ata anterior"));
  assert.ok(md.includes("Ana (`pk_ana`)"));
});

test("PM-23: CLI executa roundtrip em arquivos temporários (md e json) e falha em entrada ausente", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm23-"));
  const inputPath = path.join(tmpDir, "assembly.json");
  const outMdPath = path.join(tmpDir, "ata.md");
  const outJsonPath = path.join(tmpDir, "ata.json");
  try {
    fs.writeFileSync(inputPath, JSON.stringify(makeBaseBundle()), "utf8");
    execFileSync(process.execPath, [SCRIPT_PATH, "--input", inputPath, "--format", "md", "--out", outMdPath], { encoding: "utf8" });
    const md = fs.readFileSync(outMdPath, "utf8");
    assert.ok(md.includes("Quórum atingido"));
    assert.ok(md.includes("`approved`"));

    const res = runCli(["--input", inputPath, "--format", "json", "--out", outJsonPath]);
    const parsed = JSON.parse(fs.readFileSync(outJsonPath, "utf8"));
    assert.equal(parsed.minutesHash, res.tally.minutesHash);
    assert.equal(parsed.decisionStatus, "approved");
    assert.throws(() => runCli(["--input", path.join(tmpDir, "absent.json")]), /Não foi possível ler/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
