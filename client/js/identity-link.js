/**
 * @file Identity-Link (PW-5).
 * Vinculação criptográfica bidirecional entre a identidade local P2P (vx_ / ECDSA P-256)
 * e o endereço perpétuo Arweave (RSA-PSS).
 * Prova matematicamente que o titular do vx_* e o titular da carteira on-chain são a mesma entidade.
 */

import * as localAccount from "./local-account.js";
import * as wallet from "./wallet.js";
import * as ans104 from "./ans104.js";
import * as upload from "./upload.js";

export const IDENTITY_LINK_TYPE = "identity-link";
const IDENTITY_STORAGE_KEY = "vox-identity-links-v1";

function canonicalStatementBytes(statement) {
  const sorted = JSON.stringify(statement, Object.keys(statement).sort());
  return new TextEncoder().encode(sorted);
}

function loadIdentityMap() {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { routeToAr: {}, arToRoute: {} };
  } catch {
    return { routeToAr: {}, arToRoute: {} };
  }
}

export function __resetIdentityLinksForTests() {
  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {}
}

export function saveVerifiedIdentityLink(link) {
  if (!link?.statement?.routeId || !link?.statement?.arweaveAddress) return;
  const store = loadIdentityMap();
  store.routeToAr[link.statement.routeId] = link.statement.arweaveAddress;
  store.arToRoute[link.statement.arweaveAddress] = link.statement.routeId;
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

export function getLinkedArweaveAddress(routeId) {
  if (!routeId) return null;
  return loadIdentityMap().routeToAr[routeId] || null;
}

export function getLinkedRouteId(arweaveAddress) {
  if (!arweaveAddress) return null;
  return loadIdentityMap().arToRoute[arweaveAddress] || null;
}

async function signStatementWithRsaJwk(statementBytes, currentJwk) {
  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    currentJwk,
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const rsaSigBuf = await crypto.subtle.sign(
    { name: "RSA-PSS", saltLength: 32 },
    rsaKey,
    statementBytes
  );
  return ans104.bytesToB64Url(new Uint8Array(rsaSigBuf));
}

export async function createIdentityLink({ routeId, arweaveAddress, jwk } = {}) {
  const currentRouteId = routeId || (await localAccount.getRouteId());
  const currentJwk = jwk || (await wallet.ensureWallet());
  const currentArweaveAddress = arweaveAddress || (await ans104.jwkToAddress(currentJwk));

  const baseStatement = {
    type: IDENTITY_LINK_TYPE,
    id: `il_${currentRouteId}_${currentArweaveAddress}`,
    routeId: currentRouteId,
    arweaveAddress: currentArweaveAddress,
    issuedAt: Date.now(),
  };

  const vxSigned = await localAccount.signPayload(baseStatement);
  const statement = { ...baseStatement, ts: vxSigned.ts };
  const arSig = await signStatementWithRsaJwk(canonicalStatementBytes(statement), currentJwk);

  const link = {
    statement,
    vxPubKey: vxSigned.pubKey,
    vxSig: vxSigned.sig,
    arPubKey: { kty: currentJwk.kty, n: currentJwk.n, e: currentJwk.e },
    arSig,
  };

  saveVerifiedIdentityLink(link);
  return link;
}

function hasValidLinkStructure(link) {
  if (!link?.statement || !link?.vxPubKey || !link?.vxSig || !link?.arPubKey || !link?.arSig) return false;
  if (link.statement.type !== IDENTITY_LINK_TYPE) return false;
  return Boolean(link.statement.routeId && link.statement.arweaveAddress);
}

async function verifyRsaStatementSignature(statement, arPubKey, arSig) {
  try {
    const statementBytes = canonicalStatementBytes(statement);
    const rsaVerifyKey = await crypto.subtle.importKey(
      "jwk",
      arPubKey,
      { name: "RSA-PSS", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const rsaValid = await crypto.subtle.verify(
      { name: "RSA-PSS", saltLength: 32 },
      rsaVerifyKey,
      ans104.b64UrlToBytes(arSig),
      statementBytes
    );
    return Boolean(rsaValid);
  } catch {
    return false;
  }
}

export async function verifyIdentityLink(link) {
  if (!hasValidLinkStructure(link)) return false;
  const { statement, vxPubKey, vxSig, arPubKey, arSig } = link;

  const computedRouteId = await localAccount.computeRouteId(vxPubKey);
  if (computedRouteId !== statement.routeId) return false;

  const computedArAddress = await ans104.jwkToAddress(arPubKey);
  if (computedArAddress !== statement.arweaveAddress) return false;

  const vxValid = await localAccount.verifyPayload({
    ...statement,
    author: statement.routeId,
    pubKey: vxPubKey,
    sig: vxSig,
  });
  if (!vxValid) return false;

  return verifyRsaStatementSignature(statement, arPubKey, arSig);
}

export function buildIdentityLinkArweaveTags(link) {
  return [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: IDENTITY_LINK_TYPE },
    { name: "Route-Id", value: link?.statement?.routeId || "" },
    { name: "Arweave-Address", value: link?.statement?.arweaveAddress || "" },
    { name: "Issued-At", value: String(link?.statement?.issuedAt || Date.now()) },
    { name: "Content-Type", value: "application/json" },
  ];
}

export async function publishIdentityLinkOnChain(link, { uploadFn = upload.postData } = {}) {
  const valid = await verifyIdentityLink(link);
  if (!valid) throw new Error("Link de identidade inválido ou adulterado.");
  const tags = buildIdentityLinkArweaveTags(link);
  const data = JSON.stringify(link);
  return uploadFn(data, tags, { autoCreate: true });
}
