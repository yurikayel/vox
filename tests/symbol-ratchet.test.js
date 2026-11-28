/**
 * @file PM-116: catraca por símbolo. Métricas por função, teste e módulo pela árvore sintática, e a comparação com a base
 * (símbolo que existia não piora; símbolo novo não passa do máximo).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { classifyFile, compareSymbols, LIMITS, measureSource } from "../scripts/symbol-metrics-lib.mjs";

const lines = (...l) => l.join("\n");
const metricsOf = (source, key, kind = "prod") => measureSource(source, kind).get(key);

const SAMPLE = lines(
  "function f(a, b) {",
  "  // comentário",
  "",
  "  if (a && b) {",
  "    for (const x of a) { if (x) return 1; }",
  "  } else if (b) {",
  "    return 2;",
  "  }",
  "  return a ? 1 : 0;",
  "}",
);

test("a) função: linhas sem comentário e branco, parâmetros, aninhamento (else if não aninha) e complexidade", () => {
  const m = metricsOf(SAMPLE, "f");
  assert.equal(m.lloc, 8, "10 linhas menos o comentário e o branco");
  assert.equal(m.params, 2);
  assert.equal(m.depth, 3, "if > for > if; o else if fica no mesmo nível");
  assert.equal(m.cc, 7, "1 + if + && + for + if + else if + ternário");
});

test("b) a função interna é medida à parte e não soma na complexidade nem no aninhamento da externa", () => {
  const src = lines("function fora() {", "  const dentro = () => {", "    if (1) { if (2) { return 3; } }", "    return 0;", "  };", "  return dentro();", "}");
  const all = measureSource(src, "prod");
  assert.deepEqual([all.get("fora").cc, all.get("fora").depth], [1, 0]);
  assert.deepEqual([all.get("fora>dentro").cc, all.get("fora>dentro").depth], [3, 2]);
});

test("c) chaves: método de classe, arrow em const, propriedade de objeto e repetidos com #n", () => {
  const src = lines("class A { m() {} static s = () => {}; }", "const obj = { p() {}, q: function () {} };", "function d() {}", "{ function d() {} }");
  const keys = [...measureSource(src, "prod").keys()];
  for (const k of ["A>m", "A>s", "obj>p", "obj>q", "d", "d#2"]) assert.ok(keys.includes(k), `falta ${k}: ${keys}`);
});

test("d) comentário de bloco, comentário no fim da linha e linha em branco dentro de template não contam", () => {
  const src = lines("function g() {", "  /* a", "     b */", "  const t = `x", "", "y`; // fim", "  return t;", "}");
  assert.equal(metricsOf(src, "g").lloc, 5, "g, const t, y, return, }");
});

test("e) teste: mede o corpo de test/it pelo título; repetidos ganham #n; helpers não entram", () => {
  const src = lines("test('um', () => {", "  assert.ok(1);", "});", "it('um', function () {});", "test.skip('dois', () => {});", "function ajuda() {}");
  const keys = [...measureSource(src, "test").keys()].filter((k) => k !== "<módulo>");
  assert.deepEqual(keys, ["test:um", "test:um#2", "test:dois"]);
  assert.equal(metricsOf(src, "test:um", "test").lloc, 3);
  assert.equal(metricsOf(src, "test:um", "test").cc, undefined, "teste só mede linhas");
});

test("f) o módulo tem as próprias linhas, sem shebang virar erro", () => {
  const src = lines("#!/usr/bin/env node", "// c", "", "const a = 1;", "export { a };");
  assert.equal(metricsOf(src, "<módulo>").lloc, 2);
});

test("m) complexidade e aninhamento contam switch/case, catch, laço, ||=, ?? e try; default e função interna não", () => {
  const src = lines(
    "function h(a, b) {",
    "  switch (a) { case 1: break; case 2: break; default: break; }",
    "  try { while (b) { b ||= 1; } } catch (e) { return a ?? b; }",
    "  do { a ??= 2; } while (a);",
    "  return 0;",
    "}",
  );
  const m = metricsOf(src, "h");
  assert.equal(m.cc, 1 + 2 + 1 + 1 + 1 + 1 + 1 + 1, "2 cases + catch + while + ||= + ?? + do-while + ??=");
  assert.equal(m.depth, 2, "try > while");
});

test("m2) cadeia de else if não aninha; switch e do-while aninham", () => {
  const chain = lines("function c(a, b, d) {", "  if (a) { return 1; } else if (b) { return 2; } else if (d) { if (a) { return 3; } }", "  return 0;", "}");
  assert.equal(metricsOf(chain, "c").depth, 2, "if > if; cada else if no mesmo nível");
  const deep = lines("function s(a) {", "  switch (a) { default: do { if (a) { return 1; } } while (a); }", "  return 0;", "}");
  assert.equal(metricsOf(deep, "s").depth, 3, "switch > do > if");
});

