/**
 * Testes adversariais do link/QR de sincronização (`#/sync?b=`) e do arquivo de soberania cifrado
 * (`identity/account-backup-wrap.js`): truncado, adulterado, versão desconhecida, senha errada, ida e volta.
 * Lacunas viram `test.todo` (🔴 no PR); nenhum código foi alterado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as vc from "../client/js/vault/vault-crypto.js";
import { KIND_PLAIN, KIND_WRAPPED, peekBackupKind, unwrapBackup, wrapBackup } from "../client/js/identity/account-backup-wrap.js";

const PASS = "frase longa de teste soberana";
const PLAIN = { voxVersion: 1, kind: KIND_PLAIN, routeId: "vx_abc", seed: "s", displayName: "Zé" };
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const sealSmall = () => vc.encryptVaultV2({ routeId: "vx_1", seed: "x" }, PASS, 100_000);
const troca = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);

test("link v2: ida e volta preserva sal, IV, iterações e ainda abre", async () => {
  const rec = await sealSmall();
  const link = vc.encodeVaultBundleForUrl(rec);
  assert.ok(link.startsWith("v2."));
  const back = vc.decodeVaultBundleFromUrl(link);
  assert.deepEqual([back.iter, back.salt, back.iv, back.ciphertext], [rec.iter, rec.salt, rec.iv, rec.ciphertext]);
  assert.deepEqual(await vc.decryptVaultRecord(back, PASS), { routeId: "vx_1", seed: "x" });
});

test("link v2: qualquer prefixo truncado devolve null ou um registro que não abre; nunca lança", async () => {
  const link = vc.encodeVaultBundleForUrl(await sealSmall());
  for (const n of [0, 3, 4, 10, 20, 40, 60, link.length - 5, link.length - 1]) {
    const back = vc.decodeVaultBundleFromUrl(link.slice(0, n));
    if (back) await assert.rejects(vc.decryptVaultRecord(back, PASS), `corte em ${n}`);
  }
});

test("link v2: lixo, base64 inválido, versão interna diferente de 2 e comprimentos mentirosos dão null", () => {
  const lixo = ["", "v2.", "v2.@@@", "!!!", "v2." + b64u(new Uint8Array(5)), "v2." + b64u(Uint8Array.from([9, ...new Uint8Array(40)]))];
  for (const s of lixo) assert.equal(vc.decodeVaultBundleFromUrl(s), null, JSON.stringify(s));
  const mente = new Uint8Array(40);
  mente[0] = 2;
  mente[5] = 250; // tamanho do sal maior que o pacote
  assert.equal(vc.decodeVaultBundleFromUrl("v2." + b64u(mente)), null);
  assert.equal(vc.decodeVaultBundleFromUrl(null), null);
  assert.equal(vc.decodeVaultBundleFromUrl(undefined), null);
});

test("link v2: iterações adulteradas no cabeçalho (fora da faixa) são recusadas na decodificação", async () => {
  const link = vc.encodeVaultBundleForUrl(await sealSmall());
  for (const iter of [1, 99_999, 5_000_001, 0xffffffff]) {
    const bytes = fromB64u(link.slice(3));
    new DataView(bytes.buffer).setUint32(1, iter);
    assert.equal(vc.decodeVaultBundleFromUrl("v2." + b64u(bytes)), null, `iter ${iter}`);
  }
});

test("link v2: bit trocado no corpo decodifica, mas a abertura falha por GCM", async () => {
  const link = vc.encodeVaultBundleForUrl(await sealSmall());
  const i = link.length - 3;
  const adulterado = link.slice(0, i) + (link[i] === "A" ? "B" : "A") + link.slice(i + 1);
  await assert.rejects(vc.decryptVaultRecord(vc.decodeVaultBundleFromUrl(adulterado), PASS));
});

test("link legado: iv:ciphertext decodifica; peças a mais ou a menos dão null", () => {
  assert.equal(vc.decodeVaultBundleFromUrl(btoa("aabb:ccdd"))?.iv, "aabb");
  for (const s of ["x", "a:b:c", "a:b:c:d", "1:a:b:c:d"]) {
    assert.equal(vc.decodeVaultBundleFromUrl(btoa(s)), null, s);
  }
});

test("link: orçamento compacto é positivo para tetos realistas e cresce com o teto", () => {
  assert.ok(vc.compactV2PlainBudget(600) > 0);
  assert.ok(vc.compactV2PlainBudget(1200) > vc.compactV2PlainBudget(600));
});

test("arquivo cifrado: ida e volta devolve o arquivo em claro e não vaza o conteúdo", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  assert.equal(env.kind, KIND_WRAPPED);
  assert.equal(peekBackupKind(env), KIND_WRAPPED);
  assert.ok(!JSON.stringify(env).includes('"seed"'));
  assert.deepEqual(await unwrapBackup(env, PASS), PLAIN);
});

test("arquivo cifrado: senha errada, vazia ou com espaço extra recusam com mensagem para a pessoa", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  await assert.rejects(unwrapBackup(env, "senha errada completa"), /Senha incorreta/);
  await assert.rejects(unwrapBackup(env, ""), /cifrado/);
  await assert.rejects(unwrapBackup(env, PASS + " "), /Senha incorreta/);
  await assert.rejects(wrapBackup(PLAIN, ""), /senha/);
});

test("arquivo cifrado: ct, iv e sal adulterados, ct truncado e iv curto recusam", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  const ruins = [
    { ...env, ct: troca(env.ct) }, { ...env, iv: troca(env.iv) }, { ...env, salt: troca(env.salt) },
    { ...env, ct: env.ct.slice(0, 10) }, { ...env, iv: env.iv.slice(0, 4) }, { ...env, ct: env.ct + "AAAA" },
  ];
  for (const r of ruins) await assert.rejects(unwrapBackup(r, PASS), /Senha incorreta|corrompido/);
});

test("arquivo cifrado: kind desconhecido, campos ausentes e interior com kind trocado recusam", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  for (const r of [null, {}, { ...env, kind: "outro" }, { ...env, ct: "" }, { ...env, salt: undefined }, { ...env, iv: "" }]) {
    await assert.rejects(unwrapBackup(r, PASS), /incompatível|corrompido/);
  }
  const estranho = await wrapBackup({ ...PLAIN, kind: "vox-outra-coisa" }, PASS);
  await assert.rejects(unwrapBackup(estranho, PASS), /incompatível/);
});

test("arquivo cifrado: iterações do cabeçalho fora da faixa não viram DoS nem rebaixam a chave", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  for (const iter of [1, 9_999, 1_000_001, 1e12, "x", -5]) {
    assert.deepEqual(await unwrapBackup({ ...env, iter }, PASS), PLAIN, `iter ${iter} cai no padrão`);
  }
  await assert.rejects(unwrapBackup({ ...env, iter: 10_000 }, PASS), /Senha incorreta/);
});

test("arquivo cifrado: doze envelopes do mesmo arquivo nunca repetem IV nem sal", async () => {
  const lote = await Promise.all(Array.from({ length: 12 }, () => wrapBackup(PLAIN, PASS)));
  assert.equal(new Set(lote.map((e) => e.iv)).size, lote.length);
  assert.equal(new Set(lote.map((e) => e.salt)).size, lote.length);
  assert.notEqual(lote[0].ct, lote[1].ct);
});

test("peekBackupKind: JSON ruim, vazio e objeto não lançam", () => {
  assert.equal(peekBackupKind("{nao é json"), "");
  assert.equal(peekBackupKind(""), "");
  assert.equal(peekBackupKind(null), "");
  assert.equal(peekBackupKind('{"kind":"vox-account-backup"}'), KIND_PLAIN);
});

test("arquivo cifrado: salt, iv ou ct com base64 inválido recusa com mensagem amigável", async () => {
  const env = await wrapBackup(PLAIN, PASS);
  const resultados = [];
  for (const campo of ["salt", "iv", "ct"]) {
    const err = await unwrapBackup({ ...env, [campo]: "@@@@" }, PASS).catch((e) => e);
    resultados.push(/Senha incorreta|corrompido|incompatível/.test(err?.message || ""));
  }
  assert.deepEqual(resultados, [true, true, true]);
});
