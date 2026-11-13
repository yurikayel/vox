import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const render = await import("../client/js/render.js");
const { normalizePostAspect } = await import("../client/js/render/util.js");

const QUOTE = 'x" data-injetado="1';

test("escape - formato da foto vindo de outro aparelho só aceita valores conhecidos", () => {
  assert.equal(normalizePostAspect("16:9"), "16:9");
  assert.equal(normalizePostAspect(QUOTE), "original");
  assert.equal(normalizePostAspect(undefined), "original");
  const html = render.renderPostItem({ id: "p_aspect", author: "vx_autor000000001", title: "Foto", image: "https://exemplo.org/a.jpg", aspectRatio: QUOTE, ts: 1 });
  assert.ok(!html.includes("data-injetado"), "o formato não abre atributo novo no HTML");
  assert.ok(html.includes("post-aspect-original"));
});

test("escape - endereços de relay nas configurações não quebram o atributo value", () => {
  const main = { innerHTML: "" };
  render.renderNetworkSettings(main, { settings: {}, customSignalingUrl: QUOTE, customRelayHttpUrl: QUOTE, customRelayBuddyHttpUrl: QUOTE });
  assert.ok(!main.innerHTML.includes('" data-injetado="1'), "aspas viram &quot;");
});
