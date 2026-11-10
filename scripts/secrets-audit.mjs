#!/usr/bin/env node
/**
 * PM-95 — auditoria de segredos do CI (`node scripts/secrets-audit.mjs`).
 *
 * Procura nos arquivos versionados (`git ls-files`):
 * - chave privada em PEM (RSA, EC, OPENSSH, PKCS#8, cifrada ou não);
 * - JWK privada: um membro privado (`d`, `p`, `q`, `dp`, `dq`, `qi`) com valor base64url longo e `kty` por perto.
 *   É o formato em que o Vox guarda identidade, DM e carteira, e o grep de PEM não via.
 *
 * Fixture sintética de teste pode ser liberada com o marcador `vox-secrets-audit: fixture` na mesma linha.
 * O relatório diz só arquivo, linha e tipo; nunca imprime o valor.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PEM_PRIVATE = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/;
const JWK_PRIVATE_MEMBER = /(?<![\w$])["']?(?:d|p|q|dp|dq|qi)["']?\s*:\s*["'][A-Za-z0-9_-]{32,}["']/;
const KTY = /["']?kty["']?\s*:/;
const KTY_WINDOW = 2000;
const ALLOW_MARKER = "vox-secrets-audit: fixture";
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp3|mp4|webm|ogg|wav|wasm|zip|gz|exe|dll|pdf)$/i;

function lineFinding(text, line, offset) {
  if (line.includes(ALLOW_MARKER)) return null;
  if (PEM_PRIVATE.test(line)) return "pem-private-key";
  if (!JWK_PRIVATE_MEMBER.test(line)) return null;
  const around = text.slice(Math.max(0, offset - KTY_WINDOW), offset + line.length + KTY_WINDOW);
  return KTY.test(around) ? "jwk-private-member" : null;
}

/** Achados de um texto: `[{ line, kind }]`, com `kind` em `pem-private-key` ou `jwk-private-member`. */
export function findSecrets(text) {
  const findings = [];
  let offset = 0;
  text.split("\n").forEach((line, index) => {
    const kind = lineFinding(text, line, offset);
    if (kind) findings.push({ line: index + 1, kind });
    offset += line.length + 1;
  });
  return findings;
}

/** Audita uma lista de arquivos; arquivo que não abre (apagado, binário) é pulado. */
export function auditFiles(files, read = (file) => fs.readFileSync(file, "utf8")) {
  const all = [];
  for (const file of files) {
    let text;
    try {
      text = read(file);
    } catch {
      continue;
    }
    for (const finding of findSecrets(text)) all.push({ file, ...finding });
  }
  return all;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((file) => file && !BINARY.test(file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = auditFiles(trackedFiles());
  for (const f of found) console.error(`::error file=${f.file},line=${f.line}::possível segredo commitado (${f.kind})`);
  console.log(found.length ? `${found.length} achado(s).` : "Nenhuma chave privada (PEM) ou JWK privada encontrada. OK!");
  process.exitCode = found.length ? 1 : 0;
}
