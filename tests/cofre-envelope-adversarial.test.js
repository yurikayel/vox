/**
 * Testes adversariais do envelope do cofre (`vault/envelope.js` → `vault/vault-crypto.js`): envelope adulterado,
 * senha errada, versão desconhecida, entrada truncada, IV/sal reutilizados e ida e volta. Só lê o código; a
 * identidade está congelada, então lacunas viram `test.todo` (marcadas 🔴 no PR).
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import { decryptVaultRecord, encryptVaultV2 } from "../client/js/vault/envelope.js";
import * as vc from "../client/js/vault/vault-crypto.js";

const PASS = "frase longa de teste soberana";
const ITER = 100_000; // piso aceito: o teste não precisa dos 600 mil do app
const BUNDLE = { routeId: "vx_teste", seed: "abc", displayName: "Ana ✓" };

const seal = (bundle = BUNDLE, pass = PASS, email = "") => encryptVaultV2(bundle, pass, ITER, email);
const flipHex = (hex, at = 0) => hex.slice(0, at) + ((parseInt(hex[at], 16) ^ 1).toString(16)) + hex.slice(at + 1);

test("envelope: ida e volta devolve o pacote, inclusive com acento", async () => {
  const rec = await seal();
  assert.deepEqual(await decryptVaultRecord(rec, PASS), BUNDLE);
  assert.equal(rec.v, 2);
  assert.equal(rec.iter, ITER);
});

test("envelope: senha errada, vazia e quase certa lançam; nunca devolvem dado", async () => {
  const rec = await seal();
  for (const bad of ["", "frase longa de teste soberanA", PASS + "x", "outra coisa inteira aqui"]) {
    await assert.rejects(decryptVaultRecord(rec, bad), `senha ${JSON.stringify(bad)} não pode abrir`);
  }
});

test("envelope: e-mail errado não abre cofre feito com e-mail; só-senha cai no fallback por desenho", async () => {
  const comEmail = await seal(BUNDLE, PASS, "ana@exemplo.org");
  assert.deepEqual(await decryptVaultRecord(comEmail, PASS, " ANA@exemplo.org "), BUNDLE);
  await assert.rejects(decryptVaultRecord(comEmail, PASS, "bia@exemplo.org"));
  await assert.rejects(decryptVaultRecord(comEmail, PASS, ""));
  const soSenha = await seal();
  assert.deepEqual(await decryptVaultRecord(soSenha, PASS, "qualquer@exemplo.org"), BUNDLE);
});

test("envelope: um bit trocado no texto cifrado, no IV ou no sal derruba a abertura", async () => {
  const rec = await seal();
  const last = rec.ciphertext.length - 1;
  for (const campo of ["ciphertext", "iv", "salt"]) {
    for (const at of [0, campo === "ciphertext" ? last : 1]) {
      const adulterado = { ...rec, [campo]: flipHex(rec[campo], at) };
      await assert.rejects(decryptVaultRecord(adulterado, PASS), `${campo}[${at}]`);
    }
  }
});

test("envelope: etiqueta GCM cortada ou texto cifrado truncado/estendido não abre", async () => {
  const rec = await seal();
  const cortes = [rec.ciphertext.slice(0, -2), rec.ciphertext.slice(0, 20), rec.ciphertext + "00", rec.ciphertext.slice(0, 32)];
  for (const ciphertext of cortes) await assert.rejects(decryptVaultRecord({ ...rec, ciphertext }, PASS));
  await assert.rejects(decryptVaultRecord({ ...rec, ciphertext: "zz".repeat(40) }, PASS));
});

test("envelope: campos ausentes, vazios ou revogados devolvem null sem lançar", async () => {
  const rec = await seal();
  for (const parcial of [null, undefined, {}, { ...rec, iv: "" }, { ...rec, ciphertext: undefined }, { ...rec, revoked: true }]) {
    assert.equal(await decryptVaultRecord(parcial, PASS), null);
  }
});

test("envelope: versão desconhecida, iterações fora da faixa e sal ausente são recusadas", async () => {
  const rec = await seal();
  const recusados = [
    { ...rec, iter: 99_999 }, { ...rec, iter: 5_000_001 }, { ...rec, iter: "abc" }, { ...rec, iter: -1 },
    { ...rec, iter: 0 }, { ...rec, iter: NaN }, { ...rec, salt: "" }, { ...rec, salt: undefined },
  ];
  for (const r of recusados) assert.equal(await decryptVaultRecord(r, PASS), null, JSON.stringify(r.iter));
  assert.equal(vc.isV2Record({ ...rec, v: 3 }), false);
  assert.equal(vc.isV2Record({ ...rec, v: "2" }), false);
});

test("envelope: versão 3 ou v:'2' não cai no caminho legado e abre por engano", async () => {
  const rec = await seal();
  for (const v of [3, "2", 99, null]) {
    const r = { ...rec, v };
    await assert.rejects(decryptVaultRecord(r, PASS), `v=${JSON.stringify(v)} não pode abrir`);
  }
});

test("envelope: trocar o IV de um registro pelo de outro não abre nenhum dos dois", async () => {
  const a = await seal({ ...BUNDLE, routeId: "A" });
  const b = await seal({ ...BUNDLE, routeId: "B" });
  await assert.rejects(decryptVaultRecord({ ...a, iv: b.iv }, PASS));
  await assert.rejects(decryptVaultRecord({ ...b, iv: a.iv }, PASS));
  await assert.rejects(decryptVaultRecord({ ...a, ciphertext: b.ciphertext }, PASS));
});

test("envelope: mesmo pacote e mesma senha nunca repetem IV, sal nem texto cifrado", async () => {
  const lote = await Promise.all(Array.from({ length: 40 }, () => seal()));
  for (const campo of ["iv", "salt", "ciphertext"]) {
    assert.equal(new Set(lote.map((r) => r[campo])).size, lote.length, `${campo} repetido`);
  }
  assert.ok(lote.every((r) => r.iv.length === 24 && r.salt.length === 32));
});

test("envelope: o JSON do registro não vaza a senha nem o conteúdo", async () => {
  const rec = await seal({ routeId: "vx_x", seed: "SEMENTE-SECRETA-123" });
  const texto = JSON.stringify(rec);
  assert.ok(!texto.includes("SEMENTE-SECRETA-123"));
  assert.ok(!texto.includes(PASS));
});

test("envelope: endereço e prova do dono saem de sais diferentes e dependem de e-mail e senha", async () => {
  const [end, dono, endEmail, endOutra] = await Promise.all([
    vc.deriveVaultAddress(PASS), vc.deriveVaultOwnerToken(PASS),
    vc.deriveVaultAddress(PASS, "a@b.co"), vc.deriveVaultAddress(PASS + "!"),
  ]);
  assert.equal(new Set([end, dono, endEmail, endOutra]).size, 4);
  assert.match(end, /^[0-9a-f]{64}$/);
});

test("envelope: e-mail é normalizado (NFC, caixa, espaços) antes de entrar na chave", async () => {
  assert.equal(vc.normalizeVaultEmail("  ÃNA@Ex.ORG "), vc.normalizeVaultEmail("ãna@ex.org"));
  assert.equal(vc.normalizeVaultEmail("e\u0301@x.co"), vc.normalizeVaultEmail("\u00e9@x.co"));
  assert.equal(vc.buildVaultSecret(" senha ", ""), "senha");
});

test("envelope: legado v1 abre com o segredo certo e recusa o errado, revogado ou v2", async () => {
  const key = await vc.deriveLegacyKey("senha-velha", "passphrase");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(BUNDLE)));
  const rec = { iv: vc.bufferToHex(iv), ciphertext: vc.bufferToHex(ct) };
  assert.deepEqual(await decryptVaultRecord(rec, "senha-velha"), BUNDLE);
  assert.deepEqual(await vc.decryptLegacyRecord(rec, "senha-velha", "passphrase"), BUNDLE);
  await assert.rejects(decryptVaultRecord(rec, "senha-nova"));
  await assert.rejects(vc.decryptLegacyRecord(rec, "senha-velha", "google"));
  assert.equal(await vc.decryptLegacyRecord({ ...rec, revoked: true }, "senha-velha", "passphrase"), null);
  assert.equal(await vc.decryptLegacyRecord({ ...rec, v: 2 }, "senha-velha", "passphrase"), null);
});

test("envelope: encryptVaultV2 recusa `iterations` fora da faixa aceita por isV2Record", async () => {
  for (const bad of [99_999, 50_000, 1, 5_000_001, 0, -1, NaN, "100000", null]) {
    await assert.rejects(encryptVaultV2(BUNDLE, PASS, bad), /faixa/, `iter=${String(bad)}`);
  }
});
