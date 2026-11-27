/**
 * PM-117 — inventário dos E2E: gatilhos de workflow, padrão do `unittest discover`, montagem do inventário e a tabela de
 * `docs/TESTES.md` (§4.1), que tem de bater com o que os workflows realmente chamam.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInventory, formatRows, parseDiscover, runCli, runCommands, workflowTriggers } from "../scripts/e2e-inventory.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PR = "name: x\non:\n  push:\n    branches: [ main ]\n  pull_request:\n    branches: [ main ]\njobs:\n  a:\n    steps: []\n";
const CRON = "name: y\n\non:\n  schedule:\n    - cron: \"0 6 * * *\"\n  workflow_dispatch:\n\njobs: {}\n";

test("workflowTriggers: pull_request vira PR, schedule vira nightly, push e manual não contam", () => {
  assert.deepEqual(workflowTriggers(PR), ["pr"]);
  assert.deepEqual(workflowTriggers(CRON), ["nightly"]);
  assert.deepEqual(workflowTriggers("on:\n  pull_request:\n  schedule:\n    - cron: x\n"), ["pr", "nightly"]);
  assert.deepEqual(workflowTriggers("on:\n  push:\n  workflow_dispatch:\n"), []);
});

test("workflowTriggers: `on:` na mesma linha, em lista inline ou com a chave entre aspas também são lidos", () => {
  assert.deepEqual(workflowTriggers("on: pull_request\njobs: {}\n"), ["pr"]);
  assert.deepEqual(workflowTriggers("on: pull_request"), ["pr"], "sem quebra de linha no fim");
  assert.deepEqual(workflowTriggers("on: [push, pull_request]  # comentário\n"), ["pr"]);
  assert.deepEqual(workflowTriggers("on: [ \"schedule\", 'push' ]\n"), ["nightly"]);
  assert.deepEqual(workflowTriggers("\"on\":\n  schedule:\n    - cron: x\n"), ["nightly"]);
  assert.deepEqual(workflowTriggers("'on': pull_request\n"), ["pr"]);
  assert.deepEqual(workflowTriggers("on:\n  - push\n  - pull_request\n"), ["pr"], "lista em bloco");
  assert.deepEqual(workflowTriggers("on: pull_request_target\n"), []);
  assert.deepEqual(workflowTriggers("on:\n      # comentário mais recuado que os eventos\n  pull_request:\n"), ["pr"]);
});

test("workflowTriggers: sem `on:` ou em forma que não se lê reprova alto, nunca devolve vazio em silêncio", () => {
  assert.throws(() => workflowTriggers("name: z\njobs: {}\n"), /sem chave `on:`/);
  assert.throws(() => workflowTriggers("on: { pull_request: { branches: [main] } }\n"), /forma de mapa/);
});

test("workflowTriggers: o bloco `on:` tem limite, `pull_request_target` não é PR e o nome tem de ser exato", () => {
  const after = "on:\n  push:\njobs:\n  pull_request:\n    runs-on: x\n  schedule:\n    runs-on: x\n";
  assert.deepEqual(workflowTriggers(after), [], "chaves de jobs: depois do bloco não contam");
  assert.deepEqual(workflowTriggers("on:\n  pull_request_target:\n    types: [opened]\n"), []);
  assert.deepEqual(workflowTriggers("on:\n  pull_request-lint:\n  scheduled:\n"), []);
  assert.deepEqual(workflowTriggers("on:\n  push:\n    pull_request:\n    schedule:\n"), [], "só o nível dos eventos conta");
});

test("workflowTriggers: a chave `on:` é a do início da linha, não um texto que termina em `on:`", () => {
  assert.deepEqual(workflowTriggers("name: lig-on:\n  pull_request:\non:\n  schedule:\n    - cron: x\n"), ["nightly"]);
});

test("workflowTriggers: BOM no início e palavra parecida fora do bloco `on:` não enganam", () => {
  assert.deepEqual(workflowTriggers(`\uFEFF${CRON}`), ["nightly"]);
  assert.deepEqual(workflowTriggers("\uFEFFon:\n  schedule:\n    - cron: x\n"), ["nightly"], "BOM antes do primeiro `on:`");
  assert.deepEqual(workflowTriggers("on:\n  push:\njobs:\n  a:\n    if: github.event_name == 'pull_request'\n    # schedule\n"), []);
});

test("parseDiscover: lê a pasta e o padrão do unittest discover, com ou sem aspas", () => {
  const found = parseDiscover('python -m unittest discover -s e2e -p "test_*.py" -v');
  assert.equal(found.dir, "e2e");
  assert.ok(found.pattern.test("test_vox_e2e.py"));
  assert.equal(found.pattern.test("capture_dungeon_ui.py"), false);
  assert.equal(found.pattern.test("xtest_a.py"), false, "o padrão é ancorado");
  assert.equal(found.pattern.test("test_a.pyc"), false);
  assert.ok(parseDiscover("python -m unittest discover -s e2e -p test_*.py").pattern.test("test_b.py"));
  assert.equal(parseDiscover("node x.mjs"), null);
  assert.equal(parseDiscover(undefined), null);
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-inv-"));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put("package.json", JSON.stringify({ scripts: { "test:e2e": 'python -m unittest discover -s e2e -p "test_*.py" -v' } }));
  for (const f of ["e2e/test_a.py", "e2e/helper.py", "e2e/notes.txt", "scripts/smoke-e2e.mjs", "scripts/lone-e2e.mjs", "scripts/other.mjs"]) put(f, "");
  put(".github/workflows/ci.yml", `${PR}      - run: node scripts/smoke-e2e.mjs\n`);
  put(".github/workflows/night.yml", `${CRON}      - run: npm run test:e2e\n`);
  return root;
}

test("buildInventory: Python por padrão do discover na agenda, node pelo workflow que o cita, o resto manual", () => {
  const root = fixture();
  try {
    const byPath = Object.fromEntries(buildInventory(root).map((i) => [i.path, i]));
    assert.deepEqual(Object.keys(byPath).sort(), ["e2e/helper.py", "e2e/test_a.py", "scripts/lone-e2e.mjs", "scripts/smoke-e2e.mjs"]);
    assert.equal(byPath["e2e/test_a.py"].where, "nightly");
    assert.deepEqual(byPath["e2e/test_a.py"].runs, [{ workflow: "night.yml", trigger: "nightly" }]);
    assert.equal(byPath["e2e/test_a.py"].kind, "python");
    assert.equal(byPath["e2e/helper.py"].where, "manual", "fora do padrão test_*.py");
    assert.equal(byPath["scripts/smoke-e2e.mjs"].where, "pr");
    assert.equal(byPath["scripts/smoke-e2e.mjs"].kind, "node");
    assert.equal(byPath["scripts/lone-e2e.mjs"].where, "manual");
    assert.deepEqual(byPath["scripts/lone-e2e.mjs"].runs, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildInventory: quem roda em PR e na agenda conta como PR, e sem pasta e2e ou workflows a lista vem vazia", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, ".github/workflows/ci.yml"), `${PR}      - run: npm run test:e2e\n`);
    const both = buildInventory(root).find((i) => i.path === "e2e/test_a.py");
    assert.equal(both.where, "pr");
    assert.equal(both.runs.length, 2);
    fs.rmSync(path.join(root, ".github"), { recursive: true });
    fs.rmSync(path.join(root, "e2e"), { recursive: true });
    fs.rmSync(path.join(root, "scripts"), { recursive: true });
    assert.deepEqual(buildInventory(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildInventory: workflow sem gatilho de PR/agenda vira `outro` (manual), e discover em outra pasta não cobre e2e/", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, ".github/workflows/night.yml"), "on:\n  workflow_dispatch:\njobs: {}\n      - run: npm run test:e2e\n");
    const first = buildInventory(root).find((i) => i.path === "e2e/test_a.py");
    assert.deepEqual(first.runs, [{ workflow: "night.yml", trigger: "outro" }]);
    assert.equal(first.where, "manual");
    fs.writeFileSync(path.join(root, ".github/workflows/night.yml"), `${CRON}      - run: npm run test:e2e\n`);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { "test:e2e": "python -m unittest discover -s outra -p test_*.py" } }));
    assert.deepEqual(buildInventory(root).find((i) => i.path === "e2e/test_a.py").runs, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildInventory: só .yml/.yaml valem; test:e2e-x, test:e2e:fast e o texto solto não são `npm run test:e2e`", () => {
  const root = fixture();
  const wf = (name, text) => fs.writeFileSync(path.join(root, ".github/workflows", name), text);
  try {
    wf("night.yml", `${CRON}      - run: npm run test:e2e-x\n      - run: npm run test:e2e:fast\n      - run: echo test:e2e\n`);
    wf("notas.txt", `${PR}      - run: npm run test:e2e\n`);
    wf("ci.yml", `${PR}      - run: node tools/smoke-e2e.mjs\n`);
    const byPath = Object.fromEntries(buildInventory(root).map((i) => [i.path, i]));
    assert.equal(byPath["e2e/test_a.py"].where, "manual", "nenhuma das três formas, nem o .txt, chama o test:e2e");
    assert.equal(byPath["scripts/smoke-e2e.mjs"].where, "manual", "o nome sem o caminho do script não vale");
    wf("night.yaml", `${CRON}      - run: npm run test:e2e -- -v\n`);
    assert.equal(buildInventory(root).find((i) => i.path === "e2e/test_a.py").where, "nightly", ".yaml vale e o final da linha também");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("buildInventory: workflow com `on:` que não se lê derruba o inventário em vez de virar manual", () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, ".github/workflows/estranho.yml"), "name: x\njobs: {}\n");
    assert.throws(() => buildInventory(root), /sem chave `on:`/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("formatRows: uma linha por E2E com o rótulo e os workflows", () => {
  const rows = formatRows([
    { path: "a.py", runs: [{ workflow: "n.yml", trigger: "nightly" }], where: "nightly" },
    { path: "b.mjs", runs: [{ workflow: "c.yml", trigger: "pr" }, { workflow: "c.yml", trigger: "pr" }], where: "pr" },
    { path: "c.py", runs: [], where: "manual" },
  ]);
  assert.equal(rows, "| `a.py` | nightly (n.yml) |\n| `b.mjs` | PR (c.yml) |\n| `c.py` | manual (nenhum workflow) |");
});

test("runCli: imprime a tabela ou o JSON e sai com 0", () => {
  let out = "";
  assert.equal(runCli([], (t) => { out += t; }), 0);
  assert.match(out, /^\| `e2e\/test_vox_e2e\.py` \|/m);
  out = "";
  assert.equal(runCli(["--json"], (t) => { out += t; }), 0);
  assert.ok(Array.isArray(JSON.parse(out)));
});

test("docs/TESTES.md §4.1: a tabela bate com o que os workflows chamam hoje", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs", "TESTES.md"), "utf8");
  const section = /### 4\.1 Quais E2E rodam onde[\s\S]*?\n\| Arquivo \| Onde roda \|\n\|---\|---\|\n((?:\|.*\n?)+)/.exec(doc)?.[1];
  assert.ok(section, "a seção 4.1 e a tabela existem");
  assert.equal(section.trim(), formatRows(buildInventory(ROOT)), "rode `npm run audit:e2e` e cole as linhas na tabela");
  assert.match(formatRows(buildInventory(ROOT)), /`scripts\/mesh-e2e\.mjs` \| PR \(ci\.yml\)/, "o E2E da malha roda em PR");
});

test("runCommands: lê só as chaves `run:` (em linha ou em bloco); name, comentário e outras chaves ficam de fora", () => {
  const yaml = [
    "steps:",
    "  # npm run test:e2e (comentário)",
    "  - name: npm run test:e2e",
    "    run: node a.mjs # npm run test:e2e",
    "  - run: |",
    "      echo um",
    "",
    "      npm run test:e2e",
    "    env:",
    "      X: npm run test:e2e",
    "  - run: >-",
    "      node b.mjs",
  ].join("\n");
  assert.deepEqual(runCommands(yaml).split("\n"), ["node a.mjs", "echo um", "", "npm run test:e2e", "node b.mjs"]);
});

test("buildInventory: `npm run test:e2e` em name:, comentário ou env não conta; em `run:` de bloco conta", () => {
  const root = fixture();
  const wf = (name, text) => fs.writeFileSync(path.join(root, ".github/workflows", name), text);
  try {
    wf("night.yml", `${CRON}      - name: npm run test:e2e\n        run: echo desligado\n      # run: npm run test:e2e\n        env:\n          CMD: npm run test:e2e\n`);
    wf("ci.yml", `${PR}      - name: node scripts/smoke-e2e.mjs\n        run: echo desligado\n`);
    const find = (p) => buildInventory(root).find((i) => i.path === p).where;
    assert.equal(find("e2e/test_a.py"), "manual", "só name/comentário/env citam o comando");
    assert.equal(find("scripts/smoke-e2e.mjs"), "manual", "o caminho do script só aparece no name");
    wf("night.yml", `${CRON}      - name: rodar\n        run: |\n          echo antes\n          npm run test:e2e\n`);
    assert.equal(find("e2e/test_a.py"), "nightly", "`run:` em bloco conta");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
