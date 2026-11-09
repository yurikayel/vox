/**
 * @file Contêiner de modal avulso no <body>, para modais que abrem fora do #modal-container
 * (denúncia, apontamento). Criado sob demanda; limpar o conteúdo fecha o modal.
 */

export function modalHost(id, doc = globalThis.document) {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement("div");
    el.id = id;
    doc.body.appendChild(el);
  }
  return el;
}

export function clearModalHost(id, doc = globalThis.document) {
  const el = doc?.getElementById?.(id);
  if (el) el.innerHTML = "";
}
