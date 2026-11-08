/**
 * LAN-11 — aviso de permanência antes de gravar no Arweave.
 * O post sempre vai para a malha P2P. Gravar no Arweave é permanente e público: não dá para apagar.
 * Na 1ª vez (ou sempre, se a pessoa não pedir para lembrar) o app pergunta; "só na malha" não sobe nada.
 */

export const PERMANENCE_CHOICE_KEY = "vox-permanence-choice-v1";
export const CHOICE_PERMANENT = "permanent";
export const CHOICE_MESH = "mesh";

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

export function getPermanenceChoice() {
  try {
    const v = globalThis.localStorage?.getItem(PERMANENCE_CHOICE_KEY);
    return v === CHOICE_PERMANENT || v === CHOICE_MESH ? v : "";
  } catch {
    return "";
  }
}

export function setPermanenceChoice(choice) {
  try {
    if (choice === CHOICE_PERMANENT || choice === CHOICE_MESH) globalThis.localStorage?.setItem(PERMANENCE_CHOICE_KEY, choice);
    else globalThis.localStorage?.removeItem(PERMANENCE_CHOICE_KEY);
  } catch {}
}

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

/** Abre o modal e resolve com "permanent" ou "mesh". Sem DOM, resolve "mesh" (nunca grava sem consentimento). */
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

/** true = pode gravar no Arweave. Usa a escolha lembrada; senão pergunta. */
export async function confirmPermanentPublish({ ask = askPermanenceChoice } = {}) {
  const remembered = getPermanenceChoice();
  if (remembered) return remembered === CHOICE_PERMANENT;
  const { choice, remember } = await ask();
  if (remember) setPermanenceChoice(choice);
  return choice === CHOICE_PERMANENT;
}

/** Resultado padrão quando a pessoa escolhe ficar só na malha. */
export const MESH_ONLY_RESULT = Object.freeze({ success: false, skipped: CHOICE_MESH });
