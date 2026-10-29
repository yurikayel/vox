import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as upload from "../client/js/upload.js";
import * as ans from "../client/js/ans104.js";

test("upload - buildTags gera tags mandatárias do Vox", () => {
  const tags = upload.buildTags("community", {
    "Community-Id": "brasil-livre",
    Title: "Brasil Livre",
  });

  const appName = tags.find((t) => t.name === "App-Name");
  const typeTag = tags.find((t) => t.name === "Type");
  const commId = tags.find((t) => t.name === "Community-Id");
  const title = tags.find((t) => t.name === "Title");

  assert.ok(appName, "Tag App-Name deve existir");
  assert.equal(appName.value, "vox-brasil");
  assert.equal(typeTag.value, "community");
  assert.equal(commId.value, "brasil-livre");
  assert.equal(title.value, "Brasil Livre");
});

test("upload - buildTags ignora campos vazios e nulos", () => {
  const tags = upload.buildTags("topic", {
    "Topic-Title": "Titulo Valido",
    Vazio: "",
    Nulo: null,
    Indefinido: undefined,
  });

  assert.equal(tags.some((t) => t.name === "Vazio"), false);
  assert.equal(tags.some((t) => t.name === "Nulo"), false);
  assert.equal(tags.some((t) => t.name === "Indefinido"), false);
  assert.equal(tags.find((t) => t.name === "Topic-Title")?.value, "Titulo Valido");
});

test("upload - postData exige carteira conectada quando autoCreate é false", async () => {
  localStorage.clear();
  await assert.rejects(
    () => upload.postData({ test: 123 }, [], { autoCreate: false }),
    /Nenhuma carteira encontrada/
  );
});

test("ans104 - serializeTags gera Avro válido com terminação 0x00", () => {
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: "topic" },
  ];
  const bytes = ans.serializeTags(tags);
  assert.ok(bytes.length > 0);
  assert.equal(bytes[bytes.length - 1], 0x00, "Array Avro deve terminar com 0x00");
});

test("ans104 - createSignedDataItem gera item ANS-104 com assinatura verificável", async () => {
  const crypto = globalThis.crypto;
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const pubJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  const payload = JSON.stringify({ title: "Teste", body: "Olá Permaweb" });
  const tags = [{ name: "App-Name", value: "vox-brasil" }];
  const item = await ans.createSignedDataItem(payload, tags, jwk);

  assert.ok(item.id && item.id.length > 30, "ID em base64url");
  assert.ok(item.bytes.length > 1000, "Bytes de cabeçalho + payload");

  // Verifica assinatura via crypto.subtle.verify
  const signature = item.bytes.slice(2, 514);
  const owner = item.bytes.slice(514, 1026);
  const anchor = item.bytes.slice(1028, 1060);
  const tagBytes = ans.serializeTags(tags);
  const dataBytes = new TextEncoder().encode(payload);

  const message = await ans.deepHash([
    new TextEncoder().encode("dataitem"),
    new TextEncoder().encode("1"),
    new TextEncoder().encode("1"),
    owner,
    new Uint8Array(0),
    anchor,
    tagBytes,
    dataBytes,
  ]);

  const pubKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: pubJwk.n, e: pubJwk.e, alg: "PS256", ext: true },
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify({ name: "RSA-PSS", saltLength: 32 }, pubKey, signature, message);
  assert.equal(valid, true, "Assinatura deve ser matematicamente válida");
});

test("upload - postData com mock de fetch roteia itens <= 100 KiB para o Turbo (via: 'turbo')", async () => {
  const crypto = globalThis.crypto;
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Mock global fetch para interceptar chamada do Turbo
  const originalFetch = globalThis.fetch;
  let interceptedUrl = null;
  let interceptedContentType = null;
  let interceptedBodyLength = null;

  globalThis.fetch = async (url, opts = {}) => {
    interceptedUrl = url;
    interceptedContentType = opts.headers?.["Content-Type"];
    interceptedBodyLength = opts.body?.length || opts.body?.byteLength;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "mock_tx_123", winc: "0" }),
    };
  };

  try {
    const res = await upload.postData({ title: "Título", body: "Texto" }, [{ name: "Type", value: "topic" }], { jwk });
    assert.equal(res.success, true);
    assert.equal(res.via, "turbo");
    assert.ok(interceptedUrl.includes("ardrive.io") || interceptedUrl.includes("turbo-gateway.com"));
    assert.equal(interceptedContentType, "application/octet-stream");
    assert.ok(interceptedBodyLength > 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upload - postBinary envia bytes diretamente para o Turbo", async () => {
  const crypto = globalThis.crypto;
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-PSS", modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "mock_bin_123" }),
  });

  try {
    const rawPhoto = new Uint8Array([1, 2, 3, 4, 5]);
    const res = await upload.postBinary(rawPhoto, [{ name: "Type", value: "photo" }], { jwk });
    assert.equal(res.success, true);
    assert.equal(res.via, "turbo");
    assert.ok(res.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
