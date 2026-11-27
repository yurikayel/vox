/**
 * @file Catraca `audit:internal` (docs/process/interno-e-publico.md): ocorrência nova reprova, a contagem só pode descer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import("../scripts/internal-audit.mjs").catch(() => ({}));

/** Falha por assert (não por exceção) quando o módulo ou a função não existe. */
function need(name) {
  assert.equal(typeof mod[name], "function", `scripts/internal-audit.mjs deve exportar ${name}()`);
  return mod[name];
}

/** Palavras montadas em pedaços para este arquivo não ser ele mesmo uma ocorrência. */
const WORDS = { orq: ["lo", "bby.md"].join(""), trailer: ["Co-Authored", "-By: alguem <a@example.org>"].join("") };

/** Pasta temporária com os arquivos dados (caminho relativo → texto). */
function plant(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-internal-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const EMPTY = { patterns: {}, files: {} };

test("plantar um padrão num arquivo novo reprova", () => {
  const rules = need("loadRules")();
  const dir = plant({ "docs/nova.md": `Ver o ${WORDS.orq} do time.\n` });
  const cur = need("scanFiles")(dir, ["docs/nova.md"], rules);
  const bad = need("compareBaseline")(cur, EMPTY);
  assert.ok(bad.length > 0, "arquivo novo com ocorrência deve reprovar");
  assert.match(bad.join("\n"), /docs\/nova\.md/);
});

test("arquivo limpo novo passa", () => {
  const rules = need("loadRules")();
  const dir = plant({ "docs/limpa.md": "Texto neutro sobre o produto.\n" });
  const cur = need("scanFiles")(dir, ["docs/limpa.md"], rules);
  assert.deepEqual(need("compareBaseline")(cur, EMPTY), []);
});

test("contagem acima do baseline reprova e igual ou abaixo passa", () => {
  const rules = need("loadRules")();
  const dir = plant({ "docs/a.md": `${WORDS.orq}\n${WORDS.orq}\n` });
  const cur = need("scanFiles")(dir, ["docs/a.md"], rules);
  const at = { patterns: { orch: 2 }, files: { "docs/a.md": { orch: 2 } } };
  const below = { patterns: { orch: 1 }, files: { "docs/a.md": { orch: 1 } } };
  assert.deepEqual(need("compareBaseline")(cur, at), []);
  assert.ok(need("compareBaseline")(cur, below).length > 0);
});

test("padrão por caminho: arquivo de relatório de agente reprova", () => {
  const rules = need("loadRules")();
  const dir = plant({ "docs/agent-reports/x.md": "neutro\n" });
  const cur = need("scanFiles")(dir, ["docs/agent-reports/x.md"], rules);
  assert.ok(need("compareBaseline")(cur, EMPTY).length > 0);
});

test("arquivos de regra dos agentes contam à parte e não reprovam", () => {
  const rules = need("loadRules")();
  const dir = plant({ "AGENTS.md": `${WORDS.orq}\n` });
  const cur = need("scanFiles")(dir, ["AGENTS.md"], rules);
  assert.ok(cur.agentRules > 0);
  assert.deepEqual(need("compareBaseline")(cur, EMPTY), []);
});

test("trailer de coautoria em mensagem é ERROR; texto neutro passa", () => {
  const rules = need("loadRules")();
  const bad = need("scanMessage")("commit:abc", `feat: algo\n\n${WORDS.trailer}\n`, rules);
  assert.ok(bad.some((h) => h.id === "trailer" && h.error), "trailer deve ser erro");
  assert.deepEqual(need("scanMessage")("commit:def", "feat: algo neutro\n", rules), []);
});

/** Repositório temporário com um commit por data de autoria dada, todos com o trailer. */
function repoWithCommits(dates) {
  const dir = plant({ "a.txt": "x\n" });
  const run = (args, env = {}) => execFileSync("git", args, { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
  run(["init", "-q"]);
  run(["add", "."]);
  dates.forEach((date, i) => {
    run(["-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "--allow-empty", "-m", `c${i}\n\n${WORDS.trailer}`], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  });
  return dir;
}

test("o corte é pela data de autoria: commit antigo é histórico, novo reprova", () => {
  const dir = repoWithCommits(["2026-11-20T10:00:00Z", "2026-11-28T10:00:00Z"]);
  const root = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: dir }).toString().trim();
  const found = need("newCommitMessages")(dir, root, "2026-11-27T12:00:00Z");
  assert.equal(found.length, 1);
  assert.match(found[0][1], /^c1/);
});

test("toda exceção tem motivo e dono", () => {
  const { allow } = need("loadRules")();
  const all = [...allow.selfExempt, ...allow.pathExceptions, ...allow.lineExceptions];
  assert.ok(all.length > 0);
  for (const ex of all) assert.ok(ex.reason && ex.owner, `exceção sem motivo/dono: ${JSON.stringify(ex)}`);
});

test("a árvore atual não passa do baseline versionado", () => {
  const rules = need("loadRules")();
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/metrics/internal-audit-baseline.json"), "utf8"));
  const cur = need("scanTree")(ROOT, rules);
  assert.deepEqual(need("compareBaseline")(cur, baseline), []);
});
