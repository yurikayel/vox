/**
 * @file Concatena `feed.js` e módulos `feed-*.js` para asserções de string nos testes.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Lê a fachada `render/feed.js` e todos os `render/feed-*.js` (ordenados) do `clientRoot`.
 * @param {string} clientRoot Caminho da pasta `client/` (ex.: `…/vox/client`).
 * @returns {string} Código concatenado para busca de marcadores.
 */
export function readFeedRenderSource(clientRoot) {
  const renderDir = path.join(clientRoot, "js", "render");
  const parts = [path.join(renderDir, "feed.js")];
  const entries = fs.readdirSync(renderDir);
  const feedModules = entries
    .filter((name) => name.startsWith("feed-") && name.endsWith(".js"))
    .sort();
  for (const name of feedModules) {
    parts.push(path.join(renderDir, name));
  }
  return parts.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}