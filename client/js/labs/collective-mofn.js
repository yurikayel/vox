/**
 * Lab T02 — multi-assinatura M-de-N (ECDSA P-256).
 * Não é threshold/Shamir; não toca a conta de produção.
 */

export const SCHEMA = "vox-collective-manifesto-lab-v0";
export const LAB_SENTENCE =
  "Perfil coletivo é tese/lab; sua conta continua 1 chave neste aparelho.";

export function bytesToB64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    bin += String.fromCharCode(arr[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64UrlToBytes(b64url) {
  let b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function publicJwkLite(jwk) {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export function canonicalString(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

export function encodeBody(manifest) {
  const { signatures: _s, ...body } = manifest;
  return new TextEncoder().encode(canonicalString(body));
}

export async function computeRouteId(pubJwk) {
  if (!pubJwk?.x || !pubJwk?.y) return "";
  const raw = new TextEncoder().encode(`P-256:${pubJwk.x}:${pubJwk.y}`);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return "vx_" + bytesToB64Url(hash).slice(0, 20);
}

export async function generateMember() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = publicJwkLite(await crypto.subtle.exportKey("jwk", pair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const routeId = await computeRouteId(publicJwk);
  return { routeId, publicJwk, privateJwk };
}

export function publicMember(member) {
  return { routeId: member.routeId, publicJwk: publicJwkLite(member.publicJwk) };
}

function assertThreshold(n, m) {
  if (!Number.isInteger(m) || m < 1 || m > n) {
    throw new Error("threshold inválido");
  }
}

export function createDraft({ name, members, threshold, statement, issuedAt }) {
  const pubs = members.map(publicMember).sort((a, b) => a.routeId.localeCompare(b.routeId));
  assertThreshold(pubs.length, Number(threshold));
  return {
    schema: SCHEMA,
    kind: "lab",
    name: String(name || "").trim(),
    threshold: Number(threshold),
    members: pubs,
    statement: String(statement || ""),
    issuedAt: issuedAt || Date.now(),
    signatures: [],
  };
}

async function importSignKey(privateJwk) {
  return crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function importVerifyKey(publicJwk) {
  return crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
}

function memberOf(manifest, routeId) {
  return manifest.members.find((m) => m.routeId === routeId) || null;
}

export async function signAsMember(manifest, member) {
  const expected = await computeRouteId(member.publicJwk);
  if (!expected || expected !== member.routeId) throw new Error("routeId ≠ JWK");
  if (!memberOf(manifest, member.routeId)) throw new Error("não é membro");
  const key = await importSignKey(member.privateJwk);
  const buf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encodeBody(manifest)
  );
  return { routeId: member.routeId, sig: bytesToB64Url(buf) };
}

export function withSignature(manifest, signature) {
  const rest = manifest.signatures.filter((s) => s.routeId !== signature.routeId);
  return { ...manifest, signatures: [...rest, signature] };
}

export async function signWithMembers(manifest, members, k) {
  let out = manifest;
  const take = members.slice(0, k);
  for (const member of take) {
    out = withSignature(out, await signAsMember(out, member));
  }
  return out;
}

export async function verifySignature(manifest, signature) {
  const member = memberOf(manifest, signature?.routeId);
  if (!member || !signature?.sig) return false;
  const expected = await computeRouteId(member.publicJwk);
  if (expected !== member.routeId) return false;
  try {
    const key = await importVerifyKey(member.publicJwk);
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64UrlToBytes(signature.sig),
      encodeBody(manifest)
    );
  } catch {
    return false;
  }
}

export function validateShape(manifest) {
  if (!manifest || manifest.schema !== SCHEMA) return "schema";
  if (manifest.kind !== "lab") return "kind";
  if (!Array.isArray(manifest.members) || !Array.isArray(manifest.signatures)) return "shape";
  const m = manifest.threshold;
  if (!Number.isInteger(m) || m < 1 || m > manifest.members.length) return "threshold";
  return "";
}

async function countValidSignatures(manifest) {
  const seen = new Set();
  let validCount = 0;
  for (const sig of manifest.signatures) {
    if (!sig?.routeId || seen.has(sig.routeId)) continue;
    seen.add(sig.routeId);
    if (await verifySignature(manifest, sig)) validCount += 1;
  }
  return validCount;
}

export async function verifyManifest(manifest) {
  const required = Number(manifest?.threshold) || 0;
  const shapeErr = validateShape(manifest);
  if (shapeErr) return { ok: false, validCount: 0, required, reason: shapeErr };
  const validCount = await countValidSignatures(manifest);
  const ok = validCount >= manifest.threshold;
  return { ok, validCount, required: manifest.threshold, reason: ok ? "ok" : "below-threshold" };
}
