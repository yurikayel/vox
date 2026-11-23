/**
 * @file Concatena `inline-composer.js` e módulos `inline-composer-*.js` para asserções de string nos testes.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Lê a fachada `app/inline-composer.js` e todos os `app/inline-composer-*.js` (ordenados) do `clientRoot`.
 * @param {string} clientRoot Caminho da pasta `client/` (ex.: `…/vox/client`).
 * @returns {string} Código concatenado para busca de marcadores.
 */
export function readInlineComposerSource(clientRoot) {
  const appDir = path.join(clientRoot, "js", "app");
  const parts = [path.join(appDir, "inline-composer.js")];
  const entries = fs.readdirSync(appDir);
  const composerModules = entries
    .filter((name) => name.startsWith("inline-composer-") && name.endsWith(".js"))
    .sort();
  for (const name of composerModules) {
    parts.push(path.join(appDir, name));
  }
  return parts.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}
