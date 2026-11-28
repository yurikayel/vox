/**
 * @file Marca os campos de formulário da ficha que têm erro: `aria-invalid` e `aria-describedby` apontando para o aviso
 * da lista de erros (WCAG 3.3.1). Funções puras: devolvem texto de atributo, sem DOM.
 * @module dungeon/field-issues
 */

/**
 * Id do `<li>` de um aviso, para o `aria-describedby` do campo.
 * @param {string} prefix Prefixo da lista de avisos (um por tela).
 * @param {number} index Posição do aviso na lista.
 * @returns {string} Id do elemento.
 */
export function issueId(prefix, index) {
  return `${prefix}-${index}`;
}

/**
 * Atributos do campo `field`: `aria-invalid="true"` e `aria-describedby` com os avisos dele; vazio sem erro nesse campo.
 * @param {Array<{field: string}>} issues Avisos da tela.
 * @param {string} field Nome do campo (o mesmo do `field` do aviso).
 * @param {string} prefix Prefixo usado em `issueId` na mesma lista.
 * @returns {string} Atributos prontos para o `<input>` (com espaço na frente), ou texto vazio.
 */
export function fieldErrorAttrs(issues, field, prefix) {
  const ids = issues.map((issue, i) => (issue.field === field ? issueId(prefix, i) : "")).filter(Boolean);
  return ids.length ? ` aria-invalid="true" aria-describedby="${ids.join(" ")}"` : "";
}
