import test from "node:test";
import assert from "node:assert/strict";
import { auditFiles, findSecrets } from "../scripts/secrets-audit.mjs";

// Os "segredos" daqui são montados em tempo de execução para o próprio arquivo não disparar a auditoria.
const longB64 = (ch) => ch.repeat(43);
const pemHeader = (label) => "-----BEGIN " + label + "PRIVATE KEY-----";

test("PM-95: auditoria de segredos acha chave PEM privada de qualquer tipo", () => {
  for (const label of ["", "RSA ", "EC ", "OPENSSH ", "ENCRYPTED "]) {
    assert.deepEqual(findSecrets(`a\n${pemHeader(label)}\nMIIB`), [{ line: 2, kind: "pem-private-key" }], label);
  }
  assert.deepEqual(findSecrets("-----BEGIN " + "PUBLIC KEY-----"), []);
});

test("PM-95: auditoria de segredos acha JWK privada, inclusive em várias linhas, e ignora a pública", () => {
  const privateEc = JSON.stringify({ kty: "EC", crv: "P-256", x: longB64("x"), y: longB64("y"), d: longB64("d") });
  assert.equal(findSecrets(privateEc)[0].kind, "jwk-private-member");
  const pretty = JSON.stringify({ kty: "RSA", n: longB64("n"), e: "AQAB", p: longB64("p") }, null, 2);
  assert.ok(findSecrets(pretty).some((f) => f.kind === "jwk-private-member"));
  const publicEc = JSON.stringify({ kty: "EC", crv: "P-256", x: longB64("x"), y: longB64("y") });
  assert.deepEqual(findSecrets(publicEc), []);
  assert.deepEqual(findSecrets(`{ id: "${longB64("i")}", kty: "EC" }`), [], "id não é membro privado");
  assert.deepEqual(findSecrets(`{ d: "${longB64("d")}" }`), [], "sem kty por perto não é JWK");
});

test("PM-95: marcador de fixture libera a linha e o relatório não traz o valor", () => {
  const line = `const k = { kty: "EC", d: "${longB64("d")}" }; // vox-secrets-audit: fixture`;
  assert.deepEqual(findSecrets(line), []);
  const files = { "a.js": `{ kty: "EC", d: "${longB64("z")}" }`, "b.js": "ok", "sumiu.js": null };
  const read = (file) => {
    if (files[file] === null) throw new Error("ENOENT");
    return files[file];
  };
  const found = auditFiles(Object.keys(files), read);
  assert.deepEqual(found, [{ file: "a.js", line: 1, kind: "jwk-private-member" }]);
});
