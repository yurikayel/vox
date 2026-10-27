import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/local-account.js";

test("account-backup - roundtrip de export e import restaura identidade e chaves", async () => {
  localStorage.clear();
  const acc1 = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Líder Comunitário");
  localAccount.setPixKey({ normalized: "+5511999998888", type: "phone" });

  const bundleStr = await localAccount.exportAccountBundle();
  assert.ok(bundleStr.includes("vox-account-backup"));
  assert.ok(bundleStr.includes(acc1.routeId));
  assert.ok(bundleStr.includes("Líder Comunitário"));

  // Simula limpeza completa do aparelho (novo dispositivo)
  localStorage.clear();

  const restored = await localAccount.importAccountBundle(bundleStr);
  assert.equal(restored.routeId, acc1.routeId);
  assert.equal(localAccount.getDisplayName(), "Líder Comunitário");
  assert.equal(localAccount.getPixKey()?.normalized, "+5511999998888");

  // Verifica se o par restaurado é capaz de assinar e verificar normalmente
  const signed = await localAccount.signPayload({ title: "Post com conta restaurada", body: "Texto" });
  assert.equal(signed.author, acc1.routeId);
  const valid = await localAccount.verifyPayload(signed);
  assert.equal(valid, true);
});

test("account-backup - rejeita backup adulterado com routeId incompatível", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const bundleStr = await localAccount.exportAccountBundle();
  const bundle = JSON.parse(bundleStr);

  // Forja routeId
  bundle.routeId = "vx_forged_route_id_99";

  await assert.rejects(
    async () => {
      await localAccount.importAccountBundle(bundle);
    },
    /Chave pública não corresponde ao routeId declarado/
  );
});

test("account-backup - rejeita string não-JSON ou chaves ausentes", async () => {
  await assert.rejects(
    async () => {
      await localAccount.importAccountBundle("texto-corrompido-nao-json");
    },
    /Formato de backup inválido/
  );

  await assert.rejects(
    async () => {
      await localAccount.importAccountBundle({ kind: "vox-account-backup", routeId: "vx_123" });
    },
    /Chaves de assinatura ausentes no backup/
  );
});

test("account-backup - envelope com senha restaura identidade (roundtrip wrapped)", async () => {
  localStorage.clear();
  const acc1 = await localAccount.ensureLocalAccount();
  localAccount.setDisplayName("Líder Comunitário");
  const privD = acc1.privateJwk.d;

  const wrappedStr = await localAccount.exportAccountBundle("frase-secreta-ok");
  assert.ok(wrappedStr.includes("vox-account-backup-wrapped"));
  assert.ok(!wrappedStr.includes("vox-account-backup\""));
  assert.ok(!wrappedStr.includes("Líder Comunitário"));
  assert.ok(!wrappedStr.includes(privD));

  localStorage.clear();
  const restored = await localAccount.importAccountBundle(wrappedStr, "frase-secreta-ok");
  assert.equal(restored.routeId, acc1.routeId);
  assert.equal(localAccount.getDisplayName(), "Líder Comunitário");
  const signed = await localAccount.signPayload({ title: "Post wrapped", body: "ok" });
  assert.equal(await localAccount.verifyPayload(signed), true);
});

test("account-backup - senha errada rejeita envelope wrapped", async () => {
  localStorage.clear();
  await localAccount.ensureLocalAccount();
  const wrappedStr = await localAccount.exportAccountBundle("frase-certa");

  localStorage.clear();
  await assert.rejects(
    () => localAccount.importAccountBundle(wrappedStr, "senha-errada"),
    /Senha incorreta/
  );
  await assert.rejects(
    () => localAccount.importAccountBundle(wrappedStr),
    /informe a senha/
  );
});
