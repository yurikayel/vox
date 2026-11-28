/**
 * @file Legenda do item da mochila: nome inteiro e quantidade. A célula da grade é estreita (28 px a 390 px de tela) e
 * corta o rótulo; o `title` não aparece no toque, e tocar na célula equipa o item. A legenda mostra o nome quando a
 * pessoa segura o item (começo do arrasto, na área de aviso `[data-inv-notice]`, `role="status"`) ou foca a célula
 * pelo teclado (em `[data-inv-caption]`, só visual), sem mudar o tamanho da célula. Só texto: o estilo é o de `sv-inv-notice`.
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

/** Escreve só quando o texto muda (reescrever o mesmo texto numa região viva faz o leitor de tela anunciar de novo). */
function write(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** Apaga `node` só se ainda tem o texto que a legenda escreveu, nunca outro aviso (por exemplo "Não cabe aí."). */
function erase(node, text) {
  if (text && node && node.textContent === text) node.textContent = "";
}

/** Um lugar de escrita da legenda: guarda o texto que ele próprio escreveu e só apaga esse texto (nunca outro aviso). */
function slot(find) {
  let text = "";
  return {
    get text() { return text; },
    put(value) {
      const node = find();
      if (!node) return false;
      write(node, value);
      text = value;
      return true;
    },
    erase() { erase(find(), text); text = ""; },
  };
}

/**
 * Legenda ligada ao contêiner, em dois lugares. "Segurando: …" vai na área de aviso `[data-inv-notice]` (`role="status"`,
 * que o leitor de tela anuncia). A legenda de foco ("Item: …") vai em `[data-inv-caption]`, que é só visual: a célula
 * focada já anuncia o próprio `aria-label`, e repetir na região viva faria cada foco ser lido duas vezes. Durante o
 * arrasto o foco de outra célula não troca a legenda de quem está em mãos.
 * @param {{querySelector: (selector: string) => ({textContent: string}|null)}} container Contêiner da mochila.
 * @returns {{show: (item: object|null|undefined, options?: {held?: boolean}) => void, clearFocus: () => void, clear: () => void}}
 * `show` mostra a legenda do item (em mãos ou em foco); `clearFocus` apaga só a legenda de foco; `clear` apaga as duas.
 */
export function createCaption(container) {
  const live = slot(() => container.querySelector("[data-inv-notice]"));
  const visual = slot(() => container.querySelector("[data-inv-caption]"));
  return {
    show(item, options) {
      const text = itemCaption(item, options);
      if (!text) return;
      if (!options?.held) {
        if (!live.text) visual.put(text);
      } else if (live.put(text)) visual.erase();
    },
    clearFocus: () => visual.erase(),
    clear() {
      live.erase();
      visual.erase();
    },
  };
}
