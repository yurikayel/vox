/** @file #/ajuda/teste screen. */

import * as render from "../render.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showAjudaTeste() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "voxpedia", "Teste aberto"));
  main.innerHTML = render.renderAjudaTeste();
}
