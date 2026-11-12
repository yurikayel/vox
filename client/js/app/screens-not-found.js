/**
 * @file Tela "Página não encontrada" para links que não correspondem a nenhuma rota.
 *
 * Antes, um endereço errado (link digitado à mão, colado pela metade ou de uma versão antiga)
 * abria a Home sem aviso, e a pessoa achava que o conteúdo tinha sumido. Agora ela vê o
 * endereço que pediu e caminhos de volta.
 */

import * as render from "../render.js";
import { getActiveUser, makeShellProps } from "./context.js";

/**
 * Monta o miolo da tela de rota desconhecida.
 * @param {string} hash Hash pedido, como `#/nao-existe` (só exibido, sempre escapado).
 * @returns {string} HTML do cartão vazio com os links de volta.
 */
export function renderNotFoundHtml(hash) {
  return `<section class="card empty not-found" aria-labelledby="not-found-title">
      <h1 id="not-found-title">Página não encontrada</h1>
      <p class="desc">Não existe nada em <code>${render.escapeHtml(hash)}</code>. O link pode estar incompleto ou ser de uma versão antiga do Vox.</p>
      <p><a class="btn btn-primary" href="#/">Ir para a Ágora</a> <a class="btn btn-outline" href="#/voxpedia">Abrir a Voxpedia</a></p>
    </section>`;
}

/**
 * Mostra a tela de rota desconhecida dentro do shell do app.
 * @returns {Promise<void>}
 */
export async function showNotFound() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "", "Página não encontrada"));
  main.innerHTML = renderNotFoundHtml(location.hash || "#/");
}
