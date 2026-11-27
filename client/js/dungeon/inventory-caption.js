/**
 * @file Legenda do item da mochila: nome inteiro e quantidade na área de aviso `[data-inv-notice]` (`role="status"`).
 * A célula da grade é estreita (28 px a 390 px de tela) e corta o rótulo; o `title` não aparece no toque, e tocar na
 * célula equipa o item. A legenda mostra o nome quando a pessoa segura o item (começo do arrasto) ou foca a célula
 * pelo teclado, sem mudar o tamanho da célula. Só texto: o estilo é o de `sv-inv-notice`.
 * @module dungeon/inventory-caption
 */

/**
 * Texto da legenda de um item da mochila, com o nome inteiro (não o rótulo cortado da célula) e a quantidade.
 * @param {{label?: string, qty?: number}|null|undefined} item Item da ficha (`inventoryItems`).
 * @param {{held?: boolean}} [options={}] `held` diz que o item está em mãos (arrasto); sem ele, só está em foco.
 * @param {boolean} [options.held=false] `true`: "Segurando: …"; `false`: "Item: …".
 * @returns {string} Ex.: `"Segurando: Corda de Cânhamo (10m) ×3."`; `""` quando o item não tem nome.
 */
export function itemCaption(item, { held = false } = {}) {
  const label = String(item?.label ?? "").trim();
  if (!label) return "";
  const qty = Math.trunc(Number(item.qty)) || 1;
  return `${held ? "Segurando" : "Item"}: ${label} ×${qty}.`;
}

/**
 * Legenda ligada à área de aviso do contêiner. Escreve só quando o texto muda (a área é `role="status"`: reescrever o
 * mesmo texto faria o leitor de tela anunciar de novo) e só apaga o que ela mesma escreveu, nunca outro aviso
 * (por exemplo "Não cabe aí.").
 * @param {{querySelector: (selector: string) => ({textContent: string}|null)}} container Contêiner da mochila.
 * @returns {{show: (item: object|null|undefined, options?: {held?: boolean}) => void, clear: () => void}}
 * `show` mostra a legenda do item; `clear` apaga a legenda que está na tela.
 */
export function createCaption(container) {
  let last = "";
  const notice = () => container.querySelector("[data-inv-notice]");
  return {
    show(item, options) {
      const text = itemCaption(item, options);
      const node = notice();
      if (!text || !node) return;
      if (node.textContent !== text) node.textContent = text;
      last = text;
    },
    clear() {
      const node = notice();
      if (last && node && node.textContent === last) node.textContent = "";
      last = "";
    },
  };
}
