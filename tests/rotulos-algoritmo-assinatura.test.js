/**
 * Honestidade de segurança (ADR-024): o texto que a pessoa lê não pode prometer um algoritmo
 * que a conta não usa. A conta assina com ECDSA P-256 (`key-lock.js`, `local-account.js`).
 * Ed25519 só existe em `vox-identity.js`, escrito e ainda não plugado (docs/FEATURES.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const client = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const read = (rel) => fs.readFileSync(path.join(client, rel), "utf8");

/** Telas do app e páginas públicas que falam da chave da conta. */
const USER_FACING = [
  "js/render/compose-chrome.js",
  "js/render/oauth-modals.js",
  "js/render/status.js",
  "download.html",
  "download/index.html",
  "revolucao.html",
  "revolucao/index.html",
  "revolução/index.html",
];

test("a conta assina com ECDSA P-256", () => {
  assert.match(read("js/key-lock.js"), /name: "ECDSA", namedCurve: "P-256"/);
});

test("nenhum texto para o usuário diz que a chave da conta é Ed25519", () => {
  for (const rel of USER_FACING) {
    assert.doesNotMatch(read(rel), /ed25519/i, `${rel} cita Ed25519, que a conta não usa`);
  }
});

test("a tela de status mostra o algoritmo que a conta usa", () => {
  assert.match(read("js/render/status.js"), /agora-tile-value">P-256 \(ECDSA\)</);
});
