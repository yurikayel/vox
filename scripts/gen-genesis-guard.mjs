#!/usr/bin/env node
/**
 * Corte da gênese nos servidores — gera as cópias da regra a partir da fonte única do cliente.
 *
 * Fonte: `client/js/genesis.js` (`GENESIS_MS`) e `client/js/data/test-route-ids.js` (`TEST_ROUTE_IDS`).
 * Saídas (não editar à mão):
 * - `relay/genesis_data.py` — lido por `relay/genesis_guard.py` (relay Python e Node Zero empacotado);
 * - `packaging/zero-central-memory-windows/src/GenesisData.cs` — compilado no `ZeroCentralMemory.exe`.
 *
 * Uso: `node scripts/gen-genesis-guard.mjs` regrava as saídas; `--check` só confere e sai com 1 se alguma
 * estiver diferente (o teste `tests/genesis-guard-sync.test.js` roda esta conferência).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY_OUT = path.join(ROOT, "relay", "genesis_data.py");
const CS_OUT = path.join(ROOT, "packaging", "zero-central-memory-windows", "src", "GenesisData.cs");
const NOTICE = "Gerado por scripts/gen-genesis-guard.mjs a partir de client/js/genesis.js e client/js/data/test-route-ids.js. Não editar.";

async function loadSource() {
  const genesis = await import(pathToFileURL(path.join(ROOT, "client", "js", "genesis.js")).href);
  const data = await import(pathToFileURL(path.join(ROOT, "client", "js", "data", "test-route-ids.js")).href);
  return { genesisMs: genesis.GENESIS_MS, ids: [...data.TEST_ROUTE_IDS].sort() };
}

/**
 * Texto do módulo Python com a data de corte e as chaves de teste.
 * @param {{ genesisMs: number, ids: string[] }} source Data de corte (ms UTC) e chaves ordenadas.
 * @returns {string} Conteúdo de `relay/genesis_data.py`.
 */
export function renderPython({ genesisMs, ids }) {
  const lines = ids.map((id) => `    "${id}",`).join("\n");
  return `"""${NOTICE}"""\n\nGENESIS_MS = ${genesisMs}\n\nTEST_ROUTE_IDS = frozenset({\n${lines}\n})\n`;
}

/**
 * Texto da classe C# com a data de corte e as chaves de teste.
 * @param {{ genesisMs: number, ids: string[] }} source Data de corte (ms UTC) e chaves ordenadas.
 * @returns {string} Conteúdo de `GenesisData.cs`.
 */
export function renderCSharp({ genesisMs, ids }) {
  const lines = ids.map((id) => `            "${id}",`).join("\n");
  return `// ${NOTICE}
using System;
using System.Collections.Generic;

namespace Vox.ZeroMemory {
    public static class GenesisData {
        public const long GenesisMs = ${genesisMs}L;

        public static readonly HashSet<string> TestRouteIds = new HashSet<string>(StringComparer.Ordinal) {
${lines}
        };
    }
}
`;
}

/**
 * Gera (ou confere) as duas cópias da regra.
 * @param {{ check?: boolean }} [options] `check: true` só compara, sem gravar.
 * @returns {Promise<string[]>} Caminhos que estavam diferentes da fonte (vazio quando tudo bate).
 */
export async function syncGenesisGuard({ check = false } = {}) {
  const source = await loadSource();
  const outputs = [[PY_OUT, renderPython(source)], [CS_OUT, renderCSharp(source)]];
  const stale = [];
  for (const [file, text] of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === text) continue;
    stale.push(path.relative(ROOT, file));
    if (!check) fs.writeFileSync(file, text);
  }
  return stale;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale = await syncGenesisGuard({ check });
  if (check && stale.length) {
    console.error(`Desatualizado (rode node scripts/gen-genesis-guard.mjs): ${stale.join(", ")}`);
    process.exit(1);
  }
  console.log(stale.length ? `Regravado: ${stale.join(", ")}` : "Em dia.");
}
