import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const host = await import("../client/js/open-frames-host.js");

test("open-frames-host - rejects unknown message types", () => {
  const msg = host.handleFrameMessage(
    { origin: "https://example.com", data: { type: "evil", payload: {} } },
    { allowedOrigins: ["https://example.com"] },
  );
  assert.equal(msg, null);
});

test("open-frames-host - accepts resize from allowed origin", () => {
  const msg = host.handleFrameMessage(
    { origin: "https://example.com", data: { type: "of:resize", payload: { height: 200 } } },
    { allowedOrigins: ["https://example.com"] },
  );
  assert.equal(msg.type, "of:resize");
  assert.equal(msg.payload.height, 200);
});

/** Janela falsa que guarda o ouvinte de `message`, e iframe falso com `sandbox` e janela própria. */
function fakeHost(sandbox) {
  let listener = null;
  const win = {
    addEventListener: (type, fn) => { if (type === "message") listener = fn; },
    removeEventListener: (type, fn) => { if (listener === fn) listener = null; },
  };
  const frameWin = { name: "frame" };
  const iframe = {
    contentWindow: frameWin,
    style: {},
    getAttribute: (name) => (name === "sandbox" ? sandbox : null),
  };
  const send = (ev) => listener?.(ev);
  return { win, iframe, frameWin, send, listening: () => listener !== null };
}

const resize = (height) => ({ type: "of:resize", payload: { height } });

test("open-frames-host - iframe sandbox sem allow-same-origin (origem \"null\") é atendido quando a mensagem vem da janela dele", () => {
  const h = fakeHost("allow-scripts allow-forms");
  const actions = [];
  host.attachOpenFrameHost({}, h.iframe, { allowedOrigins: ["http://localhost:8080"], onAction: (p) => actions.push(p), win: h.win });
  h.send({ origin: "null", source: h.frameWin, data: resize(300) });
  h.send({ origin: "null", source: h.frameWin, data: { type: "of:action", payload: { action: "sign", value: 1 } } });
  assert.equal(h.iframe.style.height, "300px");
  assert.deepEqual(actions, [{ action: "sign", value: 1 }]);
});

test("open-frames-host - origem \"null\" de outra janela (outro sandbox) é recusada", () => {
  const h = fakeHost("allow-scripts allow-forms");
  const actions = [];
  host.attachOpenFrameHost({}, h.iframe, { allowedOrigins: [host.OPAQUE_ORIGIN], onAction: (p) => actions.push(p), win: h.win });
  h.send({ origin: "null", source: { name: "outro" }, data: resize(300) });
  h.send({ origin: "null", source: { name: "outro" }, data: { type: "of:action", payload: { action: "sign" } } });
  assert.equal(h.iframe.style.height, undefined);
  assert.deepEqual(actions, []);
});

test("open-frames-host - iframe sem sandbox não ganha a origem \"null\"; desligar remove o ouvinte", () => {
  const h = fakeHost(null);
  const off = host.attachOpenFrameHost({}, h.iframe, { allowedOrigins: ["https://example.com"], win: h.win });
  h.send({ origin: "null", source: h.frameWin, data: resize(300) });
  assert.equal(h.iframe.style.height, undefined);
  h.send({ origin: "https://example.com", source: h.frameWin, data: resize(200) });
  assert.equal(h.iframe.style.height, "200px");
  off();
  assert.equal(h.listening(), false);
});

test("open-frames-host - isOpaqueSandbox lê o atributo sandbox", () => {
  const iframe = (v) => ({ getAttribute: () => v });
  assert.equal(host.isOpaqueSandbox(iframe("allow-scripts")), true);
  assert.equal(host.isOpaqueSandbox(iframe("")), true);
  assert.equal(host.isOpaqueSandbox(iframe("allow-scripts allow-same-origin")), false);
  assert.equal(host.isOpaqueSandbox(iframe(null)), false);
});
