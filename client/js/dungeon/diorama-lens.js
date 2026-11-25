/**
 * @file Flag local `vox.lab.diorama` e pílula de modos da lente Diorama do Subversus — única
 * definição, carregada com a mesa (sem arrastar o WebGL, que segue lazy).
 * @module dungeon/diorama-lens
 */

/** Chave de feature flag local que habilita a lente Diorama 2.5D/3D (única leitura no código). */
export const DIORAMA_FLAG_KEY = "vox.lab.diorama";

const DIORAMA_MODE_LABELS = Object.freeze([["2d", "2D"], ["iso", "Iso"], ["3d", "3D"], ["fp", "1ª"]]);

/**
 * Verifica se a flag local `vox.lab.diorama` está ligada.
 *
 * @param {Storage|null} [storage] Armazenamento local opcional (default `globalThis.localStorage`).
 * @returns {boolean} `true` quando a lente Diorama está habilitada.
 */
export function isDioramaFlagEnabled(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(DIORAMA_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Renderiza a pílula compacta `2D | Iso | 3D | 1ª` (única definição) do canto do canvas do Subversus.
 *
 * @param {"2d"|"iso"|"3d"|"fp"} [activeMode="2d"] Modo de câmera atual.
 * @returns {string} HTML da pílula de modos de câmera.
 */
export function renderDioramaModePill(activeMode = "2d") {
  const btns = DIORAMA_MODE_LABELS.map(([id, label]) => (
    `<button type="button" class="dungeon-chip-btn${id === activeMode ? " is-selected" : ""}" data-dungeon="diorama-mode" data-mode="${id}" aria-pressed="${id === activeMode}">${label}</button>`
  )).join("");
  return `<div class="subversus-diorama-pill" role="group" aria-label="Modo de câmera do Subversus">${btns}</div>`;
}
