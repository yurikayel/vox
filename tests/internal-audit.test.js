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
function repoWithCommits(commits) {
  const dir = plant({ "a.txt": "x\n" });
  const run = (args, env = {}) => execFileSync("git", args, { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
  run(["init", "-q"]);
  run(["add", "."]);
  commits.forEach(({ msg, author, committer }) => {
    run(["-c", "user.name=t", "-c", "user.email=t@example.org", "commit", "-q", "--allow-empty", "-m", msg], { GIT_AUTHOR_DATE: author, GIT_COMMITTER_DATE: committer });
  });
  return dir;
}

test("o corte do .patterns.json: 27/11 23:59Z é histórico e 28/11 00:01Z reprova (data de autoria, não de commit)", () => {
  const withTrailer = (name) => `${name}\n\n${WORDS.trailer}`;
  const dir = repoWithCommits([
    { msg: "base", author: "2026-11-01T10:00:00Z", committer: "2026-11-01T10:00:00Z" },
    { msg: withTrailer("antes"), author: "2026-11-27T23:59:00Z", committer: "2026-11-28T00:01:00Z" },
    { msg: withTrailer("depois"), author: "2026-11-28T00:01:00Z", committer: "2026-11-27T23:59:00Z" },
  ]);
  const base = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], { cwd: dir }).toString().trim();
  const rules = need("loadRules")();
  const found = need("newCommitMessages")(dir, base, rules.since);
  assert.deepEqual(found.map(([, msg]) => msg.split("\n")[0]), ["depois"], "só o commit de autoria depois do corte entra");
  const errors = (msg) => need("scanMessage")("commit:x", msg, rules).filter((h) => h.error);
  assert.ok(errors(found[0][1]).length > 0, "o trailer depois do corte reprova");
});

test("corte ausente ou inválido falha alto, não deixa de escanear", () => {
  const dir = plant({ "scripts/internal-audit.patterns.json": JSON.stringify({ commitsSince: "nao-e-data", patterns: [] }), "scripts/internal-audit.allow.json": "{}" });
  assert.throws(() => need("loadRules")(dir), /commitsSince/);
});

test("padrões não pegam o cursor de sync, o codec de áudio nem a classe de estilo; pegam o uso como ferramenta", () => {
  const rules = need("loadRules")();
  const dir = plant({
    "docs/ok.md": ["O cur", "sor de sincronização avança.\nÁudio em Op", "us 32 kbps.\nClasse .agora-co", "dex na tela."].join(""),
    "docs/ruim.md": ["Abrir no Cur", "sor IDE.\nUse Op", "us High aqui.\nVeja o co", "dex da ferramenta."].join(""),
  });
  const ok = need("scanFiles")(dir, ["docs/ok.md"], rules);
  const ruim = need("scanFiles")(dir, ["docs/ruim.md"], rules);
  assert.deepEqual(ok.patterns, {}, "texto legítimo não é ocorrência");
  assert.deepEqual(Object.keys(ruim.patterns).sort(), ["tool-ai", "tool-ide", "tool-ide-nome", "tool-model"]);
});

test("nome próprio da IDE (maiúscula) casa em .md e comentário; cursor de CSS e de sync não casam", () => {
  const rules = need("loadRules")();
  const name = ["Cur", "sor"].join("");
  const dir = plant({
    "docs/dono.md": `| Owner: ${name} | P1 |\n`,
    "client/js/a.js": `// feito no ${name}\nconst x = 1;\n`,
    "client/css/a.css": `/* ${name} */\n.a { cursor: pointer; }\n`,
    "client/js/b.js": "const next = page.cursor; // cursor de sincronização\n",
    "docs/sync.md": "O cursor de sync avança; cursor: pointer no botão.\n",
  });
  const tally = (rel) => need("scanFiles")(dir, [rel], rules).patterns["tool-ide-nome"] ?? 0;
  assert.equal(tally("docs/dono.md"), 1, "Owner: nome próprio em .md casa");
  assert.equal(tally("client/js/a.js"), 1, "nome próprio em comentário casa");
  assert.equal(tally("client/css/a.css"), 0, "CSS fica de fora");
  assert.equal(tally("client/js/b.js"), 0, "cursor minúsculo de sync não casa");
  assert.equal(tally("docs/sync.md"), 0, "cursor minúsculo e cursor: pointer não casam");
});

