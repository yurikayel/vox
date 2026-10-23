import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as brcode from "../client/js/brcode.js";

test("brcode - formatTlv formata tag e tamanho com padding de 2 dígitos", () => {
  assert.equal(brcode.formatTlv(0, "01"), "000201");
  assert.equal(brcode.formatTlv(54, "10.00"), "540510.00");
  assert.equal(brcode.formatTlv(1, ""), "");
  assert.equal(brcode.formatTlv(1, null), "");
  assert.equal(brcode.formatTlv(1, undefined), "");
});

test("brcode - sanitizeAscii remove acentos, diacríticos e caracteres inválidos", () => {
  assert.equal(brcode.sanitizeAscii("João da Silva", 25), "Joao da Silva");
  assert.equal(brcode.sanitizeAscii("São Paulo - SP", 15), "Sao Paulo - SP");
  assert.equal(brcode.sanitizeAscii("Café & Cia @ 2026!", 20), "Cafe  Cia  2026");
  assert.equal(brcode.sanitizeAscii("TextoMuitoLongoParaOCampo", 10), "TextoMuito");
});

test("brcode - parseNumericAmount normaliza entradas monetárias em decimal com 2 casas", () => {
  assert.equal(brcode.parseNumericAmount(2), "2.00");
  assert.equal(brcode.parseNumericAmount(5.5), "5.50");
  assert.equal(brcode.parseNumericAmount("10"), "10.00");
  assert.equal(brcode.parseNumericAmount("R$ 28"), "28.00");
  assert.equal(brcode.parseNumericAmount("R$ 35,50"), "35.50");
  assert.equal(brcode.parseNumericAmount("1.250,00"), "1250.00");
  assert.equal(brcode.parseNumericAmount(0), null);
  assert.equal(brcode.parseNumericAmount(-10), null);
  assert.equal(brcode.parseNumericAmount("invalido"), null);
  assert.equal(brcode.parseNumericAmount(null), null);
});

test("brcode - calculateCrc16 calcula checksum CCITT de 4 caracteres hexadecimais", () => {
  const crc = brcode.calculateCrc16("00020126330014br.gov.bcb.pix0111123456789005204000053039865802BR5904NOME6006CIDADE62070503***6304");
  assert.equal(typeof crc, "string");
  assert.equal(crc.length, 4);
  assert.match(crc, /^[0-9A-F]{4}$/);

  // Verificação de consistência e determinismo
  const crc2 = brcode.calculateCrc16("00020126330014br.gov.bcb.pix0111123456789005204000053039865802BR5904NOME6006CIDADE62070503***6304");
  assert.equal(crc, crc2);
});

test("brcode - buildPixPayload gera string Copia e Cola válida para diversos tipos de chaves", () => {
  // 1. Chave de E-mail com valor fixo R$ 5
  const emailPayload = brcode.buildPixPayload({
    key: "helena.vox@gmail.com",
    name: "Helena Soares",
    city: "Sao Paulo",
    amount: 5,
    description: "Apoio Vox",
  });
  assert.ok(emailPayload.startsWith("00020101021126"));
  assert.ok(emailPayload.includes("br.gov.bcb.pix"));
  assert.ok(emailPayload.includes("helena.vox@gmail.com"));
  assert.ok(emailPayload.includes("54045.00")); // Valor R$ 5.00
  assert.ok(emailPayload.includes("5802BR"));
  assert.ok(emailPayload.includes("5913HELENA SOARES"));
  assert.ok(emailPayload.includes("6009SAO PAULO"));
  assert.ok(emailPayload.includes("62"));
  assert.ok(emailPayload.includes("6304"));
  assert.match(emailPayload.slice(-4), /^[0-9A-F]{4}$/);

  // 2. Chave de Celular com valor R$ 2
  const phonePayload = brcode.buildPixPayload({
    key: "+5511999998888",
    name: "Juliana Santos",
    city: "Santos",
    amount: "2.00",
  });
  assert.ok(phonePayload.includes("+5511999998888"));
  assert.ok(phonePayload.includes("54042.00"));

  // 3. Chave Aleatória UUID com valor aberto (sem amount)
  const uuidPayload = brcode.buildPixPayload({
    key: "123e4567-e89b-12d3-a456-426614174000",
    name: "Lucas P2P",
    city: "Curitiba",
  });
  assert.ok(uuidPayload.includes("123e4567-e89b-12d3-a456-426614174000"));
  assert.ok(!uuidPayload.includes("540"), "Payload sem valor não deve incluir campo 54");

  // 4. Chave CPF com valor de feira R$ 28
  const cpfPayload = brcode.buildPixPayload({
    key: "12345678909",
    name: "Feira do Bairro",
    amount: "R$ 28",
  });
  assert.ok(cpfPayload.includes("12345678909"));
  assert.ok(cpfPayload.includes("540528.00"));

  // 5. Rejeição de chave vazia
  assert.throws(() => brcode.buildPixPayload({ key: "" }), /Chave Pix é obrigatória/);
  assert.throws(() => brcode.buildPixPayload({ key: null }), /Chave Pix é obrigatória/);
});
