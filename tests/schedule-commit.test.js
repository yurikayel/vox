/**
 * @file Testes do agendador `shared/schedule-commit.js` (Desfazer 4 s) e da publicação inline otimista.
 */
import "./setup.js";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument, captureToasts } from "./helpers/cov-t4-dom.mjs";

const { scheduleCommit } = await import("../client/js/shared/schedule-commit.js");
const pub = await import("../client/js/app/inline-composer-publish.js");
const st = await import("../client/js/app/inline-composer-state.js");
const cacheNode = await import("../client/js/cache-node.js");
const peersTransport = await import("../client/js/peers-transport.js");

/** Cria um alvo mínimo de eventos compatível com `addEventListener`/`removeEventListener`. */
function createFakeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type) {
      for (const fn of [...(listeners.get(type) || [])]) fn({ type });
    },
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** Prepara DOM fake do compositor com suporte a `.vox-toast` via `querySelector`. */
function setupPublishDom() {
  const dom = installFakeDocument();
  const ids = {};
  for (const id of ["inline-topic-body", "inline-topic-comm", "btn-inline-submit", "btn-inline-echo", "feed-inline-composer", "form-inline-topic"]) {
    ids[id] = new FakeEl(id);
    dom.add(ids[id]);
  }
  const origQuerySelector = dom.doc.querySelector;
  dom.doc.querySelector = (sel) => {
    if (sel === ".vox-toast") {
      return dom.doc.body.appended.findLast((el) => String(el.className || "").startsWith("vox-toast")) || null;
    }
    return origQuerySelector(sel);
  };
  FakeEl.prototype.appendChild ??= function appendChild(child) {
    (this.children ||= []).push(child);
    return child;
  };
  st.clearMedia();
  return { dom, ids };
}

test("scheduleCommit — undo() antes de 4 s cancela o timer, chama onUndo() e nunca chama onCommit()", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const target = createFakeTarget();
    let commits = 0;
    let undos = 0;
    const job = scheduleCommit({
      target,
      onCommit: () => { commits += 1; },
      onUndo: () => { undos += 1; },
    });
    assert.equal(job.isPending(), true);
    assert.equal(target.listenerCount("pagehide"), 1);
    mock.timers.tick(3999);
    assert.equal(commits, 0);
    job.undo();
    assert.equal(undos, 1);
    assert.equal(job.isPending(), false);
    assert.equal(target.listenerCount("pagehide"), 0);
    mock.timers.tick(5000);
    target.emit("pagehide");
    assert.equal(commits, 0);
  } finally {
    mock.timers.reset();
  }
});

test("scheduleCommit — após 4 s chama onCommit() exatamente 1 vez", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const target = createFakeTarget();
    let commits = 0;
    let undos = 0;
    const job = scheduleCommit({
      target,
      onCommit: () => { commits += 1; },
      onUndo: () => { undos += 1; },
    });
    mock.timers.tick(3999);
    assert.equal(commits, 0);
    mock.timers.tick(1);
    assert.equal(commits, 1);
    assert.equal(job.isPending(), false);
    assert.equal(target.listenerCount("pagehide"), 0);
    job.flush();
    job.undo();
    assert.equal(commits, 1);
    assert.equal(undos, 0);
  } finally {
    mock.timers.reset();
  }
});

test("scheduleCommit — evento pagehide faz flush imediato de onCommit() 1 vez e undo() posterior não faz nada", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const target = createFakeTarget();
    let commits = 0;
    let undos = 0;
    const job = scheduleCommit({
      target,
      onCommit: () => { commits += 1; },
      onUndo: () => { undos += 1; },
    });
    target.emit("pagehide");
    assert.equal(commits, 1);
    assert.equal(job.isPending(), false);
    assert.equal(target.listenerCount("pagehide"), 0);
    job.undo();
    mock.timers.tick(5000);
    target.emit("pagehide");
    assert.equal(commits, 1);
    assert.equal(undos, 0);
  } finally {
    mock.timers.reset();
  }
});

test("inline-publish — desfazer no toast cancela broadcast P2P e remove post otimista; após 4 s propaga", async () => {
  await cacheNode.clearLocalPosts();
  const { dom, ids } = setupPublishDom();
  const toasts = captureToasts(dom);
  const meshMessages = [];
  peersTransport.setBroadcastChannel({ postMessage: (msg) => meshMessages.push(msg) });
  try {
    const form = new FakeEl("form");
    const published = [];
    ids["inline-topic-body"].value = "Post com desfazer";
    await pub.executeInlinePublish(form, (s) => published.push(s), { cleanupRecordingState() {} });
    assert.equal(published.length, 1);
    assert.ok(await cacheNode.getLocalPost(published[0].id), "post salvo otimisticamente");
    assert.equal(meshMessages.length, 0, "broadcast P2P aguardando 4 s");
    const toast = dom.doc.querySelector(".vox-toast");
    const undoBtn = toast?.children?.find((c) => c.className === "vox-toast-undo");
    assert.ok(undoBtn, "botão Desfazer anexado ao toast");
    undoBtn.click();
    await new Promise((r) => setImmediate(r));
    assert.equal(await cacheNode.getLocalPost(published[0].id), null, "post local removido ao desfazer");
    mock.timers.tick(4500);
    assert.equal(meshMessages.length, 0, "broadcast cancelado após Desfazer");

    ids["inline-topic-body"].value = "Post confirmado";
    await pub.executeInlinePublish(form, (s) => published.push(s), { cleanupRecordingState() {} });
    assert.equal(meshMessages.length, 0);
    mock.timers.tick(4000);
    assert.equal(meshMessages.length, 1, "broadcast P2P enviado após 4 s");
    assert.equal(meshMessages[0].item.id, published[1].id);
  } finally {
    peersTransport.setBroadcastChannel(null);
    toasts.stop();
    dom.restore();
  }
});
