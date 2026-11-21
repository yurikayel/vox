import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { renderStepNav, COMPOSE_TOPIC_STEPS } from "../client/js/render/compose-steps.js";

const PUBLISH_STATUS_ID = "vox-compose-publish-status";

function createMockClassList(el) {
  const set = new Set();
  return {
    _c: set,
    add(...xs) {
      xs.forEach((x) => set.add(x));
      el.className = [...set].join(" ");
    },
    remove(...xs) {
      xs.forEach((x) => set.delete(x));
      el.className = [...set].join(" ");
    },
    contains(x) {
      return set.has(x);
    },
  };
}

function mockEl(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    className: "",
    hidden: false,
    children: [],
    attributes: {},
    style: { cssText: "" },
    textContent: "",
    tabIndex: 0,
    parent: null,
    focus() {
      globalThis.__voxFocused = el;
    },
    appendChild(child) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
    querySelector(sel) {
      return sel === ".inline-composer-collapsed" ? el._collapsed || null : null;
    },
    setAttribute(k, v) {
      el.attributes[k] = String(v);
    },
    getAttribute(k) {
      return el.attributes[k] ?? null;
    },
  };
  el.classList = createMockClassList(el);
  return el;
}

test("compose-focus — última etapa expõe região de anúncio para foco pós-publicar", () => {
  const html = renderStepNav(COMPOSE_TOPIC_STEPS.length - 1, { last: true, submitId: "btn-submit-topic" });
  assert.ok(html.includes(`id="${PUBLISH_STATUS_ID}"`), "falta região de status na revisão");
  assert.ok(html.includes('role="status"'));
  const mid = renderStepNav(1, { last: false });
  assert.ok(!mid.includes(PUBLISH_STATUS_ID), "etapas intermediárias não trazem a região");
});

test("compose-focus — feed recolhido recebe foco após publicar", async () => {
  const { focusAfterComposePublish } = await import("../client/js/render/compose-chrome.js");
  const collapsed = mockEl("div");
  collapsed.classList.add("inline-composer-collapsed");
  const root = mockEl("div");
  root.id = "feed-inline-composer";
  root.classList.add("is-collapsed");
  root._collapsed = collapsed;

  globalThis.__voxFocused = null;
  globalThis.document = {
    getElementById: (id) => (id === "feed-inline-composer" ? root : null),
    body: mockEl("body"),
    createElement: (tag) => mockEl(tag),
  };

  focusAfterComposePublish();
  assert.equal(globalThis.__voxFocused, collapsed);
});

test("compose-focus — sem inline recolhido, foco e anúncio vão para a região de status", async () => {
  const { COMPOSE_PUBLISH_STATUS_ID, ensureComposePublishStatus, focusAfterComposePublish } = await import(
    "../client/js/render/compose-chrome.js"
  );
  const body = mockEl("body");
  const registry = new Map();
  globalThis.__voxFocused = null;
  globalThis.document = {
    getElementById: (id) => registry.get(id) ?? null,
    body,
    createElement: (tag) => mockEl(tag),
  };
  body.appendChild = (child) => {
    if (child.id) registry.set(child.id, child);
    child.parent = body;
    body.children.push(child);
    return child;
  };

  focusAfterComposePublish({ message: "Post publicado." });
  assert.equal(globalThis.__voxFocused?.id, COMPOSE_PUBLISH_STATUS_ID);
  await new Promise((r) => queueMicrotask(r));
  assert.equal(globalThis.__voxFocused?.textContent, "Post publicado.");
  assert.equal(ensureComposePublishStatus()?.textContent, "Post publicado.");
});