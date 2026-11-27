#!/usr/bin/env node
/**
 * @file PM-117 — inventário dos E2E: quais rodam em PR, quais só na agenda (nightly) e quais não rodam em workflow nenhum.
 * Lê `e2e/`, `scripts/*-e2e.mjs`, o script `test:e2e` do `package.json` e os workflows de `.github/workflows/`. O gatilho
 * de um E2E é o do workflow que o chama (`pull_request` → PR; `schedule` → nightly); `if:` de job não é lido.
 * Uso: `npm run audit:e2e` (tabela) · `npm run audit:e2e -- --json`. Só informa: o consumidor que trava é o teste da
 * tabela de `docs/TESTES.md` (§4.1), que reprova se a tabela e os workflows divergirem.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRIGGER_ORDER = ["pr", "nightly"];

/** Eventos do `on:` em bloco: as chaves (ou itens de lista) no recuo da primeira linha do bloco. */
function blockEvents(block) {
  const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  const indent = lines[0]?.match(/^[ \t]*/)[0];
  return lines.filter((l) => l.startsWith(indent) && !/^[ \t]/.test(l.slice(indent.length)))
    .map((l) => /^[ \t]*(?:-[ \t]+)?["']?([A-Za-z_]+)["']?[ \t]*(?::|$)/.exec(l)?.[1]).filter(Boolean);
}

/** Eventos de um `on:` na mesma linha: `on: push` ou `on: [push, pull_request]`; a forma `{…}` não é lida. */
function inlineEvents(rest) {
  if (rest.startsWith("{")) throw new Error(`on: em forma de mapa na mesma linha não é suportado: ${rest}`);
  return rest.replace(/^\[|\]$/g, "").split(",").map((e) => e.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

/**
 * Gatilhos de um workflow, lidos do `on:` do YAML (bloco, `on: evento` ou `on: [a, b]`, com ou sem aspas na chave).
 * @param {string} yaml Texto do workflow.
 * @returns {string[]} `pr` (evento `pull_request`) e/ou `nightly` (evento `schedule`), nessa ordem; vazio se nenhum.
 * `pull_request_target` não conta como PR.
 * @throws {Error} Se não houver `on:` ou ele estiver numa forma que não é lida (nunca devolve vazio em silêncio).
 */
export function workflowTriggers(yaml) {
  const text = yaml.replace(/^﻿/, "");
  const head = /^["']?on["']?:[ \t]*([^\r\n]*)(?:\r?\n|$)/m.exec(text);
  if (!head) throw new Error("workflow sem chave `on:` reconhecível");
  const rest = head[1].replace(/[ \t]+#.*$/, "").trim();
  const block = /^(?:[ \t]+.*\r?\n|[ \t]*\r?\n)*/.exec(text.slice(head.index + head[0].length))[0];
  const events = new Set(rest ? inlineEvents(rest) : blockEvents(block));
  const found = new Set([events.has("pull_request") && "pr", events.has("schedule") && "nightly"]);
  return TRIGGER_ORDER.filter((t) => found.has(t));
}

/**
 * Padrão `-p` do `unittest discover` do script `test:e2e` (ex.: `test_*.py`) e a pasta `-s`.
 * @param {string} command Linha do script npm.
 * @returns {{ dir: string, pattern: RegExp }|null} Pasta e padrão; `null` se não for um `unittest discover`.
 */
export function parseDiscover(command) {
  const m = /unittest discover\s+-s\s+(\S+)\s+-p\s+"?([^"\s]+)"?/.exec(command || "");
  if (!m) return null;
  const source = m[2].replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return { dir: m[1], pattern: new RegExp(`^${source}$`) };
}

function listFiles(root, dir, test) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(test).sort().map((name) => `${dir}/${name}`);
}

function workflowsOf(root) {
  const dir = path.join(root, ".github", "workflows");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()
    .map((file) => {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      return { file, text, triggers: workflowTriggers(text) };
    });
}

/**
 * Só o texto das chaves `run:` de um workflow (em linha ou em bloco `|`/`>`); `name:` e comentário que citam o comando não contam.
 * @param {string} yaml Texto do workflow.
 * @returns {string} Comandos dos passos, um por linha.
 */
export function runCommands(yaml) {
  const lines = yaml.split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const m = /^([ \t]*(?:-[ \t]+)?)run:[ \t]*(.*)$/.exec(line);
    if (!m) return;
    const value = m[2].replace(/[ \t]+#.*$/, "").trim();
    if (!/^[|>][+-]?$/.test(value)) return void out.push(value);
    for (let j = i + 1; j < lines.length && (lines[j].trim() === "" || lines[j].search(/\S/) > m[1].length); j++) out.push(lines[j].trim());
  });
  return out.join("\n");
}

function runsOf(workflows, usedBy) {
  return workflows.filter((w) => usedBy(runCommands(w.text))).flatMap((w) => {
    return w.triggers.length ? w.triggers.map((trigger) => ({ workflow: w.file, trigger })) : [{ workflow: w.file, trigger: "outro" }];
  });
}

/**
 * Monta o inventário.
 * @param {string} [root] Raiz do repositório.
 * @returns {Array<{ path: string, kind: "python"|"node", runs: Array<{ workflow: string, trigger: string }>, where: "pr"|"nightly"|"manual"|"nenhum" }>}
 * `where` resume: `pr` (roda em PR), `nightly` (só na agenda), `manual` (nenhum workflow; vale para script de apoio).
 */
export function buildInventory(root = ROOT) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const discover = parseDiscover(pkg.scripts?.["test:e2e"]);
  const workflows = workflowsOf(root);
  const callsNpm = (text) => /npm run test:e2e(?![\w:-])/.test(text);
  const python = listFiles(root, "e2e", (n) => n.endsWith(".py")).map((p) => {
    const runs = discover && p.startsWith(`${discover.dir}/`) && discover.pattern.test(path.basename(p)) ? runsOf(workflows, callsNpm) : [];
    return { path: p, kind: "python", runs };
  });
  const node = listFiles(root, "scripts", (n) => /-e2e\.mjs$/.test(n)).map((p) => ({ path: p, kind: "node", runs: runsOf(workflows, (t) => t.includes(p)) }));
  return [...python, ...node].map((item) => ({ ...item, where: whereOf(item.runs) }));
}

function whereOf(runs) {
  if (runs.some((r) => r.trigger === "pr")) return "pr";
  return runs.some((r) => r.trigger === "nightly") ? "nightly" : "manual";
}

/**
 * Tabela em Markdown do inventário (a mesma que vai em `docs/TESTES.md` §4.1).
 * @param {ReturnType<typeof buildInventory>} inventory Resultado de `buildInventory`.
 * @returns {string} Linhas `| arquivo | onde roda |`, sem cabeçalho.
 */
export function formatRows(inventory) {
  const label = { pr: "PR", nightly: "nightly", manual: "manual (nenhum workflow)" };
  return inventory.map((i) => `| \`${i.path}\` | ${label[i.where]}${i.runs.length ? ` (${[...new Set(i.runs.map((r) => r.workflow))].join(", ")})` : ""} |`).join("\n");
}

/**
 * Linha de comando: imprime a tabela ou o JSON.
 * @param {string[]} [argv] Argumentos sem `node` e o script.
 * @param {(text: string) => void} [write] Saída (injetável nos testes).
 * @returns {number} Código de saída (sempre 0: só informa).
 */
export function runCli(argv = process.argv.slice(2), write = (t) => process.stdout.write(t)) {
  const inventory = buildInventory();
  write(argv.includes("--json") ? `${JSON.stringify(inventory, null, 2)}\n` : `${formatRows(inventory)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = runCli();
