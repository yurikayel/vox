#!/usr/bin/env node
/**
 * @file Auditoria de camadas do cliente — a decisão está em docs/adr/035-camadas-e-contextos.md.
 *
 * Lê os imports de cada módulo de `client/js` pela árvore sintática (espree), estáticos e `import()` com texto
 * literal, e reprova o import que sobe de camada: `base` não importa `render`, `app` nem `labs`; `render` não importa
 * `app` nem `labs`; `labs` não importa `app` nem `render`; só `app` e o próprio laboratório importam `labs`. Num
 * contexto com porta de entrada (`vault/`), quem está fora importa só pela porta (`CONTEXT_DOORS` em layers-lib).
 *
 * Os imports proibidos que já existiam ficam em scripts/layers-debt.json, como catraca: a lista pode diminuir, nunca
 * crescer. Import proibido novo reprova. Dívida paga que continua no arquivo também reprova, para não esconder uma
 * regressão futura: rode `--prune` para tirá-la.
 *
 * Uso: `npm run audit:layers` · `npm run audit:layers -- --prune` (só remove dívida paga; nunca acrescenta).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layerViolations } from "./layers-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = path.join(ROOT, "client", "js");
const DEBT_FILE = path.join(ROOT, "scripts", "layers-debt.json");

function listModules(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listModules(full);
    return e.name.endsWith(".js") ? [full] : [];
  });
}

function collectViolations() {
  return listModules(JS_ROOT)
    .flatMap((file) => layerViolations(path.relative(JS_ROOT, file).split(path.sep).join("/"), fs.readFileSync(file, "utf8")))
    .sort();
}

function main() {
  const prune = process.argv.includes("--prune");
  const found = collectViolations();
  const debt = new Set(JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")).violations);
  const fresh = found.filter((v) => !debt.has(v));
  const paid = [...debt].filter((v) => !found.includes(v));
  if (prune && paid.length) {
    fs.writeFileSync(DEBT_FILE, `${JSON.stringify({ violations: [...debt].filter((v) => found.includes(v)) }, null, 1)}\n`);
    console.log(`Dívida paga removida: ${paid.length}.`);
  }
  console.log(`Auditoria de camadas: ${found.length} import(s) proibido(s), todos na dívida conhecida salvo os listados abaixo.`);
  for (const v of fresh) console.error(`  NOVO  ${v}`);
  if (!prune) for (const v of paid) console.error(`  PAGO  ${v}  (rode: npm run audit:layers -- --prune)`);
  if (fresh.length || (!prune && paid.length)) {
    console.error(`\nReprovado: ${fresh.length} novo(s), ${prune ? 0 : paid.length} pago(s) ainda na dívida. Decisão: docs/adr/035-camadas-e-contextos.md`);
    process.exit(1);
  }
}

main();
