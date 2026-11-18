/**
 * @file Contêiner de modal avulso no <body>, para modais que abrem fora do #modal-container
 * (denúncia, apontamento). Criado sob demanda; limpar o conteúdo fecha o modal.
 */

/**
 * Garante um contêiner de modal no `<body>` pelo `id` (cria se não existir).
 * @param {string} id ID do elemento.
 * @param {Document} [doc=globalThis.document]
 * @returns {HTMLElement}
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

/**
 * Esvazia o contêiner do modal (fecha visualmente sem remover o nó).
 * @param {string} id ID do elemento.
 * @param {Document} [doc=globalThis.document]
 * @returns {void}
 */
export function clearModalHost(id, doc = globalThis.document) {
  const el = doc?.getElementById?.(id);
  if (el) el.innerHTML = "";
}
