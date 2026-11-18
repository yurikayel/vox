/**
 * S19 — `identity/account-backup-wrap.js`: envelope cifrado do arquivo de soberania (fora dos locks #223/#229).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  KIND_PLAIN,
  KIND_WRAPPED,
  wrapBackup,
  unwrapBackup,
  peekBackupKind,
} from "../client/js/identity/account-backup-wrap.js";

const PLAIN = {
  kind: KIND_PLAIN,
  routeId: "vx_test_wrap",
  publicJwk: { kty: "OKP", crv: "Ed25519", x: "abc" },
  privateJwk: { kty: "OKP", crv: "Ed25519", x: "abc", d: "secret" },
};

test("account-backup-wrap - peekBackupKind ignora lixo e reconhece objeto", () => {
  assert.equal(peekBackupKind("texto"), "");
  assert.equal(peekBackupKind({ kind: KIND_WRAPPED }), KIND_WRAPPED);
  assert.equal(peekBackupKind(JSON.stringify({ kind: KIND_PLAIN })), KIND_PLAIN);
});

test("account-backup-wrap - wrap recusa senha vazia e roundtrip restaura o plain", async () => {
  await assert.rejects(() => wrapBackup(PLAIN, ""), /Informe uma senha/);
  const wrapped = await wrapBackup(PLAIN, "senha-forte");
  assert.equal(wrapped.kind, KIND_WRAPPED);
  assert.equal(wrapped.routeId, PLAIN.routeId);
  const back = await unwrapBackup(wrapped, "senha-forte");
  assert.deepEqual(back, PLAIN);
});

test("account-backup-wrap - envelope adulterado ou senha errada é recusado", async () => {
  const wrapped = await wrapBackup(PLAIN, "certa");
  await assert.rejects(() => unwrapBackup({ kind: "outro" }, "certa"), /incompatível/);
  await assert.rejects(() => unwrapBackup({ ...wrapped, ct: "xxxx" }, "certa"), /Senha incorreta/);
  await assert.rejects(() => unwrapBackup(wrapped, "errada"), /Senha incorreta/);
});

test("account-backup-wrap - iter absurdo no envelope cai no padrão e ainda abre", async () => {
  const wrapped = await wrapBackup(PLAIN, "senha-iter");
  const tampered = { ...wrapped, iter: 50 };
  const back = await unwrapBackup(tampered, "senha-iter");
  assert.equal(back.routeId, PLAIN.routeId);
});