test("arquivo renomeado com a mesma contagem herda a entrada do baseline e não é novo", () => {
  const cur = { patterns: { orch: 2 }, files: { "e2e/novo.py": { orch: 2 } } };
  const base = { patterns: { orch: 2 }, files: { "e2e/velho.py": { orch: 2 } } };
  assert.ok(need("compareBaseline")(cur, base).length > 0, "sem a renomeação, é arquivo novo");
  assert.deepEqual(need("compareBaseline")(cur, base, { "e2e/novo.py": "e2e/velho.py" }), []);
});

test("arquivo renomeado com contagem maior que a do antigo reprova", () => {
  const cur = { patterns: { orch: 3 }, files: { "e2e/novo.py": { orch: 3 } } };
  const base = { patterns: { orch: 3 }, files: { "e2e/velho.py": { orch: 2 } } };
  const bad = need("compareBaseline")(cur, base, { "e2e/novo.py": "e2e/velho.py" });
  assert.match(bad.join("\n"), /e2e\/novo\.py: orch subiu de 2 para 3/);
});

test("findRenames acha as renomeações feitas depois do último commit do baseline", () => {
  const dir = plant({ "scripts/velho.txt": "uma linha bem longa para o git reconhecer a renomeação\noutra linha\n", "base.json": "{}\n" });
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.org", ...args], { cwd: dir, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "baseline");
  git("mv", "scripts/velho.txt", "scripts/novo.txt");
  git("commit", "-q", "-m", "renomeia");
  assert.deepEqual(need("findRenames")(dir, "base.json"), { "scripts/novo.txt": "scripts/velho.txt" });
});

test("writeBaseline regrava com a chave nova quando o arquivo foi renomeado, sem subir", () => {
  const dir = plant({});
  const file = path.join(dir, "baseline.json");
  fs.writeFileSync(file, JSON.stringify({ patterns: { orch: 2 }, files: { "velho.py": { orch: 2 } } }));
  const cur = { files: { "novo.py": { orch: 2 } }, patterns: { orch: 2 }, agentRules: 0 };
  assert.equal(need("writeBaseline")(cur, file, { "novo.py": "velho.py" }), 0);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, "utf8")).files), ["novo.py"]);
});

/** Cópia das regras sem a exceção `entry` do grupo `group`. */
function without(rules, group, entry) {
  return { ...rules, allow: { ...rules.allow, [group]: rules.allow[group].filter((e) => e !== entry) } };
}

test("exceção morta reprova: toda entrada casa um arquivo versionado e muda o resultado", () => {
  const rules = need("loadRules")();
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT }).toString().split("\0").filter(Boolean);
  const effect = (rel, r) => need("scanFiles")(ROOT, [rel], r);
  for (const group of ["selfExempt", "pathExceptions"]) {
    for (const entry of rules.allow[group]) {
      assert.ok(tracked.includes(entry.path), `${group}: ${entry.path} não existe no repositório`);
      const on = effect(entry.path, rules);
      const off = effect(entry.path, without(rules, group, entry));
      assert.ok(off.hits.length > on.hits.length, `${group}: ${entry.path} não isenta nada (entrada morta)`);
    }
  }
  for (const entry of rules.allow.lineExceptions) {
    const files = (entry.paths ?? tracked).filter((p) => tracked.includes(p));
    const diff = files.some((p) => effect(p, without(rules, "lineExceptions", entry)).hits.length !== effect(p, rules).hits.length);
    assert.ok(diff, `lineExceptions: ${entry.reason} não muda nada (entrada morta)`);
  }
  for (const prefix of rules.allow.agentRules) {
    const files = tracked.filter((p) => p === prefix || (prefix.endsWith("/") && p.startsWith(prefix)));
    assert.ok(files.length > 0, `agentRules: ${prefix} não casa nenhum arquivo versionado`);
  }
});

test("baseline ausente é gravado; existente que subiria é recusado", () => {
  const write = need("writeBaseline");
  const dir = plant({});
  const file = path.join(dir, "baseline.json");
  const two = { files: { "a.md": { orch: 2 } }, patterns: { orch: 2 }, agentRules: 0 };
  assert.equal(write(two, file), 0, "ausente grava");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).patterns, { orch: 2 });
  const three = { files: { "a.md": { orch: 3 } }, patterns: { orch: 3 }, agentRules: 0 };
  assert.equal(write(three, file), 1, "subir é recusado");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).patterns, { orch: 2 }, "o arquivo não muda");
  const one = { files: { "a.md": { orch: 1 } }, patterns: { orch: 1 }, agentRules: 0 };
  assert.equal(write(one, file), 0, "descer grava");
  assert.deepEqual(fs.readdirSync(dir), ["baseline.json"], "sem sobra de arquivo temporário");
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
