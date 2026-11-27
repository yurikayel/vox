/**
 * @file Fachadas públicas das telas raras (`showGuardians`, `showNetworkWizard`) diante de um `import()` que falha uma
 * vez: a primeira abertura falha (sem rede), a segunda, com a rede de volta, abre a tela. O teste não usa gancho do
 * código: um `module.registerHooks` falha a primeira resolução do módulo da tela e entrega uma tela de mentira
 * (`data:`) nas seguintes. Antes, `x ??= import()` guardava a promessa rejeitada e a segunda abertura continuava falhando.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { makeEl, installDom, settle, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";
import { showGuardians } from "../client/js/app/screens-guardians.js";
import { showNetworkWizard } from "../client/js/app/screens-guided.js";

unrefLongTimers();

/** Falha a 1ª resolução de `viewFile` e, nas outras, resolve para um módulo de mentira que marca `globalThis[mark]`. */
function failFirstThenStub(viewFile, mark, fn) {
  const seen = { resolves: 0 };
  const source = `export function ${fn}() { globalThis.${mark} = (globalThis.${mark} ?? 0) + 1; }`;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.endsWith(viewFile)) return nextResolve(specifier, context);
      seen.resolves += 1;
      if (seen.resolves === 1) throw new Error("Failed to fetch dynamically imported module");
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    },
  });
  return { seen, off: () => hooks.deregister() };
}

function withMain() {
  installDom({ ids: { "app-main": makeEl({ tagName: "MAIN", id: "app-main" }) } });
}

test("guardiões: depois de uma falha de rede, abrir de novo abre a tela (a falha não fica guardada)", async () => {
  withMain();
  const { seen, off } = failFirstThenStub("screens-guardians-view.js", "__abriuGuardioes", "showGuardians");
  try {
    await showGuardians().catch(() => {});
    assert.equal(globalThis.__abriuGuardioes, undefined, "a 1ª abertura, sem rede, não abre a tela");
    const segunda = await showGuardians().then(() => "abriu", (erro) => `rejeitou: ${erro.message}`);
    await settle();
    assert.equal(segunda, "abriu", "a 2ª abertura não pode repetir a falha guardada");
    assert.equal(globalThis.__abriuGuardioes, 1, "a 2ª abertura importa de novo e abre a tela");
    assert.equal(seen.resolves, 2, "um import() que falhou e um novo");
  } finally {
    off();
    delete globalThis.__abriuGuardioes;
  }
});

test("assistentes guiados: depois de uma falha de rede, abrir de novo abre o assistente", async () => {
  withMain();
  const { off } = failFirstThenStub("screens-guided-view.js", "__abriuRede", "showNetworkWizard");
  try {
    await showNetworkWizard().catch(() => {});
    assert.equal(globalThis.__abriuRede, undefined);
    const segunda = await showNetworkWizard().then(() => "abriu", (erro) => `rejeitou: ${erro.message}`);
    await settle();
    assert.equal(segunda, "abriu", "a 2ª abertura não pode repetir a falha guardada");
    assert.equal(globalThis.__abriuRede, 1);
  } finally {
    off();
    delete globalThis.__abriuRede;
  }
});
