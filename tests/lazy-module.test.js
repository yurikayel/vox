/**
 * @file Carga sob demanda de telas raras: o `import()` lembra só o sucesso. Uma falha mostra "Tentar de novo" na tela e
 * não fica guardada (antes, `??= import()` guardava a rejeição e a tela nunca mais abria até recarregar a página).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { makeEl, installDom, settle, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";
import { lazyModule } from "../client/js/app/lazy-module.js";
import { guardiansView, showGuardians } from "../client/js/app/screens-guardians.js";
import {
  guidedView,
  showBackupWizard,
  showMobileTestGuide,
  showNetworkWizard,
  showWalletWizard,
} from "../client/js/app/screens-guided.js";

unrefLongTimers();

/** Loader que falha `failures` vezes e depois entrega `mod`; conta as chamadas. */
function flaky(mod, failures) {
  const loader = async () => {
    loader.calls += 1;
    if (loader.calls <= failures) throw new Error("Failed to fetch dynamically imported module");
    return mod;
  };
  loader.calls = 0;
  return loader;
}

/** DOM falso com o miolo da tela e o botão "Tentar de novo" já registrado para o `querySelector` do aviso. */
function domWithRetryButton() {
  const retry = makeEl({ tagName: "BUTTON" });
  const main = makeEl({ tagName: "MAIN", id: "app-main", kids: { "[data-lazy-retry]": retry } });
  installDom({ ids: { "app-main": main } });
  return { main, retry };
}

test("a) a 1ª falha mostra o aviso com 'Tentar de novo'; tocar no botão abre a tela, sem recarregar a página", async () => {
  const { main, retry } = domWithRetryButton();
  const calls = [];
  const restore = guardiansView.useLoaderForTests(flaky({ showGuardians: () => calls.push("guardioes") }, 1));
  try {
    await showGuardians();
    assert.deepEqual(calls, [], "a tela não abre enquanto o módulo não carrega");
    assert.match(main.innerHTML, /precisa de conexão na primeira vez/);
    assert.match(main.innerHTML, /data-lazy-retry="1"[^>]*>Tentar de novo</);
    await retry.fire("click");
    await settle();
    assert.deepEqual(calls, ["guardioes"], "o botão importa de novo e abre a tela");
  } finally {
    restore();
  }
});

test("a) a falha não vira memória: a próxima visita (sem tocar no botão) abre a tela", async () => {
  domWithRetryButton();
  const calls = [];
  const loader = flaky({ showGuardians: () => calls.push("guardioes") }, 1);
  const restore = guardiansView.useLoaderForTests(loader);
  try {
    await showGuardians();
    await showGuardians();
    assert.deepEqual(calls, ["guardioes"]);
    assert.equal(loader.calls, 2, "uma falha e uma tentativa nova");
  } finally {
    restore();
  }
});

test("b) cada função da fachada abre a sua tela, com os argumentos certos", async () => {
  domWithRetryButton();
  const seen = [];
  const mark = (name) => (...args) => seen.push([name, ...args.map((a) => typeof a)]);
  const guardians = guardiansView.useLoaderForTests(async () => ({ showGuardians: mark("guardioes") }));
  const guided = guidedView.useLoaderForTests(async () => ({
    showNetworkWizard: mark("rede"),
    showBackupWizard: mark("backup"),
    showWalletWizard: mark("carteira"),
    showMobileTestGuide: mark("celular"),
  }));
  try {
    await showGuardians();
    await showNetworkWizard();
    await showBackupWizard();
    await showWalletWizard();
    await showMobileTestGuide({ userAgent: "x" });
    assert.deepEqual(seen, [
      ["guardioes"],
      ["rede", "function"],
      ["backup"],
      ["carteira"],
      ["celular", "object"],
    ]);
  } finally {
    guardians();
    guided();
  }
});

test("b) o valor que a tela devolve chega a quem chamou, e o erro da própria tela não vira aviso de conexão", async () => {
  const { main } = domWithRetryButton();
  const restore = guidedView.useLoaderForTests(async () => ({
    showMobileTestGuide: () => ({ getReport: () => ({ ok: true }) }),
    showWalletWizard: () => {
      throw new Error("falha da própria tela");
    },
  }));
  try {
    const guide = await showMobileTestGuide();
    assert.deepEqual(guide.getReport(), { ok: true });
    await assert.rejects(() => showWalletWizard(), /falha da própria tela/);
    assert.doesNotMatch(main.innerHTML, /precisa de conexão/);
  } finally {
    restore();
  }
});

test("c) depois do sucesso o import() não se repete; chamadas simultâneas dividem o mesmo import()", async () => {
  const loader = flaky({ id: "mod" }, 0);
  const lazy = lazyModule(loader);
  const [one, two] = await Promise.all([lazy.load(), lazy.load()]);
  assert.equal(one, two);
  assert.equal(loader.calls, 1, "duas chamadas ao mesmo tempo, um import()");
  await lazy.load();
  await lazy.open(() => {});
  assert.equal(loader.calls, 1, "memoiza o sucesso");
});

test("c) a falha é esquecida: depois dela o loader roda de novo; falhas seguidas não travam a tela", async () => {
  const loader = flaky({ id: "mod" }, 2);
  const lazy = lazyModule(loader);
  await assert.rejects(() => lazy.load(), /Failed to fetch/);
  await assert.rejects(() => lazy.load(), /Failed to fetch/);
  assert.equal((await lazy.load()).id, "mod");
  assert.equal(loader.calls, 3);
});

test("sem miolo de tela para o aviso, a falha não some em silêncio", async () => {
  installDom();
  globalThis.document.getElementById = () => null;
  const lazy = lazyModule(flaky({}, 1));
  await assert.rejects(() => lazy.open(() => {}), /sem lugar para mostrar o aviso/);
});

test("o aviso reaparece a cada falha e o botão novo refaz a abertura", async () => {
  const { main, retry } = domWithRetryButton();
  const ran = [];
  const lazy = lazyModule(flaky({ id: "mod" }, 2));
  await lazy.open((m) => ran.push(m.id));
  await retry.fire("click");
  await settle();
  assert.deepEqual(ran, [], "a 2ª falha mostra o aviso de novo");
  assert.match(main.innerHTML, /Tentar de novo/);
  retry.listeners.click = retry.listeners.click.slice(-1); // o DOM real troca o botão e o ouvinte `once` sai sozinho
  await retry.fire("click");
  await settle();
  assert.deepEqual(ran, ["mod"]);
});
