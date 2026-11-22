/**
 * Action runner (`client/js/app/action-runner.js`): anti-duplo-clique, aria-busy e restore em finally.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
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

test("runButtonAction — trava durante execução, bloqueia reentrância e restaura no sucesso", async () => {
  const btn = makeFakeButton("Votar");
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });

  const first = runButtonAction(btn, async () => {
    runs += 1;
    assert.equal(btn.disabled, true);
    assert.equal(btn.getAttribute("aria-busy"), "true");
    assert.equal(btn.textContent, "Gravando…");
    await gate;
    return "ok";
  }, { busyText: "Gravando…" });

  const second = await runButtonAction(btn, () => { runs += 1; });
  assert.equal(second, undefined);
  release();
  assert.equal(await first, "ok");
  assert.equal(runs, 1);
  assert.equal(btn.disabled, false);
  assert.equal(btn.getAttribute("aria-busy"), null);
  assert.equal(btn.textContent, "Votar");
});

test("runButtonAction — restaura botão após erro e ignora botão desconectado", async () => {
  const btn = makeFakeButton("Publicar");
  let caught = null;
  await runButtonAction(btn, async () => { throw new Error("falhou"); }, {
    busyText: "Enviando…",
    onError: (e) => { caught = e; },
  });
  assert.match(caught.message, /falhou/);
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "Publicar");

  const detached = makeFakeButton("Sair");
  await runButtonAction(detached, () => { detached.isConnected = false; }, { busyText: "Saindo…" });
  assert.equal(detached.textContent, "Saindo…");
});

test("bindActionDelegate — despacha data-action e permite dispose", async () => {
  const btn = makeFakeButton("Apoiar");
  btn.dataset = { action: "vote", busyText: "Marcando…" };
  let listener = null;
  let clicks = 0;
  const fakeRoot = {
    addEventListener(ev, fn) { if (ev === "click") listener = fn; },
    removeEventListener(ev, fn) { if (ev === "click" && listener === fn) listener = null; },
  };
  const stop = bindActionDelegate(fakeRoot, { vote: () => { clicks += 1; } });
  await listener({ target: { closest: () => btn }, preventDefault() {} });
  assert.equal(clicks, 1);
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "Apoiar");
  stop();
  assert.equal(listener, null);
});
