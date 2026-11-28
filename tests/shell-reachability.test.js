/**
 * PM-04 + PM-02 — o que o Service Worker baixa na instalação.
 * - Todo módulo do precache (SHELL_ASSETS) tem de ser alcançável a partir de um ponto de entrada
 *   (os <script src> das páginas do cliente), seguindo os imports estáticos e dinâmicos.
 * - Todo módulo inalcançável tem de estar em UNPLUGGED_MODULES (fora do precache).
 * - O tamanho total do precache é medido e impresso, sem teto (decisão do mantenedor em 2026-11-12):
 *   nenhum número reprova o teste. A disciplina continua na revisão: não pôr no precache asset duplicado,
 *   imagem sem otimizar nem código morto (regra em `docs/HARDENING.md`, seção "Peso do precache").
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function listFrom(name) {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} precisa existir no sw.js`);
  return m[1].split("\n").map((s) => s.trim().replace(/^['"]|['"],?$/g, "")).filter((s) => s && !s.startsWith("//"));
}

const toRel = (abs) => "./" + path.relative(root, abs).split(path.sep).join("/");

function entryPoints() {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => path.join(root, f));
  for (const extra of ["download/index.html", "embed/demo.html", "embed/frame-demo.html"]) {
    if (fs.existsSync(path.join(root, extra))) pages.push(path.join(root, extra));
  }
  const entries = [];
  for (const page of pages) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
      if (!/^https?:/.test(m[1])) entries.push(path.resolve(path.dirname(page), m[1]));
    }
  }
  return entries;
}

const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

function reachable() {
  const seen = new Set();
  const stack = entryPoints();
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map(toRel));
}

test("PM-04: todo módulo do precache é alcançável; todo inalcançável está em UNPLUGGED_MODULES", () => {
  const shell = new Set(listFrom("SHELL_ASSETS").filter((a) => a.endsWith(".js") && a.startsWith("./js/")));
  const unplugged = new Set(listFrom("UNPLUGGED_MODULES"));
  const live = reachable();
  const deadInShell = [...shell].filter((a) => !live.has(a));
  assert.deepEqual(deadInShell, [], "módulo sem importador no precache: mova para UNPLUGGED_MODULES (ou plugue)");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
  const unlisted = walk(path.join(root, "js")).map(toRel).filter((r) => !live.has(r) && !unplugged.has(r));
  assert.deepEqual(unlisted, [], "módulo inalcançável fora da lista UNPLUGGED_MODULES");
  const pluggedButListed = [...unplugged].filter((r) => live.has(r));
  assert.deepEqual(pluggedButListed, [], "módulo já plugado: tire de UNPLUGGED_MODULES e ponha no SHELL_ASSETS");
});

const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|(?:^|[\n;])\s*import\s*["']([^"']+)["']/g;

/**
 * Lista os módulos que um arquivo importa de forma estática (`import … from`, `export … from`, `import "x"`).
 * O `import()` dinâmico fica de fora: carrega sob demanda e pode ficar fora do precache.
 * @param {string} file caminho absoluto do módulo
 * @returns {string[]} caminhos relativos ao cliente (`./js/…`) dos módulos importados por caminho relativo
 */
function staticImportsOf(file) {
  const found = [];
  const code = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const m of code.matchAll(STATIC_IMPORT_RE)) {
    const spec = m[1] || m[2];
    if (spec.startsWith(".")) found.push(toRel(path.resolve(path.dirname(file), spec)));
  }
  return found;
}

/**
 * Módulos novos que um PR de feature já importa de forma estática mas que só entram no precache no próximo corte
 * (o `sw.js` só muda em PR `chore/release-`). Cada item é `{ path, pr }`. Vale em PR de feature; numa branch
 * `chore/release-` a lista tem de estar vazia (o corte põe tudo no `SHELL_ASSETS`). Item velho (já no precache, ou
 * arquivo que não existe mais) reprova: a lista não acumula.
 * @type {{ path: string, pr: string }[]}
 */
const PENDENTES_PARA_O_PROXIMO_CORTE = [];

