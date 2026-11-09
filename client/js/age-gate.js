/**
 * @file Piloto G1 só para maiores de 18 anos (ADR-020).
 * A confirmação é autodeclarada e fica só no aparelho: nenhuma data de nascimento, documento
 * ou idade é coletada nem enviada. Sem ela, o pacto de entrada não pode ser aceito.
 */

export const AGE_STORAGE_KEY = "vox-age-18-v1";
export const AGE_CHECKBOX_ID = "pact-age-18";

/** true se este aparelho já confirmou "tenho 18 anos ou mais". */
export function hasConfirmedAdult(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(AGE_STORAGE_KEY) || "null");
    return saved?.adult === true;
  } catch {
    return false;
  }
}

/** Grava a confirmação (só o fato e a data, nada mais). */
export function confirmAdult(now = Date.now(), storage = globalThis.localStorage) {
  storage?.setItem(AGE_STORAGE_KEY, JSON.stringify({ adult: true, confirmedAt: now, v: 1 }));
}

export function renderAdultCheckHtml() {
  return `
    <label class="pact-age-check" for="${AGE_CHECKBOX_ID}">
      <input type="checkbox" id="${AGE_CHECKBOX_ID}" required>
      <span>Tenho <strong>18 anos ou mais</strong>. Nesta fase de teste, o Vox é só para adultos.</span>
    </label>`;
}

/**
 * Devolve a caixa de 18+; se o HTML do pacto veio sem ela (ex.: cache misturando versões),
 * insere antes dos botões. Sem isso, os botões ficariam desativados para sempre.
 */
export function ensureAdultCheck(doc, anchor) {
  const existing = doc?.getElementById?.(AGE_CHECKBOX_ID) || null;
  if (existing || !anchor?.insertAdjacentHTML) return existing;
  const actions = anchor.closest?.(".modal-actions") || anchor;
  actions.insertAdjacentHTML("beforebegin", renderAdultCheckHtml());
  return doc.getElementById(AGE_CHECKBOX_ID) || null;
}

/** Os botões do pacto só ficam ativos com a caixa marcada. Devolve a caixa (ou null). */
export function bindAdultCheck(doc, buttons = []) {
  const box = ensureAdultCheck(doc, buttons.find(Boolean));
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
