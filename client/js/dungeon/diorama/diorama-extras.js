/**
 * @file Carregador sob demanda dos extras da lente Diorama (gestos e picking), fora do núcleo B1:
 * só roda com `vox.lab.diorama` ligado e entrega os módulos a `attachDioramaOverlay({extras})`.
 * @module dungeon/diorama/diorama-extras
 */
let extrasJob = null;

/**
 * Carrega sob demanda os extras da lente (gestos e picking) com `import()` dinâmico; o resultado é guardado,
 * então a segunda chamada reaproveita a primeira. Só deve ser chamada com `vox.lab.diorama` ligado.
 *
 * @returns {Promise<{attachDioramaGestures: Function, DIORAMA_KEYS_HELP: string, unprojectRay: Function, pickDioramaScene: Function}>} Extras para `attachDioramaOverlay({extras})`.
 */
export function loadDioramaExtras() {
  extrasJob ||= Promise.all([import("./diorama-input.js"), import("./diorama-pick.js")])
    .then(([input, pick]) => ({ attachDioramaGestures: input.attachDioramaGestures, DIORAMA_KEYS_HELP: input.DIORAMA_KEYS_HELP, unprojectRay: pick.unprojectRay, pickDioramaScene: pick.pickDioramaScene }))
    .catch((err) => { extrasJob = null; throw err; });
  return extrasJob;
}
