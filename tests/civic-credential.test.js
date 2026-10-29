import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as cred from "../client/js/civic-credential.js";

test("civic-credential: issueCivicCredential emite credencial padronizada", async () => {
  const c = await cred.issueCivicCredential({
    issuerRouteId: "vx_comite_ti",
    issuerName: "Comitê Popular de Tecnologia",
    recipientRouteId: "vx_helena_456",
    recipientName: "Camarada Helena",
    courseTitle: "Curso de Soberania Digital e Arquitetura Aberta",
    workloadHours: 20,
    skills: ["P2P", "Criptografia Local", "Soberania Digital"],
  });

  assert.equal(c.schema, "vox-civic-cred-v1");
  assert.ok(c.id.startsWith("cred_"));
  assert.equal(typeof c.credentialHash, "string");
  assert.equal(c.credentialHash.length, 64);
  assert.equal(c.issuer.name, "Comitê Popular de Tecnologia");
  assert.equal(c.recipient.name, "Camarada Helena");
  assert.equal(c.workloadHours, 20);
  assert.ok(c.arweaveTags.some((t) => t.name === "Credential-Id" && t.value === c.id));
});

test("civic-credential: verifyCivicCredential valida autenticidade e detecta fraude", async () => {
  const c = await cred.issueCivicCredential({
    issuerRouteId: "vx_comite_ti",
    recipientRouteId: "vx_helena_456",
    courseTitle: "Formação Básica",
  });

  const check = await cred.verifyCivicCredential(c);
  assert.equal(check.isValid, true);
  assert.ok(check.reason.includes("autêntica"));

  // Tentativa de fraude: alterar a carga horária ou aluno sem re-assinar o hash
  const fraudulent = { ...c, workloadHours: 100 };
  const fraudCheck = await cred.verifyCivicCredential(fraudulent);
  assert.equal(fraudCheck.isValid, false);
  assert.ok(fraudCheck.reason.includes("diverge"));
});

test("civic-credential: renderCivicCredentialBadgeHtml gera card legível", async () => {
  const c = await cred.issueCivicCredential({
    issuerRouteId: "vx_comite_ti",
    issuerName: "Comitê Popular",
    recipientRouteId: "vx_helena_456",
    recipientName: "Helena",
    courseTitle: "Soberania Digital",
    workloadHours: 12,
    skills: ["P2P"],
  });

  const html = cred.renderCivicCredentialBadgeHtml(c);
  assert.ok(html.includes("Certificado Cívico Popular"));
  assert.ok(html.includes("Soberania Digital"));
  assert.ok(html.includes("Helena"));
  assert.ok(html.includes("Comitê Popular"));
  assert.ok(html.includes("12 horas"));
  assert.ok(html.includes("P2P"));
});
