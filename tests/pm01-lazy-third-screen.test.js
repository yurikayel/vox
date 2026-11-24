/**
 * @file PM-01 passo 4 — carregamento sob demanda da pilha rara da frase de recuperação (`screens-phrase`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeEl, installDom, waitFor, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const LAZY_MODULES = [
  "./js/app/screens-phrase-view.js",
  "./js/app/phrase-print.js",
  "./js/render/recovery-phrase.js",
];

function collectStaticGraph(entryAbs) {
  const seen = new Set();
  const stack = [entryAbs];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const match of fs.readFileSync(file, "utf8").matchAll(STATIC_IMPORT_RE)) {
      const spec = match[1] || match[2];
      if (spec?.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map((abs) => "./" + path.relative(ROOT, abs).split(path.sep).join("/")));
}

function setupPhraseDom(extraIds = {}) {
  const screen = makeEl({ id: "phrase-screen" });
  const form = makeEl();
  const error = makeEl({ hidden: true });
  const ids = {
    "phrase-screen": screen,
    "form-phrase-show": form,
    "phrase-pass": makeEl({ value: "" }),
    "phrase-error": error,
    "btn-phrase-show": makeEl(),
    "btn-phrase-print": makeEl(),
    "btn-phrase-written": makeEl(),
    "btn-phrase-back": makeEl(),
    "form-phrase-confirm": makeEl(),
    ...extraIds,
  };
  const all = {};
  const doc = installDom({ ids, all });
  return { doc, ids, all, screen, form, error };
}

test("PM-01 passo 4: fachada screens-phrase usa import() dinâmico sem imports estáticos da pilha rara", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-phrase.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-phrase-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-phrase-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/phrase-print\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\/recovery-phrase\.js["']/);
});

test("PM-01 passo 4: pilha rara da frase fica fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-phrase.js"), "fachada mínima segue no grafo de boot");
  for (const rel of LAZY_MODULES) {
    assert.ok(!bootStatic.has(rel), `${rel} não entra no boot estático`);
  }
});

test("PM-01 passo 4: pilha rara sob demanda não ocupa SHELL_ASSETS nem entra em UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  assert.ok(shellSection.includes('"./js/app/screens-phrase.js"'), "fachada continua no SHELL_ASSETS");
  for (const rel of LAZY_MODULES) {
    assert.ok(!shellSection.includes(`"${rel}"`), `${rel} deve ficar fora do precache SHELL_ASSETS`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
});

test("PM-01 passo 4: fachada carrega tela da frase sob demanda e conclui conferência", async () => {
  localStorage.clear();
  const identity = await import("../client/js/identity/index.js");
  await identity.ensureLocalAccount();
  const facade = await import("../client/js/app/screens-phrase.js");
  const { doc, ids, all, screen, form, error } = setupPhraseDom();
  await facade.showRecoveryPhrase();
  assert.match(doc.main.innerHTML, /form-phrase-show/);
  await form.fire("submit");
  await waitFor(() => screen.innerHTML.length > 0);
  const words = (await identity.getAccountPhrase()).words;
  await ids["btn-phrase-print"].fire("click");
  await ids["btn-phrase-written"].fire("click");
  const positions = [...screen.innerHTML.matchAll(/data-phrase-pos="(\d+)"/g)].map((m) => Number(m[1]));
  all["[data-phrase-pos]"] = positions.map((p) => makeEl({ dataset: { phrasePos: String(p) }, value: "errada" }));
  await ids["form-phrase-confirm"].fire("submit");
  assert.match(error.textContent, /não confere/);
  all["[data-phrase-pos]"].forEach((el, i) => { el.value = words[positions[i]]; });
  await ids["form-phrase-confirm"].fire("submit");
  assert.doesNotMatch(screen.innerHTML, /data-phrase-pos/);
  assert.equal(await facade.printCard(), false);
});

test("PM-01 passo 4: botão voltar e erro de senha na view sob demanda", async () => {
  localStorage.clear();
  const identity = await import("../client/js/identity/index.js");
  await identity.ensureLocalAccount();
  const facade = await import("../client/js/app/screens-phrase.js");
  const { ids, screen, form, error } = setupPhraseDom({ "phrase-pass": null });
  await facade.showRecoveryPhrase();
  assert.equal(ids["btn-phrase-show"].focused, 1);
  await form.fire("submit");
  await waitFor(() => screen.innerHTML.length > 0);
  await ids["btn-phrase-written"].fire("click");
  await ids["btn-phrase-back"].fire("click");
  assert.match(screen.innerHTML, /btn-phrase-written/);
  await identity.lockActiveAccount("senha-soberana-teste-1234");
  await form.fire("submit");
  await waitFor(() => !error.hidden);
  assert.ok(error.textContent.length > 0);
});
