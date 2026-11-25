/**
 * @file PM-01 passo 5 — carregamento sob demanda da pilha rara de guardiões (`screens-guardians`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeEl, installDom, settle, waitFor, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const LAZY_MODULES = [
  "./js/app/screens-guardians-view.js",
  "./js/render/guardians.js",
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

function setupGuardiansDom(extraIds = {}) {
  const form = makeEl();
  const error = makeEl({ hidden: true });
  const ids = {
    "form-guardians": form,
    "guardian-error": error,
    "guardian-hint": makeEl(),
    "guardian-m": makeEl({ value: "2" }),
    "guardian-pass": makeEl({ value: "" }),
    "btn-guardians-send": makeEl(),
    "btn-guardians-remove": makeEl(),
    ...extraIds,
  };
  const all = {};
  const doc = installDom({ ids, all });
  return { doc, ids, all, form, error };
}

async function seedMutualGuardians(idsList, withDmPub = false) {
  const contacts = await import("../client/js/contacts.js");
  const contactNotify = await import("../client/js/contact-notify.js");
  const graphql = await import("../client/js/graphql.js");
  const cryptoDm = await import("../client/js/crypto-dm.js");
  const pair = withDmPub ? await cryptoDm.generateDmKeypair() : null;
  for (const [idx, routeId] of idsList.entries()) {
    contacts.addContact(routeId, idx === 0 ? "Ana" : "");
    contactNotify.recordIncomingContactNotice({ author: routeId, displayName: `Pessoa ${idx + 1}` });
    if (pair) graphql.cacheUserDmPub(routeId, pair.publicJwk);
  }
}

test("PM-01 passo 5: fachada screens-guardians usa import() dinâmico sem imports estáticos da pilha rara", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-guardians.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-guardians-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-guardians-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\/guardians\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/guardians-flow\.js["']/);
});

test("PM-01 passo 5: pilha rara de guardiões fica fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-guardians.js"), "fachada mínima segue no grafo de boot");
  for (const rel of LAZY_MODULES) {
    assert.ok(!bootStatic.has(rel), `${rel} não entra no boot estático`);
  }
});

test("PM-01 passo 5: pilha rara sob demanda não ocupa SHELL_ASSETS nem entra em UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  assert.ok(shellSection.includes('"./js/app/screens-guardians.js"'), "fachada continua no SHELL_ASSETS");
  for (const rel of LAZY_MODULES) {
    assert.ok(!shellSection.includes(`"${rel}"`), `${rel} deve ficar fora do precache SHELL_ASSETS`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
});

test("PM-01 passo 5: fachada carrega tela sob demanda, envia pedaços e remove guardiões", async () => {
  localStorage.clear();
  globalThis.confirm = () => true;
  const identity = await import("../client/js/identity/index.js");
  await identity.ensureLocalAccount();
  const chosen = ["vx_guard_a", "vx_guard_b", "vx_guard_c"];
  await seedMutualGuardians(chosen, true);
  const facade = await import("../client/js/app/screens-guardians.js");
  const { doc, ids, all, form, error } = setupGuardiansDom();
  all['#form-guardians input[name="guardian"]:checked'] = chosen.map((value) => makeEl({ value }));
  await facade.showGuardians();
  assert.match(doc.main.innerHTML, /form-guardians/);
  await form.fire("submit");
  await waitFor(() => /btn-guardians-remove/.test(doc.main.innerHTML));
  assert.equal(error.hidden, true);
  assert.equal(ids["btn-guardians-send"].disabled, false);
  await ids["btn-guardians-remove"].fire("click");
  await waitFor(() => !/btn-guardians-remove/.test(doc.main.innerHTML));
  assert.match(doc.main.innerHTML, /Dividir e enviar/);
});

test("PM-01 passo 5: erros de validação, senha errada, cancelamento e parar de guardar", async () => {
  localStorage.clear();
  const identity = await import("../client/js/identity/index.js");
  const me = (await identity.ensureLocalAccount()).routeId;
  const chosen = ["vx_guard_d", "vx_guard_e", "vx_guard_f"];
  await seedMutualGuardians(chosen, true);
  await identity.storeHeldShare({ author: "vx_dona_teste", ownerName: "Dona", splitId: "sp1", x: 1, share: "AA==" }, me);
  const facade = await import("../client/js/app/screens-guardians.js");
  const stopBtn = makeEl({ dataset: { stopGuarding: "vx_dona_teste" } });
  const { doc, ids, all, form, error } = setupGuardiansDom();
  all["[data-stop-guarding]"] = [stopBtn];
  all['#form-guardians input[name="guardian"]:checked'] = [makeEl({ value: "vx_guard_d" })];
  await facade.showGuardians();
  assert.match(doc.main.innerHTML, /Dona/);
  await form.fire("change");
  await form.fire("submit");
  assert.equal(error.hidden, false);
  await identity.lockActiveAccount("senha-soberana-teste-1234");
  ids["guardian-pass"].value = "senha-errada";
  all['#form-guardians input[name="guardian"]:checked'] = chosen.map((value) => makeEl({ value }));
  await form.fire("submit");
  await waitFor(() => /senha|Não deu|incorreta|chave/i.test(error.textContent));
  globalThis.confirm = () => false;
  doc.main.innerHTML = "";
  await ids["btn-guardians-remove"].fire("click");
  await settle();
  assert.equal(doc.main.innerHTML, "");
  await stopBtn.fire("click");
  await waitFor(() => doc.main.innerHTML.length > 0);
  assert.match(doc.main.innerHTML, /não guarda a volta de ninguém/i);
});

test("PM-01 passo 5: falha sem laço mútuo e sem elemento de erro no DOM", async () => {
  localStorage.clear();
  const identity = await import("../client/js/identity/index.js");
  await identity.ensureLocalAccount();
  const facade = await import("../client/js/app/screens-guardians.js");
  const { ids, all, form, error } = setupGuardiansDom({ "guardian-m": makeEl({ value: "" }) });
  all['#form-guardians input[name="guardian"]:checked'] = ["vx_x1", "vx_x2", "vx_x3"].map((value) => makeEl({ value }));
  await facade.showGuardians();
  await form.fire("submit");
  await waitFor(() => /laço mútuo/.test(error.textContent));
  assert.equal(ids["btn-guardians-send"].disabled, false);
  const { all: all2, form: form2 } = setupGuardiansDom({ "guardian-error": null, "guardian-hint": null });
  all2['#form-guardians input[name="guardian"]:checked'] = [makeEl({ value: "vx_x1" })];
  await facade.showGuardians();
  await form2.fire("submit");
});
