/**
 * @file Cobertura de `app/sidebar-circles-live.js` (lote T1): hidratação e reconciliação dos círculos da sidebar.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, makeEl } from "./helpers/cov-t1-dom.mjs";
import * as cacheNode from "../client/js/cache-node.js";
import { renderShell } from "../client/js/render/shell.js";
import { wireSidebarCirclesLive } from "../client/js/app/sidebar-circles-live.js";

const dom = installFakeDom();
const settle = () => new Promise((r) => setTimeout(r, 40));

/** Host de linhas com a lista ligada que o reconciliador usa (firstChild, insertBefore, removeChild). */
function makeRowsHost() {
  const host = makeEl();
  host.nodes = [];
  Object.defineProperty(host, "firstChild", { get: () => host.nodes[0] || null });
  host.insertBefore = (node, ref) => {
    const at = host.nodes.indexOf(node);
    if (at >= 0) host.nodes.splice(at, 1);
    const to = ref ? host.nodes.indexOf(ref) : host.nodes.length;
    host.nodes.splice(to, 0, node);
    host.nodes.forEach((n, i) => {
      n.parentNode = host;
      n.nextSibling = host.nodes[i + 1] || null;
    });
  };
  host.removeChild = (n) => {
    host.nodes.splice(host.nodes.indexOf(n), 1);
    host.nodes.forEach((x, i) => { x.nextSibling = host.nodes[i + 1] || null; });
  };
  return host;
}

/** Slot que cria cabeçalho e host de linhas só depois de receber `innerHTML`. */
function makeSlot() {
  const slot = makeEl("agora-sidebar-circles");
  slot.hidden = true;
  slot.count = makeEl();
  slot.rows = makeRowsHost();
  slot.querySelector = (sel) => {
    if (!slot.innerHTML) return null;
    if (sel === "[data-circles-rows]") return slot.rows;
    return sel === ".agora-circles-count" ? slot.count : null;
  };
  dom.byId.set("agora-sidebar-circles", slot);
  return slot;
}

async function saveCommunity(id, title) {
  await cacheNode.saveLocalPost({ id: `c_${id}`, type: "community", communityId: id, title, ts: 1000 });
}

test("círculos — sem slot na página não faz nada e não quebra", async () => {
  wireSidebarCirclesLive();
  await settle();
  assert.equal(dom.byId.has("agora-sidebar-circles"), false);
});

test("círculos — sem comunidades locais o slot continua oculto", async () => {
  const slot = makeSlot();
  renderShell({ walletAddress: "u", activeTab: "home" });
  dom.byId.set("agora-sidebar-circles", slot);
  await settle();
  assert.equal(slot.hidden, true);
  assert.equal(slot.innerHTML, "");
});

test("círculos — comunidades locais viram linhas com contagem e o slot aparece", async () => {
  await saveCommunity("horta", "Horta <b>");
  await saveCommunity("praca", "Praça");
  const slot = makeSlot();
  renderShell({ walletAddress: "u", activeTab: "home" });
  dom.byId.set("agora-sidebar-circles", slot);
  await settle();
  assert.equal(slot.hidden, false);
  assert.match(slot.innerHTML, /Círculos territoriais/);
  assert.match(slot.innerHTML, /2 ativos/);
  assert.equal(slot.rows.nodes.length, 2);
  const row = slot.rows.nodes.find((n) => n.dataset.circleId === "horta");
  assert.equal(row.getAttribute("href"), "#/c/horta");
  assert.match(row.innerHTML, /Horta &lt;b&gt;/, "o nome é escapado");
  assert.doesNotMatch(row.innerHTML, /nova/, "sem não lidas, sem etiqueta");
});

test("círculos — reidratar com o chrome pronto atualiza só a contagem e reaproveita as linhas", async () => {
  const slot = makeSlot();
  slot.innerHTML = "<x>";
  renderShell({ walletAddress: "u", activeTab: "home" });
  dom.byId.set("agora-sidebar-circles", slot);
  await settle();
  assert.equal(slot.count.textContent, "2 ativos");
  assert.equal(slot.rows.nodes.length, 2);
  assert.equal(slot.innerHTML, "<x>", "cabeçalho não é refeito");
});