/** Nome da branch do PR (CI) ou da branch atual; vazio quando não dá para saber. */
function currentBranch() {
  const fromCi = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
  if (fromCi) return fromCi;
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Módulos importados de forma estática por um arquivo do precache que não estão no precache. */
function missingFromShell(shell) {
  const missing = [];
  for (const asset of shell) {
    if (!asset.endsWith(".js")) continue;
    for (const dep of staticImportsOf(path.join(root, asset))) if (!shell.has(dep)) missing.push({ asset, dep });
  }
  return missing;
}

test("PM-04: todo módulo importado de forma estática por um arquivo do precache também está no precache", () => {
  const pending = new Set(PENDENTES_PARA_O_PROXIMO_CORTE.map((p) => p.path));
  const missing = missingFromShell(new Set(listFrom("SHELL_ASSETS"))).filter(({ dep }) => !pending.has(dep));
  assert.deepEqual(missing.map(({ asset, dep }) => `${asset} importa ${dep}`), [], "falta no SHELL_ASSETS: offline, o import estático falha e a tela não abre");
});

test("PM-04: a lista de pendentes só tem módulo real que ainda falta no precache, e o corte a esvazia", () => {
  const shell = new Set(listFrom("SHELL_ASSETS"));
  const stillMissing = new Set(missingFromShell(shell).map(({ dep }) => dep));
  for (const { path: rel, pr } of PENDENTES_PARA_O_PROXIMO_CORTE) {
    assert.ok(pr, `${rel}: informe o PR que traz o módulo`);
    assert.ok(stillMissing.has(rel), `${rel} (${pr}) já está no precache ou ninguém o importa: tire da lista`);
  }
  if (currentBranch().startsWith("chore/release-")) {
    assert.deepEqual(PENDENTES_PARA_O_PROXIMO_CORTE, [], "corte de release: ponha cada pendente no SHELL_ASSETS e esvazie a lista");
  }
});

/** Telas carregadas por `import()` em `route.js` / `screens-status.js` que têm de abrir offline (F27). */
const ROTAS_OFFLINE = [
  { rota: "#/status", modulo: "./js/app/screens-status-view.js" },
  { rota: "#/voxpedia", modulo: "./js/app/screens-voxpedia.js" },
  { rota: "#/ajuda/teste", modulo: "./js/app/screens-ajuda-teste.js" },
];

test("F27: as rotas #/status, #/voxpedia e #/ajuda/teste têm a tela e os imports estáticos no precache", () => {
  const shell = new Set(listFrom("SHELL_ASSETS"));
  const faltam = [];
  for (const { rota, modulo } of ROTAS_OFFLINE) {
    for (const rel of [modulo, ...staticImportsOf(path.join(root, modulo))]) {
      if (!shell.has(rel)) faltam.push(`${rota}: ${rel}`);
    }
  }
  assert.deepEqual(faltam, [], "offline, a tela lazy não abre: ponha no SHELL_ASSETS");
});

test("PM-04: todo script do index.html está no precache, então o grafo estático inteiro do shell também", () => {
  const shell = new Set(listFrom("SHELL_ASSETS"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const indexEntries = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((src) => !/^https?:/.test(src))
    .map((src) => toRel(path.resolve(root, src)));
  assert.ok(indexEntries.length > 0, "o index.html tem pelo menos um script de entrada");
  assert.deepEqual(indexEntries.filter((rel) => !shell.has(rel)), [], "script de entrada fora do SHELL_ASSETS: offline a página não sobe");
});

test("PM-04: toda folha de estilo ligada pelo index.html está no precache", () => {
  const shell = new Set(listFrom("SHELL_ASSETS"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const linked = [...html.matchAll(/<link[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((href) => !/^https?:/.test(href))
    .map((href) => "./" + href.replace(/^\.\//, ""));
  assert.deepEqual(linked.filter((href) => !shell.has(href)), [], "folha de estilo do index.html fora do SHELL_ASSETS");
});

test("PM-02: o peso do precache é medido e informado, sem teto", (t) => {
  const assets = listFrom("SHELL_ASSETS").filter((asset) => asset !== "./");
  let total = 0;
  for (const asset of assets) total += fs.statSync(path.join(root, asset)).size;
  t.diagnostic(`precache: ${total} bytes em ${assets.length} arquivos`);
  assert.ok(total > 0, "todo arquivo do SHELL_ASSETS existe e foi somado");
});

test("PM-01 passo 2: rotas periféricas usam import() dinâmico em route.js", () => {
  const routeSrc = fs.readFileSync(path.join(root, "js/app/route.js"), "utf8");
  assert.match(routeSrc, /loadAvisoRoute/);
  assert.match(routeSrc, /loadComposeRoute/);
  assert.doesNotMatch(routeSrc, /import\s+\{[^}]*showAvisos[^}]*\}\s+from\s+["']\.\/aviso-flow\.js["']/);
  assert.doesNotMatch(routeSrc, /import\s+\{[^}]*showComposeCommunity[^}]*\}\s+from\s+["']\.\/screens-compose\.js["']/);
});
