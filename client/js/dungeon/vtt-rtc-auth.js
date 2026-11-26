/**
 * @file Aperto de mão autenticado do canal da Mesa pela rede: cada ponta assina, com a chave da mesa, quem é, com
 * quem fala e as impressões DTLS (`a=fingerprint:` do SDP) das duas pontas. Quem confere exige que a chave derive o
 * `routeId` do elo e que as impressões sejam as do próprio elo, então uma prova copiada de outra conexão não vale.
 * Funções puras, sem estado. Carregado sob demanda junto do transporte, fora de `SHELL_ASSETS`.
 * @module dungeon/vtt-rtc-auth
 */
import { deriveRouteIdFromJwk } from "./vtt-sync-codec.js";

/** Tipo do quadro de prova. */
export const VTT_AUTH_KIND = "VTT_AUTH";
const DOMAIN = "vox-vtt-auth-v1";
const ENC = new TextEncoder();
const ECDSA_GEN = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SIG = { name: "ECDSA", hash: "SHA-256" };

/**
 * Bytes em base64url, sem preenchimento.
 * @param {Uint8Array} bytes Bytes.
 * @returns {string} Texto base64url.
 */
function toB64Url(bytes) {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Texto base64url em bytes.
 * @param {string} text Texto base64url.
 * @returns {Uint8Array} Bytes.
 */
function fromB64Url(text) {
  const norm = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Impressão `a=fingerprint:` do SDP (algoritmo e valor, em minúsculas).
 * @param {{sdp?: string}|null|undefined} desc Descrição de sessão (`localDescription` ou `remoteDescription`).
 * @returns {string|null} Impressão; `null` quando o SDP não a traz ou traz mais de um valor distinto.
 */
export function sdpFingerprint(desc) {
  const found = [...String(desc?.sdp || "").matchAll(/^a=fingerprint:(\S+)[ \t]+(\S+)/gim)];
  const distinct = new Set(found.map((m) => `${m[1]} ${m[2]}`.toLowerCase()));
  return distinct.size === 1 ? [...distinct][0] : null;
}

/**
 * Concatena os campos, cada um com o tamanho em 4 bytes (big-endian) na frente.
 * @param {string[]} fields Campos de texto.
 * @returns {Uint8Array} Bytes com prefixo de tamanho.
 */
function lengthPrefixed(fields) {
  const parts = fields.map((f) => ENC.encode(f));
  const out = new Uint8Array(parts.reduce((n, p) => n + 4 + p.length, 0));
  let at = 0;
  parts.forEach((p) => {
    new DataView(out.buffer).setUint32(at, p.length, false);
    out.set(p, at + 4);
    at += 4 + p.length;
  });
  return out;
}

/**
 * Bytes assinados: domínio, 0x00, depois impressão e rota de quem assina e do outro lado.
 * @param {{signer: string, other: string}} fps Impressões de quem assina e do outro.
 * @param {{signer: string, other: string}} ids `routeId` de quem assina e do outro.
 * @returns {Uint8Array} Transcrição.
 */
export function authTranscript(fps, ids) {
  const head = ENC.encode(DOMAIN + "\0");
  const body = lengthPrefixed([fps.signer, fps.other, ids.signer, ids.other]);
  return Uint8Array.from([...head, ...body]);
}

/**
 * Monta o quadro de prova desta ponta.
 * @param {{privateKey: CryptoKey, publicJwk: object, routeId: string}} keypair Par de chaves da mesa.
 * @param {{own: string, remote: string}} fps Impressão local e a do outro lado.
 * @param {string} remoteId `routeId` do elo.
 * @returns {Promise<{kind: string, v: number, pub: object, sig: string}>} Quadro `VTT_AUTH`.
 */
export async function signVttAuth(keypair, fps, remoteId) {
  const bytes = authTranscript({ signer: fps.own, other: fps.remote }, { signer: keypair.routeId, other: remoteId });
  const sig = await crypto.subtle.sign(ECDSA_SIG, keypair.privateKey, bytes);
  return { kind: VTT_AUTH_KIND, v: 1, pub: keypair.publicJwk, sig: toB64Url(new Uint8Array(sig)) };
}

/**
 * Confere o quadro do outro lado. Nunca lança.
 * @param {object} frame Quadro recebido.
 * @param {{own: string, remote: string}} fps Impressão local e a do outro lado (as deste elo).
 * @param {{own: string, remote: string}} ids `routeId` local e o do elo (o da sinalização).
 * @returns {Promise<boolean>} `true` só quando a chave deriva `ids.remote` e a assinatura cobre as impressões deste elo.
 */
export async function verifyVttAuth(frame, fps, ids) {
  try {
    if (frame?.v !== 1 || typeof frame.sig !== "string" || !frame.pub) return false;
    if ((await deriveRouteIdFromJwk(frame.pub)) !== ids.remote) return false;
    const pub = await crypto.subtle.importKey("jwk", frame.pub, ECDSA_GEN, false, ["verify"]);
    const bytes = authTranscript({ signer: fps.remote, other: fps.own }, { signer: ids.remote, other: ids.own });
    return await crypto.subtle.verify(ECDSA_SIG, pub, fromB64Url(frame.sig), bytes);
  } catch {
    return false;
  }
}

/**
 * Impressões das duas pontas deste elo, lidas do SDP.
 * @param {{localDescription?: object, remoteDescription?: object}} pc Conexão.
 * @returns {{own: string, remote: string}|null} Impressões, ou `null` se alguma falta (o elo não autentica).
 */
export function linkFingerprints(pc) {
  const own = sdpFingerprint(pc.localDescription);
  const remote = sdpFingerprint(pc.remoteDescription);
  return own && remote ? { own, remote } : null;
}
