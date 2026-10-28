import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as storyCard from "../client/js/story-card.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");

test("story-card - wrapTextLines splits long text into capped lines with ellipsis", () => {
  const fakeCtx = {
    measureText: (str) => ({ width: str.length * 10 }),
  };

  const lines = storyCard.wrapTextLines(fakeCtx, "Esta é uma manchete muito longa que deve ser quebrada em várias linhas de teste", 120, 3);
  assert.ok(lines.length <= 3);
  assert.ok(lines[lines.length - 1].endsWith("…") || lines.length < 3);
});

test("story-card - dimensions are defined as 9:16 vertical standard", () => {
  assert.equal(storyCard.STORY_CARD_WIDTH, 540);
  assert.equal(storyCard.STORY_CARD_HEIGHT, 960);
});

test("story-card - renderStoryCardCanvas draws story card elements in DOM environment", () => {
  const drawCalls = [];
  const fakeCtx = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect: (...args) => drawCalls.push(["fillRect", ...args]),
    strokeRect: (...args) => drawCalls.push(["strokeRect", ...args]),
    fillText: (...args) => drawCalls.push(["fillText", ...args]),
    beginPath: () => drawCalls.push(["beginPath"]),
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    measureText: (str) => ({ width: str.length * 8 }),
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: (tag) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => fakeCtx,
          toDataURL: () => "data:image/png;base64,mock",
          toBlob: (cb) => cb(new Blob(["mock"], { type: "image/png" })),
        };
      }
      return { appendChild() {}, click() {} };
    },
    body: { appendChild() {}, removeChild() {} },
  };

  try {
    const canvas = storyCard.renderStoryCardCanvas({
      id: "post_story_1",
      title: "Salário Mínimo e Soberania Popular",
      body: "Vamos ocupar as redes com a verdade sobre os direitos.",
      author: "@maria_acre",
    });

    assert.ok(canvas);
    assert.equal(canvas.width, 540);
    assert.equal(canvas.height, 960);

    const textCalls = drawCalls.filter((c) => c[0] === "fillText").map((c) => c[1]);
    assert.ok(textCalls.some((t) => t.includes("VOX • PRAÇA CÍVICA SOBERANA")));
    assert.ok(textCalls.some((t) => t.includes("Salário Mínimo")));
    assert.ok(textCalls.some((t) => t.includes("@maria_acre")));
  } finally {
    globalThis.document = prevDoc;
  }
});

test("story-card - sw.js caches story-card.js", () => {
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.ok(sw.includes('"./js/story-card.js"'));
});
