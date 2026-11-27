/**
 * Regra do mantenedor: nenhum nome de outro produto ou serviço entra no repositório
 * (docs/, client/, README). Exceções: a atribuição CC-BY do SRD 5.2 (dndbeyond.com/srd)
 * e os sistemas suportados (Tormenta20, GURPS, 5e), que não constam da lista.
 * Os nomes ficam fragmentados aqui para o próprio teste não os citar.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = [
  ["Foun", "dry"],
  ["Owl", "bear"],
  ["Roll", "20"],
  ["Mini ", "Kraken"],
  ["ER", "PG"],
  ["Fantasy ", "Grounds"],
  ["Dia", "blo"],
  ["dnd", "5e-2024"],
].map((parts) => parts.join(""));
const PATTERN = new RegExp(`(?<![A-Za-z0-9])(?:${NAMES.join("|")})(?![A-Za-z0-9])`, "i");
// Variantes que o casamento literal deixava passar: o "e" comercial escrito como entidade HTML ou com espaços
// (D&amp;D, D & D), o nome seguido de ano (D&D2024) e o título curto "Dungeons" sozinho. O título curto só vale
// capitalizado: em minúscula é o identificador do próprio código (`dungeons`).
const AMP = ["D", "&D"].join("");
const SHORT = ["Dun", "geons"].join("");
const LONG = [SHORT, " & Dra", "gons"].join("");
const VARIANTS = [
  new RegExp(`(?<![A-Za-z0-9])${AMP.replace("&", "\\s*&\\s*")}(?![A-Za-z])`, "i"),
  new RegExp(`(?<![A-Za-z0-9])${LONG.replace("&", "\\s*&\\s*")}(?![A-Za-z0-9])`, "i"),
  new RegExp(`(?<![A-Za-z0-9])${SHORT}(?![A-Za-z0-9])`),
];
const ENTITY_AMP = /&(?:amp|#0*38|#x0*26);/gi;
const SKIP_DIRS = new Set(["node_modules", "vendor", ".git"]);
const TEXT_EXT = /\.(md|js|mjs|json|html|css|txt)$/i;
const ALLOWED_LINE = /dndbeyond\.com\/srd/i;

/** Diz se a linha cita um nome de terceiro (já decodificando o "e" comercial em entidade) fora da atribuição do SRD. */
function citaTerceiro(line) {
  if (ALLOWED_LINE.test(line)) return false;
  const texto = line.replace(ENTITY_AMP, "&");
  return PATTERN.test(texto) || VARIANTS.some((v) => v.test(texto));
}

/** Lista recursivamente os arquivos de texto de uma pasta, ignorando vendorizados. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

test("sem nomes de terceiros em docs/, client/ e README (exceto atribuição do SRD)", () => {
  const files = [...walk(path.join(ROOT, "docs")), ...walk(path.join(ROOT, "client")), path.join(ROOT, "README.md")];
  const hits = [];
  for (const file of files) {
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (citaTerceiro(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
      });
  }
  assert.deepEqual(hits, [], `nomes de terceiros em: ${hits.join(", ")}`);
});

test("o guarda acusa nomes compostos e as variantes de escrita, e deixa passar a atribuição e os identificadores", () => {
  const acusa = [
    `Importe do ${["Mini ", "Kraken"].join("")} para a mesa`,
    `Como no ${["Fantasy ", "Grounds"].join("")}.`,
    `Compatível com ${LONG}`,
    `${SHORT} sem o resto do título`,
    `${AMP} 2024`,
    `${AMP.replace("&", "&amp;")} na tela`,
    `${AMP.replace("&", "&#38;")} e ${AMP.replace("&", "&#x26;")}`,
    `${AMP.replace("&", " & ")} em prosa`,
    `${LONG.replace("&", "&amp;")}`,
    `${AMP}2024`,
  ];
  for (const linha of acusa) assert.equal(citaTerceiro(linha), true, linha);
  const passa = [
    `Fonte: ${["https://www.dndbey", "ond.com/srd"].join("")} (CC-BY, ${AMP})`,
    "const dungeons = new Map(); // lista de salas",
    "getDungeons() devolve a lista",
    "Seu lado & o meu",
    "Tormenta20, GURPS e 5e",
  ];
  for (const linha of passa) assert.equal(citaTerceiro(linha), false, linha);
});
