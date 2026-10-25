/** @file Voxpedia help screen. */

import * as render from "../render.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showVoxpedia() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "voxpedia", "Voxpedia"));
  main.innerHTML = render.renderVoxpedia();
}
