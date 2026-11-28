/**
 * @file Utilitários de foco acessível, preservação de `<details>`, scroll da crônica, cópia de convite e overlay 3D pós-redraw.
 * @module dungeon/dungeon-dom-focus
 */

/**
 * Monta URL completa de convite P2P preservando origem/caminho quando disponível no navegador.
 * @param {string} inviteHref Hash relativo `#/dungeon/entrar/...`.
 * @returns {string} URL completa ou hash relativo em ambiente sem `location`.
 */
export function buildFullInviteUrl(inviteHref) {
  const raw = String(inviteHref || "").trim();
  if (!raw) return "";
  const loc = globalThis.location;
  if (loc?.origin && loc.origin !== "null") {
    return `${loc.origin}${loc.pathname || "/"}${raw}`;
  }
  return raw;
}

/**
 * Copia o link completo de convite P2P para a área de transferência do navegador.
 * @param {object} state Estado da sessão dungeon.
 * @returns {Promise<boolean>} `true` quando copiado com sucesso.
 */
export async function copyInviteLinkToClipboard(state) {
  const url = buildFullInviteUrl(state.inviteHref);
  if (!url) return false;
  try {
    if (typeof globalThis.navigator?.clipboard?.writeText === "function") {
      await globalThis.navigator.clipboard.writeText(url);
      state.campaignNotice = "Link de convite copiado para a área de transferência.";
      return true;
    }
  } catch {
    /* fallback abaixo */
  }
  state.campaignNotice = "Selecione e copie o link de convite manualmente.";
  return false;
}

function buildFocusSelector(el) {
  if (!el || typeof el !== "object") return "";
  if (el.id) return `#${el.id}`;
  const action = el.dataset?.dungeon;
  if (!action) return "";
  const attrs = [
    ["data-token-id", el.dataset.tokenId],
    ["data-item-id", el.dataset.itemId],
    ["data-ability", el.dataset.ability],
    ["data-action-id", el.dataset.actionId],
    ["data-mode", el.dataset.mode],
    ["data-tool", el.dataset.tool],
    ["data-condition-id", el.dataset.conditionId],
    ["data-floor-z", el.dataset.floorZ],
    ["data-note-id", el.dataset.noteId],
    ["data-preset", el.dataset.preset],
  ].filter(([, v]) => v !== undefined && v !== "");
  const suffix = attrs.map(([k, v]) => `[${k}="${String(v).replace(/"/g, "")}"]`).join("");
  return `[data-dungeon="${action}"]${suffix}`;
}

function captureActiveDraft(active, inside) {
  if (!inside || !active?.id || typeof active.value !== "string" || active.type === "password") return null;
  return { id: active.id, value: active.value };
}

function captureDetailsMap(container) {
  const detailsMap = {};
  if (typeof container?.querySelectorAll !== "function") return detailsMap;
  for (const det of container.querySelectorAll("details[data-dungeon-details]")) {
    const key = det.dataset?.dungeonDetails;
    if (key) detailsMap[key] = Boolean(det.open);
  }
  for (const radio of container.querySelectorAll("input[data-dungeon-tab]")) detailsMap[`tab:${radio.id}`] = Boolean(radio.checked);
  return detailsMap;
}

/**
 * Captura foco atual, rascunho digitado e estado aberto/fechado dos `<details>` antes de redesenhar o contêiner.
 * @param {HTMLElement|object} container Contêiner raiz do Dungeon.
 * @returns {{ focusSel: string, activeDraft: { id: string, value: string }|null, detailsMap: Record<string, boolean>, prevTurns: number }} Snapshot leve.
 */
export function captureUiViewState(container) {
  const doc = container?.ownerDocument || globalThis.document;
  const active = doc?.activeElement;
  const inside = Boolean(active && typeof container?.contains === "function" && container.contains(active));
  const prevTurns = typeof container?.querySelectorAll === "function"
    ? container.querySelectorAll(".dungeon-turn-card").length
    : 0;
  return {
    focusSel: inside ? buildFocusSelector(active) : "",
    activeDraft: captureActiveDraft(active, inside),
    detailsMap: captureDetailsMap(container),
    prevTurns,
  };
}

