import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoute } from "../client/js/app/route-parse.js";
import { renderVoxpedia } from "../client/js/render/voxpedia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellSrc = fs.readFileSync(
  path.join(__dirname, "../client/js/render/shell.js"),
  "utf8"
);

function withLocation({ hash = "" }, fn) {
  const loc = { hash, search: "" };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("voxpedia route", () => {
  it("resolves #/voxpedia", () => {
    withLocation({ hash: "#/voxpedia" }, () => {
      assert.deepEqual(parseRoute(), { name: "voxpedia" });
    });
  });

  it("resolves #/ajuda/voxpedia", () => {
    withLocation({ hash: "#/ajuda/voxpedia" }, () => {
      assert.deepEqual(parseRoute(), { name: "voxpedia" });
    });
  });
});

describe("renderVoxpedia", () => {
  const html = renderVoxpedia();

  it("includes hero and section headings", () => {
    assert.match(html, /<h1>Voxpedia<\/h1>/);
    assert.match(html, /Começar/);
    assert.match(html, /Mensagens/);
    assert.match(html, /Comunidades/);
    assert.match(html, /Rede cooperativa/);
    assert.match(html, /Privacidade &amp; dados|Privacidade & dados/);
    assert.match(html, /Para curiosos \(técnico\)/);
  });

  it("has nested details layers", () => {
    const layerCount = (html.match(/class="voxpedia-layer/g) || []).length;
    assert.ok(layerCount >= 6, `expected multiple voxpedia-layer, got ${layerCount}`);
    assert.ok(html.includes("<details"), "missing details elements");
    assert.ok(html.includes("<summary"), "missing summary elements");
    const firstDetails = html.indexOf("<details");
    const nested = html.indexOf("<details", firstDetails + 1);
    const between = html.slice(firstDetails, nested);
    assert.ok(between.includes("</details>") || html.slice(nested).includes("<details"),
      "expected nesting or sibling layers");
  });

  it("mentions key product summaries", () => {
    assert.match(html, /Pacto Vox/i);
    assert.match(html, /vx_/);
    assert.match(html, /IndexedDB/i);
  });
});

describe("voxpedia shell nav", () => {
  it("sidebar link to #/voxpedia", () => {
    assert.match(shellSrc, /href="#\/voxpedia"/);
    assert.match(shellSrc, /Voxpedia/);
    assert.match(shellSrc, /activeTab === "voxpedia"/);
  });
});
