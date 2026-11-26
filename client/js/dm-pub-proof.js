/**
 * @file Prova de posse do anúncio da chave de DM: a conta assina "esta chave, esta rota, este par".
 * Quem recebe só registra a chave quando a assinatura confere, o autor é o endereço anunciado e a
 * chave bate com a assinada. Os campos assinados são planos (sem objeto aninhado), para valerem
 * nas duas versões de assinatura (v1 e v2).
 * @module dm-pub-proof
 */
import { verifyPayload } from "./signed-verify.js";

/** Tipo do corpo assinado do anúncio. */
export const DM_PUB_PROOF_TYPE = "vox-dm-pub-v1";

/** Último `ts` aceito por endereço, para não voltar a uma prova mais antiga. @type {Map<string, number>} */
const lastTsByAddress = new Map();

/**
 * Pede à conta que assine o anúncio da chave de DM neste par.
 * @param {(payload: object) => Promise<object>} signPayload `localAccount.signPayload`.
 * @param {{kty: string, crv: string, x: string, y: string}} dmPub Chave pública de DM.
 * @param {string} peerId Id do par na malha.
 * @returns {Promise<object>} Prova assinada, para ir em `dmPub.proof`.
 */
export function buildDmPubProof(signPayload, dmPub, peerId) {
  return signPayload({
    type: DM_PUB_PROOF_TYPE,
    dmKty: dmPub.kty,
    dmCrv: dmPub.crv,
    dmX: dmPub.x,
    dmY: dmPub.y,
    peerId,
    ts: Date.now(),
  });
}

/**
 * A prova assinada descreve exatamente esta chave, rota e par?
 * @param {object} proof Prova recebida.
 * @param {string} address Rota anunciada.
 * @param {string} peerId Par que anunciou.
 * @param {object} dmPub Chave anunciada.
 * @returns {boolean}
 */
function proofMatches(proof, address, peerId, dmPub) {
  return (
    proof.type === DM_PUB_PROOF_TYPE &&
    proof.author === address &&
    proof.peerId === peerId &&
    proof.dmKty === dmPub.kty &&
    proof.dmCrv === dmPub.crv &&
    proof.dmX === dmPub.x &&
    proof.dmY === dmPub.y &&
    Number.isFinite(proof.ts)
  );
}

/**
 * Confere o anúncio. Sem prova, prova de outra rota/par/chave ou mais velha que a última: recusa.
 * Nunca lança.
 * @param {string} address Rota anunciada (`vx_…`).
 * @param {string} peerId Par que anunciou.
 * @param {object|null} dmPub Chave anunciada, com `proof`.
 * @returns {Promise<boolean>} `true` só quando o anúncio é da dona da rota.
 */
export async function acceptDmPubAnnouncement(address, peerId, dmPub) {
  const proof = dmPub?.proof;
  if (!proof || typeof proof !== "object" || !proofMatches(proof, address, peerId, dmPub)) return false;
  if (proof.ts < (lastTsByAddress.get(address) ?? 0)) return false;
  if (!(await verifyPayload(proof))) return false;
  lastTsByAddress.set(address, proof.ts);
  return true;
}

/**
 * Esquece os `ts` guardados (só para testes).
 * @returns {void}
 */
export function resetDmPubProofState() {
  lastTsByAddress.clear();
}
