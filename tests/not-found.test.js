import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "./setup.js";

const { renderNotFoundHtml } = await import("../client/js/app/screens-not-found.js");

describe("tela de página não encontrada", () => {
  it("mostra o endereço pedido escapado e os caminhos de volta", () => {
    const html = renderNotFoundHtml('#/x"><img src=x onerror=alert(1)>');
    assert.match(html, /Página não encontrada/);
    assert.ok(!html.includes("<img"), "o hash pedido não pode virar HTML");
    assert.match(html, /href="#\/"/);
    assert.match(html, /href="#\/voxpedia"/);
  });
});
