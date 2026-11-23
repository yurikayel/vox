/**
 * @file Piloto G1 só para maiores de 18 anos (ADR-020).
 * A confirmação é autodeclarada e fica só no aparelho: nenhuma data de nascimento, documento
 * ou idade é coletada nem enviada. Sem ela, o pacto de entrada não pode ser aceito.
 */

/** Chave no `localStorage` da confirmação de maioridade (só neste aparelho). @type {string} */
export const AGE_STORAGE_KEY = "vox-age-18-v1";
/** Id do checkbox de 18+ no HTML do pacto de entrada. @type {string} */
export const AGE_CHECKBOX_ID = "pact-age-18";

/**
 * Indica se este aparelho já confirmou maioridade.
 * @param {Storage|null} [storage=globalThis.localStorage] Armazenamento local.
 * @returns {boolean}
 */
export function hasConfirmedAdult(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(AGE_STORAGE_KEY) || "null");
    return saved?.adult === true;
  } catch {
    return false;
  }
}

/**
 * Grava a confirmação de maioridade (só o fato e o instante; sem dados pessoais).
 * @param {number} [now=Date.now()] Instantâneo da confirmação, em ms.
 * @param {Storage|null} [storage=globalThis.localStorage] Armazenamento local.
 * @returns {void}
 */
export function confirmAdult(now = Date.now(), storage = globalThis.localStorage) {
  storage?.setItem(AGE_STORAGE_KEY, JSON.stringify({ adult: true, confirmedAt: now, v: 1 }));
}

/**
 * HTML do checkbox obrigatório de 18+ para inserir no pacto de entrada.
 * @returns {string}
 */
export function renderAdultCheckHtml() {
  return `
    <label class="pact-age-check" for="${AGE_CHECKBOX_ID}">
      <input type="checkbox" id="${AGE_CHECKBOX_ID}" required>
      <span>Tenho <strong>18 anos ou mais</strong>. Nesta fase de teste, o Vox é só para adultos.</span>
    </label>`;
}

/**
 * Garante o checkbox de 18+ no DOM do pacto (insere antes dos botões se faltar).
 * @param {Document|null} doc Documento da página.
 * @param {Element|null} anchor Âncora próxima aos botões do pacto.
 * @returns {HTMLInputElement|null}
 */
export function ensureAdultCheck(doc, anchor) {
  const existing = doc?.getElementById?.(AGE_CHECKBOX_ID) || null;
  if (existing || !anchor?.insertAdjacentHTML) return existing;
  const actions = anchor.closest?.(".modal-actions") || anchor;
  actions.insertAdjacentHTML("beforebegin", renderAdultCheckHtml());
  return doc.getElementById(AGE_CHECKBOX_ID) || null;
}

/**
 * Liga o checkbox de 18+ à habilitação dos botões do pacto.
 * @param {Document|null} doc Documento da página.
 * @param {Array<HTMLButtonElement|null>} [buttons=[]] Botões a habilitar somente com a caixa marcada.
 * @returns {HTMLInputElement|null}
 */
export function bindAdultCheck(doc, buttons = []) {
  const box = ensureAdultCheck(doc, buttons.find(Boolean));
  /**
   * Habilita os botões conforme a caixa de confirmação de idade está marcada.
   */
  const sync = () => {
    const ok = Boolean(box?.checked);
    for (const btn of buttons) {
      if (!btn) continue;
      btn.disabled = !ok;
      btn.setAttribute?.("aria-disabled", String(!ok));
    }
  };
  box?.addEventListener?.("change", sync);
  sync();
  return box;
}