function restoreDetailsStates(container, detailsMap) {
  if (!detailsMap || typeof container.querySelectorAll !== "function") return;
  for (const det of container.querySelectorAll("details[data-dungeon-details]")) {
    const key = det.dataset?.dungeonDetails;
    if (key && key in detailsMap) det.open = detailsMap[key];
  }
  for (const radio of container.querySelectorAll("input[data-dungeon-tab]")) {
    const key = `tab:${radio.id}`;
    if (key in detailsMap) radio.checked = detailsMap[key];
  }
}

function autoScrollChronicle(container, prevTurns) {
  const list = container.querySelector(".dungeon-chronicle-list");
  if (!list || typeof list.scrollHeight !== "number" || typeof container.querySelectorAll !== "function") return;
  const curTurns = container.querySelectorAll(".dungeon-turn-card").length;
  if (curTurns > (prevTurns || 0)) list.scrollTop = list.scrollHeight;
}

function restoreActiveDraft(container, activeDraft, preserveDraft) {
  if (!preserveDraft || !activeDraft?.id) return;
  const input = container.querySelector(`#${activeDraft.id}`);
  if (input && typeof input.value === "string" && !input.value) input.value = activeDraft.value;
}

/**
 * Restaura estado de `<details>`, rascunho de entrada, foco de teclado e auto-scroll da crônica após redesenhar.
 * @param {HTMLElement|object} container Contêiner raiz do Dungeon.
 * @param {{ focusSel?: string, activeDraft?: { id: string, value: string }|null, detailsMap?: Record<string, boolean>, prevTurns?: number }} snap Snapshot capturado.
 * @param {string} [focusOverride=""] Seletor explícito prioritário.
 * @param {boolean} [preserveDraft=false] Se `true`, preserva texto ainda não submetido no input focado.
 * @returns {void}
 */
export function restoreUiViewState(container, snap = {}, focusOverride = "", preserveDraft = false) {
  if (!container || typeof container.querySelector !== "function") return;
  restoreDetailsStates(container, snap.detailsMap);
  autoScrollChronicle(container, snap.prevTurns);
  restoreActiveDraft(container, snap.activeDraft, preserveDraft);
  const sel = focusOverride || snap.focusSel || "";
  if (!sel) return;
  try {
    container.querySelector(sel)?.focus?.();
  } catch {
    /* seletor opcional */
  }
}

/**
 * Dispara o overlay de dados 3D sob demanda após o redesenho da tela (evitando destruição imediata).
 * @param {HTMLElement|object} container Contêiner raiz.
 * @param {object} rollResult Resultado de `rollDiceFormula` (ou `{ ok, attack }`).
 * @param {boolean} enabled Preferência de dados 3D ativa.
 * @returns {Promise<void>}
 */
export async function showDice3dAfterRedraw(container, rollResult, enabled) {
  const payload = rollResult?.attack?.ok ? rollResult.attack : rollResult;
  if (!enabled || !payload?.ok) return;
  try {
    const mod = await import("./dice-3d.js");
    mod.mountDice3dOverlay(container, payload);
  } catch {
    /* overlay opcional */
  }
}

/**
 * Entrega o artefato exportado: pelo callback do chamador, ou baixando por um link temporário.
 * @param {{ bytes: Uint8Array, mime: string, filename: string }} artifact Arquivo pronto.
 * @param {Function} [onDownload] Callback que assume a entrega (testes e janelas sem DOM).
 * @returns {*} Retorno do callback, ou `undefined` ao baixar.
 */
export function triggerBrowserDownload(artifact, onDownload) {
  if (typeof onDownload === "function") return onDownload(artifact);
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return undefined;
  const blob = new Blob([artifact.bytes], { type: artifact.mime });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = artifact.filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
  return undefined;
}
