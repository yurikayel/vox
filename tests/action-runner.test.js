/**
 * Action runner (`client/js/shared/action-runner.js` e `client/js/app/action-runner.js`):
 * anti-duplo-clique, aria-busy, restore em finally, onError/toast e delegação [data-action].
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, withToasts } from "./helpers/cov-t2-dom.mjs";
import { bindActionDelegate as bindSharedDelegate, runButtonAction as runSharedAction } from "../client/js/shared/action-runner.js";
import { bindActionDelegate, runButtonAction } from "../client/js/app/action-runner.js";

function makeFakeButton(text = "Enviar") {
  const attrs = new Map();
  return {
    textContent: text,
    disabled: false,
    isConnected: true,
    dataset: {},
    setAttribute(k, v) { attrs.set(k, String(v)); },
    getAttribute(k) { return attrs.get(k) ?? null; },
    removeAttribute(k) { attrs.delete(k); },
  };
}

test("shared/runButtonAction — trava durante execução, bloqueia duplo clique e restaura no sucesso", async () => {
  const btn = makeFakeButton("Votar");
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });

  const first = runSharedAction(btn, async () => {
    runs += 1;
    assert.equal(btn.disabled, true);
    assert.equal(btn.getAttribute("aria-busy"), "true");
    assert.equal(btn.textContent, "Gravando…");
    await gate;
    return "ok";
  }, { busyText: "Gravando…" });

  assert.equal(await runSharedAction(btn, () => { runs += 1; }), undefined);
  release();
  assert.equal(await first, "ok");
  assert.equal(runs, 1);
  assert.equal(btn.disabled, false);
  assert.equal(btn.getAttribute("aria-busy"), null);
  assert.equal(btn.textContent, "Votar");
});

test("shared/runButtonAction — restaura no finally após erro com onError e sem onError", async () => {
  const btn = makeFakeButton("Publicar");
  let caught = null;
  const res = await runSharedAction(btn, async () => { throw new Error("falhou"); }, {
    busyText: "Enviando…",
    onError: (e) => { caught = e; },
  });
  assert.equal(res, undefined);
  assert.match(caught.message, /falhou/);
  assert.equal(btn.disabled, false);
  assert.equal(btn.getAttribute("aria-busy"), null);
  assert.equal(btn.textContent, "Publicar");

  await assert.rejects(() => runSharedAction(btn, async () => { throw new Error("cru"); }, { busyText: "…" }), /cru/);
  assert.equal(btn.disabled, false);
  assert.equal(btn.getAttribute("aria-busy"), null);
  assert.equal(btn.textContent, "Publicar");
});

test("shared/runButtonAction — ignora restauração em elemento desconectado", async () => {
  const detached = makeFakeButton("Sair");
  await runSharedAction(detached, () => { detached.isConnected = false; }, { busyText: "Saindo…" });
  assert.equal(detached.textContent, "Saindo…");
  assert.equal(detached.disabled, true);
});

test("shared/bindActionDelegate — despacha data-action, passa busyText e permite dispose", async () => {
  const btn = makeFakeButton("Apoiar");
  btn.dataset = { action: "vote", busyText: "Marcando…" };
  let listener = null;
  let seenBusy = null;
  let prevented = false;
  const fakeRoot = {
    addEventListener(ev, fn) { if (ev === "click") listener = fn; },
    removeEventListener(ev, fn) { if (ev === "click" && listener === fn) listener = null; },
  };
  const stop = bindSharedDelegate(fakeRoot, {
    vote: (el) => { seenBusy = { disabled: el.disabled, text: el.textContent, busy: el.getAttribute("aria-busy") }; },
  });
  await listener({ target: { closest: () => btn }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(seenBusy, { disabled: true, text: "Marcando…", busy: "true" });
  assert.equal(btn.disabled, false);
  assert.equal(btn.getAttribute("aria-busy"), null);
  assert.equal(btn.textContent, "Apoiar");
  stop();
  assert.equal(listener, null);
});

test("app/action-runner — fallback de toast em erro quando onError não é passado", async () => {
  const doc = installFakeDom();
  const btn = makeFakeButton("Confirmar");
  const prevDoc = globalThis.document;
  globalThis.document = doc;
  try {
    const toasts = await withToasts(doc, async () => {
      await runButtonAction(btn, async () => { throw new Error("rede fora"); }, { busyText: "Salvando…" });
    });
    assert.deepEqual(toasts, ["rede fora"]);
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, "Confirmar");

    let listener = null;
    const root = { addEventListener(_e, fn) { listener = fn; }, removeEventListener() {} };
    btn.dataset = { action: "save", errorToast: "Falha ao gravar" };
    bindActionDelegate(root, { save: async () => { throw new Error("interno"); } });
    const delegateToasts = await withToasts(doc, async () => {
      await listener({ target: { closest: () => btn }, preventDefault() {} });
    });
    assert.deepEqual(delegateToasts, ["Falha ao gravar"]);
  } finally {
    globalThis.document = prevDoc;
  }
});
