/**
 * @file Círculos territoriais da sidebar via {@link createKeyedList} (preserva nós entre hidratações).
 *
 * @module app/sidebar-circles-live
 */

import { createKeyedList } from "../shared/keyed-list.js";
import { escapeHtml } from "../shared/html.js";
import { setAfterShellMount } from "../render/shell.js";

/** @type {ReturnType<typeof createKeyedList>|null} */
let listCtrl = null;
/** @type {Element|null} */
let rowsHost = null;
let wired = false;

/**
 * Monta o cabeçalho e o host de linhas dentro do slot da sidebar.
 * @param {HTMLElement} slot Slot `#agora-sidebar-circles`.
 * @param {number} count Quantidade de círculos.
 * @returns {Element} Host das linhas.
 */
function ensureCirclesChrome(slot, count) {
  let host = slot.querySelector("[data-circles-rows]");
  if (host) {
    const countEl = slot.querySelector(".agora-circles-count");
    if (countEl) countEl.textContent = `${count} ${count === 1 ? "ativo" : "ativos"}`;
    return host;
  }
  slot.innerHTML = `
      <div class="agora-circles-head">
        <span class="agora-circles-title">Círculos territoriais</span>
        <span class="agora-circles-count">${count} ${count === 1 ? "ativo" : "ativos"}</span>
      </div>
      <div class="agora-circles-rows" data-circles-rows></div>`;
  return slot.querySelector("[data-circles-rows]");
}

/**
 * Cria ou atualiza o reconciliador para o host atual.
 * @param {Element} host Contêiner das linhas.
 * @returns {ReturnType<typeof createKeyedList>} Controlador.
 */
function ensureListController(host) {
  if (listCtrl && rowsHost === host) return listCtrl;
  rowsHost = host;
  listCtrl = createKeyedList({
    container: host,
    getKey: (c) => c.id,
    createNode: (c) => {
      const a = document.createElement("a");
      a.className = "agora-circle-row";
      a.dataset.circleId = String(c.id);
      updateCircleRow(a, c);
      return a;
    },
    updateNode: (node, c) => updateCircleRow(node, c)
  });
  return listCtrl;
}

/**
 * Atualiza href e textos de uma linha de círculo.
 * @param {HTMLElement} el Nó da linha.
 * @param {{ id: string, name?: string, title?: string, unread?: number }} c Comunidade.
 * @returns {void}
 */
function updateCircleRow(el, c) {
  const name = c.name || c.title || c.id;
  const unread = Number(c.unread || 0);
  el.setAttribute("href", `#/c/${encodeURIComponent(c.id)}`);
  el.innerHTML = `<span class="agora-circle-name">${escapeHtml(name)}</span>${
    unread > 0
      ? `<span class="agora-circle-meta">${unread} ${unread === 1 ? "nova" : "novas"}</span>`
      : ""
  }`;
}

/**
 * Hidrata o slot de círculos a partir do cache local.
 * @returns {Promise<void>}
 */
async function hydrateSidebarCircles() {
  const slot = document.getElementById("agora-sidebar-circles");
  if (!slot) return;
  try {
    const cacheNode = await import("../cache-node.js");
    const list = await cacheNode.getLocalCommunities?.();
    const items = (Array.isArray(list) ? list : []).filter((c) => c?.id).slice(0, 6);
    if (!items.length || !document.body.contains(slot)) return;
    const host = ensureCirclesChrome(slot, items.length);
    ensureListController(host).update(items);
    slot.hidden = false;
  } catch {
    /* sem IndexedDB: seção permanece oculta */
  }
}

/**
 * Liga hidratação pós-montagem da shell (uma vez).
 * @returns {void}
 */
export function wireSidebarCirclesLive() {
  if (wired) return;
  wired = true;
  setAfterShellMount(() => {
    listCtrl = null;
    rowsHost = null;
    void hydrateSidebarCircles();
  });
  void hydrateSidebarCircles();
}