test("m3) chaves: classe anônima, atribuição a propriedade ou a variável, título de teste em template", () => {
  const keys = [...measureSource("const K = class { m() {} };\nexports.run = function () {};\nlet x;\nx = () => {};", "prod").keys()];
  for (const k of ["<class>>m", "run", "x"]) assert.ok(keys.includes(k), `falta ${k}: ${keys}`);
  const tests = [...measureSource("test(`com ${1} dentro`, () => {});", "test").keys()];
  assert.ok(tests.includes("test:com … dentro"), tests.join());
});

test("m4) as violações saem em ordem de linha, não de inserção", () => {
  const cur = new Map([["b", { lloc: 99, params: 0, depth: 0, cc: 1, line: 20 }], ["a", { lloc: 99, params: 0, depth: 0, cc: 1, line: 5 }]]);
  const out = compareSymbols(new Map(), cur, "prod");
  assert.match(out[0], /^linha 5 ·/);
  assert.match(out[1], /^linha 20 ·/);
});

test("n) os máximos são os de docs/HARDENING.md", () => {
  assert.deepEqual({ ...LIMITS.prod }, { lloc: 30, params: 5, depth: 4, cc: 15 });
  assert.deepEqual({ ...LIMITS.test }, { lloc: 45 });
  assert.deepEqual({ ...LIMITS.module }, { lloc: 350 });
});

const sym = (extra) => new Map([["f", { lloc: 10, params: 2, depth: 1, cc: 3, line: 1, ...extra }]]);

test("g) catraca: símbolo que cruza o máximo reprova, em cada métrica", () => {
  const max = LIMITS.prod;
  for (const metric of ["lloc", "params", "depth", "cc"]) {
    const out = compareSymbols(sym({ [metric]: max[metric] }), sym({ [metric]: max[metric] + 1 }), "prod");
    assert.equal(out.length, 1, metric);
    assert.match(out[0], new RegExp(`f: ${metric} ${max[metric]} → ${max[metric] + 1} \\(passou do máximo`));
  }
});

test("h) catraca: abaixo do máximo cresce à vontade; legado acima do máximo só não pode piorar", () => {
  assert.deepEqual(compareSymbols(sym({}), sym({ lloc: 29, cc: 14 }), "prod"), []);
  assert.deepEqual(compareSymbols(sym({ lloc: 40 }), sym({ lloc: 40 }), "prod"), []);
  assert.deepEqual(compareSymbols(sym({ lloc: 40 }), sym({ lloc: 35 }), "prod"), []);
  const worse = compareSymbols(sym({ lloc: 40 }), sym({ lloc: 41 }), "prod");
  assert.match(worse.join(), /lloc 40 → 41 \(legado acima do máximo piorou\)/);
});

test("i) símbolo novo: no máximo passa; um acima falha em cada métrica; arquivo novo (base vazia) vale o mesmo", () => {
  const max = LIMITS.prod;
  assert.deepEqual(compareSymbols(new Map(), sym(max), "prod"), []);
  for (const metric of ["lloc", "params", "depth", "cc"]) {
    const out = compareSymbols(new Map(), sym({ [metric]: max[metric] + 1 }), "prod");
    assert.match(out.join(), new RegExp(`${metric} ${max[metric] + 1} > ${max[metric]} \\(símbolo novo`));
  }
});

test("j) teste e módulo têm máximos próprios (45 e 350 linhas)", () => {
  const t = (lloc) => new Map([["test:x", { lloc, line: 1 }]]);
  assert.deepEqual(compareSymbols(new Map(), t(45), "test"), []);
  assert.equal(compareSymbols(new Map(), t(46), "test").length, 1);
  const mod = (lloc) => new Map([["<módulo>", { lloc, line: 1 }]]);
  assert.deepEqual(compareSymbols(new Map(), mod(350), "prod"), []);
  assert.equal(compareSymbols(new Map(), mod(351), "prod").length, 1);
  assert.equal(compareSymbols(mod(400), mod(401), "prod").length, 1, "módulo legado grande não cresce");
  assert.deepEqual(compareSymbols(mod(200), mod(300), "prod"), [], "módulo pequeno cresce até o máximo");
});

test("k) quais arquivos entram: cliente, sw, scripts e tests; fora, o resto e o mock", () => {
  assert.equal(classifyFile("client/js/peers.js"), "prod");
  assert.equal(classifyFile("client/sw.js"), "prod");
  assert.equal(classifyFile("scripts/x.mjs"), "prod");
  assert.equal(classifyFile("tests/x.test.js"), "test");
  for (const rel of ["client/js/mock.js", "docs/x.js", "client/css/a.css", "relay/x.py", "client/vendor/x.js"]) assert.equal(classifyFile(rel), null, rel);
});

test("l) a linha de comando recusa ref com caractere perigoso e sai com erro", () => {
  const r = spawnSync(process.execPath, ["scripts/symbol-ratchet.mjs", "--base", "a;b"], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /ref inválida/);
});

