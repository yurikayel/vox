/**
 * @file Aviso de permanência (LAN-11) antes de gravar no Arweave.
 *
 * Publicação na malha é sempre local/temporária; Arweave é permanente e exige consentimento explícito.
 */

/** Chave no `localStorage` da escolha lembrada (`permanent` ou `mesh`). @type {string} */
export const PERMANENCE_CHOICE_KEY = "vox-permanence-choice-v1";
/** Valor da escolha permanente. @type {string} */
export const CHOICE_PERMANENT = "permanent";
/** Valor da escolha só na malha. @type {string} */
export const CHOICE_MESH = "mesh";

/** Textos do modal de permanência em português. @type {Readonly<object>} */
export const PERMANENCE_NOTICE_PT = Object.freeze({
  title: "Gravar para sempre?",
  body:
    "Além da malha P2P, este post pode ser gravado no Arweave. Lá ele fica público e permanente: " +
    "qualquer pessoa pode ler, copiar e guardar, e nem você nem o Vox conseguem apagar depois. " +
    "Não publique dados pessoais seus ou de outras pessoas (CPF, endereço, telefone, saúde).",
  permanent: "Gravar no Arweave (permanente)",
  mesh: "Só na malha desta vez",
  remember: "Lembrar minha escolha",
});

/**
 * Escolha de permanência lembrada neste aparelho, ou string vazia.
 * @returns {string}
 */
export function getPermanenceChoice() {
  try {
    const v = globalThis.localStorage?.getItem(PERMANENCE_CHOICE_KEY);
    return v === CHOICE_PERMANENT || v === CHOICE_MESH ? v : "";
  } catch {
    return "";
  }
}

/**
 * Grava ou apaga a escolha lembrada de permanência.
 * @param {string} choice `permanent`, `mesh` ou outro valor para limpar.
 * @returns {void}
 */
export function setPermanenceChoice(choice) {
  try {
    if (choice === CHOICE_PERMANENT || choice === CHOICE_MESH) globalThis.localStorage?.setItem(PERMANENCE_CHOICE_KEY, choice);
    else globalThis.localStorage?.removeItem(PERMANENCE_CHOICE_KEY);
  } catch {}
}

/**
 * HTML do modal de escolha Arweave vs só malha.
 * @returns {string}
 */
export function renderPermanenceModalHtml() {
  const t = PERMANENCE_NOTICE_PT;
  return `
    <div class="modal-overlay modal-sheet" id="permanence-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="permanence-title">
      <div class="modal-dialog modal-card permanence-modal">
        <h2 id="permanence-title" style="margin-top:0;">${t.title}</h2>
        <p class="desc">${t.body}</p>
        <label style="display:flex; gap:0.5rem; align-items:center; margin:0.5rem 0 0.75rem;">
          <input type="checkbox" id="permanence-remember" /> <span>${t.remember}</span>
        </label>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <button type="button" class="btn btn-primary" id="btn-permanence-permanent">${t.permanent}</button>
          <button type="button" class="btn btn-outline" id="btn-permanence-mesh">${t.mesh}</button>
        </div>
      </div>
    </div>`;
}

/**
 * Abre o modal e resolve com `permanent` ou `mesh`; sem DOM devolve malha (nunca grava sem UI).
 * @param {Document|null} [doc=globalThis.document] Documento da página.
 * @returns {Promise<{ choice: string, remember: boolean }>}
 */
export function askPermanenceChoice(doc = globalThis.document) {
  if (!doc?.createElement || !doc.body) return Promise.resolve({ choice: CHOICE_MESH, remember: false });
  return new Promise((resolve) => {
    const holder = doc.createElement("div");
    holder.innerHTML = renderPermanenceModalHtml();
    doc.body.appendChild(holder);
    const finish = (choice) => {
      const remember = Boolean(holder.querySelector("#permanence-remember")?.checked);
      holder.remove();
      resolve({ choice, remember });
    };
    holder.querySelector("#btn-permanence-permanent")?.addEventListener("click", () => finish(CHOICE_PERMANENT));
    holder.querySelector("#btn-permanence-mesh")?.addEventListener("click", () => finish(CHOICE_MESH));
  });
}

/**
 * Indica se pode publicar no Arweave (escolha lembrada ou modal).
 * @param {object} [options={}]
 * @param {typeof askPermanenceChoice} [options.ask=askPermanenceChoice] Função de pergunta injetável.
 * @returns {Promise<boolean>}
 */
export async function confirmPermanentPublish({ ask = askPermanenceChoice } = {}) {
  const remembered = getPermanenceChoice();
  if (remembered) return remembered === CHOICE_PERMANENT;
  const { choice, remember } = await ask();
  if (remember) setPermanenceChoice(choice);
  return choice === CHOICE_PERMANENT;
}

/** Resultado padrão quando a pessoa escolhe ficar só na malha. */
export const MESH_ONLY_RESULT = Object.freeze({ success: false, skipped: CHOICE_MESH });
