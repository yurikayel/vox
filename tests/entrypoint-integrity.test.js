import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "js");

test("entrypoint integrity - client/js/app/init.js importa dependencias sem erro de sintaxe ou export", async () => {
  const initPath = path.join(clientDir, "app", "init.js");
  assert.ok(fs.existsSync(initPath), "client/js/app/init.js deve existir");

  try {
    const mod = await import(pathToFileURL(initPath).href);
    assert.ok(mod, "client/js/app/init.js carregado com sucesso");
    assert.equal(typeof mod.initDmListeners, "function");
    assert.equal(typeof mod.initGossipListeners, "function");
    assert.equal(typeof mod.initSocialInteractions, "function");
  } catch (err) {
    assert.fail(`Falha ao importar client/js/app/init.js: ${err.message}`);
  }
});

test("entrypoint integrity - client/js/app.js todas as importacoes estaticas existem nos alvos", async () => {
  const appPath = path.join(clientDir, "app.js");
  assert.ok(fs.existsSync(appPath), "client/js/app.js deve existir");

  const content = fs.readFileSync(appPath, "utf8");
  const importLines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("import "));

  for (const line of importLines) {
    const fromMatch = line.match(/from\s+["'](.*?)["']/);
    if (!fromMatch) continue;

    const relPath = fromMatch[1];
    const fullPath = path.resolve(clientDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Arquivo importado deve existir no disco: ${relPath}`);

    const targetMod = await import(pathToFileURL(fullPath).href);

    const namedMatch = line.match(/import\s+\{([^}]+)\}\s+from/);
    if (namedMatch) {
      const names = namedMatch[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim());
      for (const name of names) {
        if (!name) continue;
        assert.ok(
          name in targetMod,
          `O módulo ${relPath} deve exportar '${name}' (exigido por app.js)`,
        );
      }
    }
  }
});
