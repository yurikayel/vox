/**
 * @file Concatena `render/shell.js` e os módulos `render/shell-*.js` para asserções de string nos testes.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Lê a fachada `render/shell.js` e todos os `render/shell-*.js` (ordenados) do `clientRoot`.
 * @param {string} clientRoot Caminho da pasta `client/` (ex.: `…/vox/client`).
 * @returns {string} Código concatenado para busca de marcadores.
 */
export function readShellRenderSource(clientRoot) {
  const renderDir = path.join(clientRoot, "js", "render");
  const modules = fs.readdirSync(renderDir).filter((name) => name.startsWith("shell-") && name.endsWith(".js")).sort();
  return ["shell.js", ...modules].map((name) => fs.readFileSync(path.join(renderDir, name), "utf8")).join("\n");
}
