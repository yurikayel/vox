/** @file #/ajuda/teste screen. */

import * as render from "../render.js";
import { getActiveUser, makeShellProps } from "./context.js";

/**
 * Monta a tela de ajuda para teste aberto (`#/ajuda/teste`).
 *
 * @returns {Promise<void>}
 */
export async function showAjudaTeste() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "voxpedia", "Teste aberto"));
  main.innerHTML = render.renderAjudaTeste();
}