test("o) caractere astral (emoji) antes de comentário não desloca a medição: mesmo lloc que o texto em ASCII", () => {
  const body = (mark) => lines(`const m = "${mark}";`, "// c1", "// c2", "function f() {", "  // dentro", "  return 1;", "}", "const z = 2;");
  const emoji = measureSource(body("🛡️🚧✅🎲🔒"), "prod");
  const ascii = measureSource(body("abcde"), "prod");
  assert.equal(emoji.get("<módulo>").lloc, ascii.get("<módulo>").lloc);
  assert.equal(emoji.get("f").lloc, 3, "function f, return, }");
  assert.equal(emoji.get("<módulo>").lloc, 5);
});

const SCRIPT = path.resolve("scripts/symbol-ratchet.mjs");

function repo(files, change) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-"));
  const run = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, stdio: "ignore" });
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  run("init", "-q", "-b", "base");
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  run("add", "-A");
  run("commit", "-q", "-m", "base");
  run("checkout", "-q", "-b", "work");
  change(put, run);
  return dir;
}

function cli(dir, ...args) {
  return spawnSync(process.execPath, [SCRIPT, "--base", "base", ...args], { encoding: "utf8", env: { ...process.env, SYMBOL_RATCHET_ROOT: dir } });
}

const big = (name, n) => `function ${name}() {\n${"  work();\n".repeat(n)}}\n`;

test("p) CLI: função nova acima do máximo reprova com saída 1 e a mensagem; --json traz o mesmo", () => {
  const dir = repo({ "scripts/a.mjs": "export const a = 1;\n" }, (put, run) => {
    put("scripts/new.mjs", big("grande", 31));
    run("add", "scripts/new.mjs");
  });
  try {
    const r = cli(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /scripts\/new\.mjs/);
    assert.match(r.stdout, /grande: lloc 33 > 30/);
    const j = JSON.parse(cli(dir, "--json").stdout);
    assert.equal(j.files, 1);
    assert.equal(Object.keys(j.violations)[0], "scripts/new.mjs");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("q) CLI: sem violação sai com 0; arquivo novo já commitado e arquivo só alterado entram na conta", () => {
  const dir = repo({ "scripts/a.mjs": big("pequena", 5) }, (put, run) => {
    put("scripts/a.mjs", big("pequena", 6));
    put("scripts/b.mjs", big("outra", 3));
    run("add", "-A");
    run("commit", "-q", "-m", "work");
  });
  try {
    const r = cli(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /2 arquivo\(s\) medido\(s\) contra base, 0 violação/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("r) CLI: arquivo novo commitado acima do máximo e legado que piora reprovam; arquivo sem rastreio e fora da catraca não contam", () => {
  const dir = repo({ "scripts/old.mjs": big("legado", 40) }, (put, run) => {
    put("scripts/old.mjs", big("legado", 41));
    put("scripts/added.mjs", big("novo", 35));
    run("add", "scripts/added.mjs");
    run("commit", "-q", "-m", "work");
    put("scripts/loose.mjs", big("solto", 35));
    put("docs/ignorado.js", big("fora", 60));
  });
  try {
    const out = cli(dir, "--json");
    const v = JSON.parse(out.stdout).violations;
    assert.deepEqual(Object.keys(v).sort(), ["scripts/added.mjs", "scripts/old.mjs"], "o rascunho solto fora do Git não reprova");
    assert.match(v["scripts/old.mjs"].join(), /legado: lloc 42 → 43 \(legado acima do máximo piorou\)|lloc \d+ → \d+/);
    assert.equal(JSON.parse(out.stdout).files, 2, "docs/ e o arquivo sem rastreio ficam de fora da conta");
    assert.equal(out.status, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("t) CLI: arquivo renomeado conta como novo (e reprova se passa do máximo), como diz o cabeçalho", () => {
  const dir = repo({ "scripts/velho.mjs": big("legado", 40) }, (put, run) => {
    run("mv", "scripts/velho.mjs", "scripts/novo.mjs");
    run("commit", "-q", "-m", "mv");
  });
  try {
    const r = cli(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /scripts\/novo\.mjs/);
    assert.match(r.stdout, /legado: lloc 42 > 30 \(símbolo novo/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("u) CLI: o que a base mudou depois do desvio não conta contra a branch (compara com o merge-base)", () => {
  const dir = repo({ "scripts/a.mjs": big("legado", 40) }, (put, run) => {
    run("checkout", "-q", "base");
    put("scripts/a.mjs", big("legado", 10));
    run("commit", "-qam", "base avançou");
    run("checkout", "-q", "work");
    put("scripts/b.mjs", big("b", 3));
    run("add", "-A");
    run("commit", "-q", "-m", "work");
  });
  try {
    const out = JSON.parse(cli(dir, "--json").stdout);
    assert.deepEqual(out.violations, {});
    assert.equal(out.files, 1, "só b.mjs; a.mjs não foi tocado pela branch");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("s) CLI: arquivo que não parseia reprova com 'não foi possível medir' (nunca passa como limpo)", () => {
  const dir = repo({ "scripts/a.mjs": "export const a = 1;\n" }, (put, run) => {
    put("scripts/quebrado.mjs", "function (\n");
    run("add", "scripts/quebrado.mjs");
  });
  try {
    const r = cli(dir);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /scripts\/quebrado\.mjs\n {2}não foi possível medir:/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
