import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as pix from "../client/js/pix-key.js";

test("pix-key - validação de CPF (válido e inválido)", () => {
  // CPF válido gerado por algoritmo
  const valid = pix.validatePixKey("52998224725");
  assert.equal(valid.ok, true);
  assert.equal(valid.type, "cpf");
  assert.equal(valid.normalized, "52998224725");

  // Formatado
  const formated = pix.validatePixKey("529.982.247-25");
  assert.equal(formated.ok, true);
  assert.equal(formated.type, "cpf");

  // Inválido (dígitos verificadores errados)
  const invalid = pix.validatePixKey("111.222.333-44");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.type, "cpf");
  assert.ok(invalid.errorPt.includes("CPF"));
});

test("pix-key - validação de e-mail", () => {
  const valid = pix.validatePixKey("lia@exemplo.org.br");
  assert.equal(valid.ok, true);
  assert.equal(valid.type, "email");
  assert.equal(valid.normalized, "lia@exemplo.org.br");

  const invalid = pix.validatePixKey("lia@semdominio");
  assert.equal(invalid.ok, false);
});

test("pix-key - validação de telefone celular brasileiro (+55)", () => {
  const withPrefix = pix.validatePixKey("+5511987654321");
  assert.equal(withPrefix.ok, true);
  assert.equal(withPrefix.type, "phone");
  assert.equal(withPrefix.normalized, "+5511987654321");

  const local = pix.validatePixKey("11987654321");
  assert.equal(local.ok, true);
  assert.equal(local.type, "phone");
  assert.equal(local.normalized, "+5511987654321");

  const short = pix.validatePixKey("12345");
  assert.equal(short.ok, false);
});

test("pix-key - validação de chave aleatória (UUID)", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const valid = pix.validatePixKey(uuid);
  assert.equal(valid.ok, true);
  assert.equal(valid.type, "random");
  assert.equal(valid.normalized, uuid.toLowerCase());
});

test("pix-key - mascaramento para exibição pública", () => {
  // CPF
  const maskedCpf = pix.maskForDisplay("52998224725", "cpf");
  assert.equal(maskedCpf, "***.982.247-**");

  // E-mail
  const maskedEmail = pix.maskForDisplay("lia@voxbrasil.org", "email");
  assert.equal(maskedEmail, "li***a@voxbrasil.org");

  // Telefone
  const maskedPhone = pix.maskForDisplay("+5511987654321", "phone");
  assert.equal(maskedPhone, "+55 (11) *****-4321");

  // Chave aleatória
  const maskedUuid = pix.maskForDisplay("123e4567-e89b-12d3-a456-426614174000", "random");
  assert.ok(maskedUuid.startsWith("123e"));
  assert.ok(maskedUuid.endsWith("4000"));
});
