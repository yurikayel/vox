/**
 * Testes adversariais da identidade: P-256 mínimo (`p256.js`), frase de recuperação (`recovery-phrase.js`),
 * selo das chaves do aparelho (`keystore.js`, `key-at-rest.js`, `keys.js`). Entradas truncadas, adulteradas,
 * fora da faixa e ida e volta. Lacunas viram `test.todo` (🔴 no PR); nenhum código foi alterado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as p256 from "../client/js/identity/p256.js";
import * as phrase from "../client/js/identity/recovery-phrase.js";
import * as keystore from "../client/js/identity/keystore.js";
import { sealKeysAtRest } from "../client/js/identity/key-at-rest.js";
import * as keys from "../client/js/identity/keys.js";

const SEED = Uint8Array.from({ length: 16 }, (_, i) => i);
const WORDS = "abacate afivelar inativo afivelar donzela achatar barulho beber albergue exalar cuidado banir";
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("p256: escalar fora de [1, n-1] ou de outro tipo é recusado", () => {
  for (const d of [0n, -1n, p256.N, p256.N + 1n]) assert.throws(() => p256.publicPoint(d), /faixa/, String(d));
  for (const d of [1, "1", null, undefined, 1.5]) assert.throws(() => p256.publicPoint(d), /faixa/);
});

test("p256: d=1 dá o gerador G e d=n-1 dá -G (mesmo x, y refletido)", () => {
  const g = p256.publicPoint(1n);
  assert.equal(g.x, 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n);
  const neg = p256.publicPoint(p256.N - 1n);
  assert.equal(neg.x, g.x);
  assert.notEqual(neg.y, g.y);
});

test("p256: ponto público bate com o do WebCrypto para escalares sorteados", async () => {
  for (let i = 0; i < 4; i++) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const d = p256.bytesToBigInt(Uint8Array.from(atob(jwk.d.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
    const pt = p256.publicPoint(d);
    assert.equal(b64u(p256.bigIntTo32Bytes(pt.x)), jwk.x);
    assert.equal(b64u(p256.bigIntTo32Bytes(pt.y)), jwk.y);
  }
});

test("p256: scalarFromBytes exige 40+ bytes, tipo certo, e cai sempre em [1, n-1] (incl. tudo 0x00 e 0xff)", () => {
  for (const bad of [new Uint8Array(39), [1, 2, 3], "x".repeat(40), null, new Uint8Array(0)]) {
    assert.throws(() => p256.scalarFromBytes(bad), /40 bytes/);
  }
  for (const fill of [0x00, 0xff, 0x01]) {
    const d = p256.scalarFromBytes(new Uint8Array(48).fill(fill));
    assert.ok(d >= 1n && d < p256.N, `fill ${fill}`);
  }
});

test("p256: ida e volta comprimir/descomprimir e recusa de pontos inválidos", () => {
  for (const d of [1n, 2n, 12345n, p256.N - 2n]) {
    const pt = p256.publicPoint(d);
    const back = p256.decompressPoint(p256.compressPoint(pt));
    assert.deepEqual(back, pt);
  }
  const ok = p256.compressPoint(p256.publicPoint(7n));
  const ruins = [ok.subarray(0, 32), new Uint8Array(34), Uint8Array.from([4, ...ok.subarray(1)]), Uint8Array.from([0, ...ok.subarray(1)]), null, [...ok]];
  for (const b of ruins) assert.throws(() => p256.decompressPoint(b), /inválido/);
});

test("p256: x ≥ p e x fora da curva são recusados na descompressão", () => {
  const xGrande = new Uint8Array(33).fill(0xff);
  xGrande[0] = 2;
  assert.throws(() => p256.decompressPoint(xGrande), /inválido/);
  let recusados = 0;
  for (let x = 1; x < 40; x++) {
    const raw = new Uint8Array(33);
    raw[0] = 2;
    raw[32] = x;
    try { p256.decompressPoint(raw); } catch (e) { recusados += /fora da curva/.test(e.message) ? 1 : 0; }
  }
  assert.ok(recusados > 5, "cerca de metade dos x não está na curva");
});

test("frase: ida e volta de 12 palavras (semente) e de 24 (chave) reproduz os bytes", async () => {
  assert.deepEqual([...await phrase.wordsToEntropy(WORDS)], [...SEED]);
  const words = await phrase.entropyToWords(SEED);
  assert.equal(words.join(" "), WORDS);
  const chave = crypto.getRandomValues(new Uint8Array(32));
  const w24 = await phrase.entropyToWords(chave);
  assert.equal(w24.length, 24);
  assert.deepEqual([...await phrase.wordsToEntropy(w24)], [...chave]);
});

test("frase: trocar, duplicar ou omitir uma palavra é recusado com mensagem para a pessoa", async () => {
  const w = WORDS.split(" ");
  // O verificador tem só 4 bits (BIP-39): trocar a última palavra passa em 1 de 16 casos. Aqui troca-se uma do meio.
  const trocada = [...w.slice(0, 5), "banir", ...w.slice(6)].join(" ");
  const embaralhada = [w[1], w[0], ...w.slice(2)].join(" ");
  await assert.rejects(phrase.wordsToEntropy(trocada), /errada|fora de ordem/);
  await assert.rejects(phrase.wordsToEntropy(embaralhada), /errada|fora de ordem/);
  await assert.rejects(phrase.wordsToEntropy(w.slice(0, 11).join(" ")), /12 ou 24 palavras; aqui há 11/);
  await assert.rejects(phrase.wordsToEntropy(w.concat("abacate").join(" ")), /aqui há 13/);
  await assert.rejects(phrase.wordsToEntropy(WORDS.replace("abacate", "zzzzzz")), /não é uma palavra da lista/);
});

test("frase: vazia, nula, só pontuação e entrada de outro tipo são recusadas sem travar", async () => {
  for (const bad of ["", null, undefined, "   ", "1 2 3 4", "!!!", [], [""], 0]) {
    await assert.rejects(phrase.wordsToEntropy(bad), /palavras/);
  }
});

test("frase: aceita maiúsculas, acento, vírgulas e as 4 primeiras letras; os bytes saem iguais", async () => {
  const bagunca = "  ABACATE, afivelar;inativo\nafivelar\tDÔNZELA achatar barulho beber albergue exalar cuidado banir ";
  assert.deepEqual([...await phrase.wordsToEntropy(bagunca)], [...SEED]);
  const curtas = WORDS.split(" ").map((w) => w.slice(0, 4)).join(" ");
  assert.deepEqual([...await phrase.wordsToEntropy(curtas)], [...SEED]);
  assert.deepEqual([...await phrase.wordsToEntropy(WORDS.split(" "))], [...SEED]);
});

test("frase: entropia de tamanho errado ou de outro tipo não vira palavras", async () => {
  for (const bad of [new Uint8Array(15), new Uint8Array(24), new Uint8Array(33), [1, 2], null, "x"]) {
    await assert.rejects(phrase.entropyToWords(bad), /16 ou 32 bytes/);
  }
});

test("frase: semente com tamanho errado e segredo de 32 bytes fora da faixa são recusados", async () => {
  for (const bad of [new Uint8Array(15), new Uint8Array(17), null, "abc"]) await assert.rejects(phrase.identityFromSeed(bad), /16 bytes/);
  await assert.rejects(phrase.identityFromEntropy(new Uint8Array(32)), /não formam uma chave válida/);
  await assert.rejects(phrase.identityFromEntropy(p256.bigIntTo32Bytes(p256.N)), /não formam uma chave válida/);
  await assert.rejects(phrase.identityFromEntropy(new Uint8Array(24)), /16 ou 32/);
  const fim = await phrase.identityFromEntropy(p256.bigIntTo32Bytes(p256.N - 1n));
  assert.equal(fim.kind, "chave");
});

test("frase: a mesma semente sempre dá as mesmas chaves, e assinatura ≠ DM", async () => {
  const [a, b] = await Promise.all([phrase.identityFromSeed(SEED), phrase.identityFromSeed(SEED)]);
  assert.deepEqual(a, b);
  assert.notEqual(a.signing.privateJwk.d, a.dm.privateJwk.d);
  const outra = await phrase.identityFromSeed(Uint8Array.from(SEED, (v, i) => (i === 0 ? v ^ 1 : v)));
  assert.notEqual(outra.signing.publicJwk.x, a.signing.publicJwk.x);
});

test("frase: privateKeyBytes sem chave aberta (travada, selada, vazia) lança em vez de gerar frase", async () => {
  for (const jwk of [null, undefined, {}, { locked: "vox-locked-v1", kid: "k" }, { sealed: "vox-device-v1", iv: "a", ct: "b" }]) {
    assert.throws(() => phrase.privateKeyBytes(jwk), /Sem a chave privada aberta/);
    await assert.rejects(phrase.phraseFromPrivateJwk(jwk), /Sem a chave privada aberta/);
  }
});

test("frase: toda palavra da frase de uma semente sorteada está na lista e a volta é exata (20 sementes)", async () => {
  for (let i = 0; i < 20; i++) {
    const seed = phrase.newSeed();
    const words = await phrase.entropyToWords(seed);
    assert.equal(words.length, 12);
    assert.deepEqual([...await phrase.wordsToEntropy(words.join(" "))], [...seed]);
  }
});

test("chave do aparelho: selo repetido do mesmo valor nunca repete IV nem texto cifrado", async () => {
  const lote = await Promise.all(Array.from({ length: 30 }, () => keystore.sealJson({ d: "segredo" })));
  assert.equal(new Set(lote.map((s) => s.iv)).size, lote.length);
  assert.equal(new Set(lote.map((s) => s.ct)).size, lote.length);
  assert.deepEqual(await keys.openSealed(lote[0]), { d: "segredo" });
});

test("chave do aparelho: selo adulterado, truncado ou com IV trocado lança KeystoreUnavailableError", async () => {
  const a = await keystore.sealJson({ d: "A" });
  const b = await keystore.sealJson({ d: "B" });
  const flip = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  const ruins = [{ ...a, ct: flip(a.ct) }, { ...a, iv: b.iv }, { ...a, ct: a.ct.slice(0, 8) }, { ...a, iv: a.iv.slice(0, 4) }, { ...a, ct: "@@@@" }];
  for (const r of ruins) await assert.rejects(keys.openSealed(r), keystore.KeystoreUnavailableError);
});

test("chave do aparelho: marca desconhecida passa como valor em claro; travado não abre; null passa", async () => {
  const estranho = { sealed: "vox-device-v9", iv: "a", ct: "b" };
  assert.equal(keys.isSealed(estranho), false);
  assert.deepEqual(await keys.openSealed(estranho), estranho);
  await assert.rejects(keys.openSealed({ locked: keystore.LOCKED_TAG, kid: "k" }), keystore.KeyLockedError);
  assert.equal(await keys.openSealed(null), null);
  assert.equal(await keystore.sealJson(null), null);
});

test("chave do aparelho: sealJson é idempotente e sealJsonStrict nunca devolve em claro", async () => {
  const s = await keystore.sealJson({ d: "x" });
  assert.equal(await keystore.sealJson(s), s);
  const locked = { locked: keystore.LOCKED_TAG, kid: "k" };
  assert.equal(await keystore.sealJson(locked), locked);
  const strict = await keystore.sealJsonStrict({ d: "x" });
  assert.equal(keystore.isSealed(strict), true);
});

test("selo em repouso: JSON corrompido, vazio e valor não objeto ficam intactos e não derrubam a rotina", async () => {
  const storage = new Map();
  const fake = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  storage.set("vox-local-account-v1", "{quebrado");
  storage.set("vox-dm-keypair", "null");
  storage.set("vox-accounts-vault-v1", '"texto"');
  storage.set("vox-wallet-jwk", "123");
  const antes = new Map(storage);
  assert.equal(await sealKeysAtRest(fake), 0);
  assert.deepEqual([...storage], [...antes]);
});

test("selo em repouso: sela uma vez, é idempotente e não toca em chave travada nem em carteira já cifrada por senha", async () => {
  const storage = new Map();
  const fake = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const priv = { kty: "EC", crv: "P-256", d: "SEGREDO" };
  storage.set("vox-local-account-v1", JSON.stringify({ routeId: "vx_a", privateJwk: priv }));
  storage.set("vox-dm-keypair", JSON.stringify({ privateJwk: { locked: keystore.LOCKED_TAG, kid: "k" } }));
  storage.set("vox-wallet-jwk", JSON.stringify({ kind: "passphrase", iv: "a", ct: "b" }));
  assert.equal(await sealKeysAtRest(fake), 1);
  assert.ok(!storage.get("vox-local-account-v1").includes("SEGREDO"));
  assert.equal(await sealKeysAtRest(fake), 0);
  const aberto = await keys.openSealed(JSON.parse(storage.get("vox-local-account-v1")).privateJwk);
  assert.deepEqual(aberto, priv);
});

test("selo em repouso: se o armazenamento muda durante a cifra, não sobrescreve (fica para a próxima abertura)", async () => {
  const storage = new Map();
  let lidas = 0;
  const fake = {
    getItem: (k) => {
      const v = storage.get(k) ?? null;
      if (k === "vox-local-account-v1" && ++lidas === 1) queueMicrotask(() => storage.set(k, JSON.stringify({ routeId: "vx_b", privateJwk: { d: "NOVO" } })));
      return v;
    },
    setItem: (k, v) => storage.set(k, v),
  };
  storage.set("vox-local-account-v1", JSON.stringify({ routeId: "vx_a", privateJwk: { d: "VELHO" } }));
  assert.equal(await sealKeysAtRest(fake), 0);
  assert.ok(storage.get("vox-local-account-v1").includes("NOVO"));
});

test("selo em repouso: sem IndexedDB devolve -1 e não grava nada em claro por cima", async () => {
  const salvo = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  keystore.__resetKeystoreForTests();
  try {
    const storage = new Map([["vox-local-account-v1", JSON.stringify({ privateJwk: { d: "X" } })]]);
    const fake = { getItem: (k) => storage.get(k) ?? null, setItem: () => assert.fail("não deve gravar") };
    assert.equal(await sealKeysAtRest(fake), -1);
  } finally {
    globalThis.indexedDB = salvo;
    keystore.__resetKeystoreForTests();
  }
});
