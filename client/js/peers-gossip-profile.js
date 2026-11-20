/**
 * @module peers-gossip-profile
 * Ingest PROFILE_CARD via gossip — persiste em profile-directory, **sem** dispatchGossipPost (feed).
 */

import * as localAccount from "./identity/index.js";
import * as moderation from "./moderation.js";
import * as profileCard from "./profile-card.js";
import * as profileDirectory from "./profile-directory.js";
import * as profileNote from "./profile-note.js";

/**
 * Extrai o `routeId` a partir de um ID canônico de cartão de perfil (`pc_vx_...`).
 * @param {string} cardId ID do cartão de perfil.
 * @returns {string} `routeId` extraído ou string vazia.
 */
export function routeIdFromProfileCardId(cardId) {
  const id = String(cardId || "");
  if (!id.startsWith("pc_vx_")) return "";
  return id.slice(3);
}

/** Versão (`editedAt` e assinatura) de cada cartão já aplicado nesta sessão; o diretório guarda a mesma marca entre sessões. */
const seenCards = new Map();
const SEEN_CARDS_MAX = 2000;
const cardTime = (item) => Number(item?.editedAt || item?.ts || 0);

/** Já tenho esta versão ou uma mais nova. Mesma data com outra assinatura é outro cartão. */
function isCovered(seen, item) {
  if (!seen) return false;
  const t = cardTime(item);
  return seen.at > t || (seen.at === t && seen.sig === item.sig);
}

/**
 * PM-84: verifica se a versão do cartão já foi aplicada/vista (evita reaplicar ou repassar versão igual ou mais velha).
 * @param {object} item Item de cartão de perfil.
 * @returns {boolean} `true` se o cartão já estiver coberto.
 */
export function isProfileCardSeen(item) {
  if (isCovered(seenCards.get(item.id), item)) return true;
  const stored = profileDirectory.getProfileCard(item.routeId);
  if (stored?.gossipCardId !== item.id) return false;
  return isCovered({ at: Number(stored.gossipCardAt || 0), sig: stored.gossipCardSig }, item);
}

/**
 * Registra o cartão de perfil na janela em memória de versões já vistas.
 * @param {object} item Item de cartão de perfil assinado.
 * @returns {void}
 */
export function markProfileCardSeen(item) {
  if (!item?.id) return;
  seenCards.delete(item.id);
  if (seenCards.size >= SEEN_CARDS_MAX) seenCards.delete(seenCards.keys().next().value);
  seenCards.set(item.id, { at: cardTime(item), sig: item.sig });
}

/**
 * Marca de versão guardada junto do cartão no diretório, com o próprio cartão assinado (`signedCard`):
 * é ele que viaja na sincronização (malha e memória central) e é a única coisa que quem recebe aceita.
 * @param {object} item Cartão de perfil assinado.
 * @returns {{ gossipCardId: string, gossipCardAt: number, gossipCardSig: string, signedCard: object }} Carimbo de versão.
 */
export const seenStamp = (item) => ({ gossipCardId: item.id, gossipCardAt: cardTime(item), gossipCardSig: item.sig || "", signedCard: item });

/**
 * @param {object} item — payload assinado já verificado por verifyPayload
 * @returns {Promise<boolean>} true se o cartão é novo e foi aplicado (e deve seguir adiante na malha)
 */
export async function applyVerifiedProfileCardItem(item) {
  if (isProfileCardSeen(item)) return false;
  const applied = applyProfileCard(item);
  if (applied) markProfileCardSeen(item);
  return applied;
}

function applyProfileCard(item) {
  // Validar antes de olhar a validade: um cartão vencido só apaga o cartão de quem o assinou.
  const check = profileCard.validateProfileCardItem(item);
  if (check.reason === "expired") {
    profileDirectory.removeProfileCard(item.routeId);
    return true;
  }
  if (!check.ok) return false;
  if (!item.discoverable) {
    profileDirectory.removeProfileCard(item.routeId);
    return true;
  }
  // Cartão sem nome (de app antigo) não é guardado nem repassado.
  if (!profileDirectory.hasChosenCardName({ name: item.displayName, routeId: item.routeId })) return false;
  profileDirectory.setProfileCard(item.routeId, {
    name: item.displayName || "",
    avatarUrl: item.avatarUrl || "",
    bio: item.bio || "",
    pronouns: item.pronouns || "",
    gender: item.gender || "",
    orientation: item.orientation || "",
    discoverable: true,
    ...seenStamp(item),
  });
  if (item.note) profileNote.ingestRemoteNote(item.routeId, item.note, item.noteAt || item.editedAt);
  return true;
}

/**
 * Cartão de diretório que chega da sincronização (malha ao conectar ou memória central). Só vale o cartão
 * assinado que ele carrega (`signedCard`), conferido pela chave do próprio dono; os campos soltos do diretório
 * (nome, foto, bio) não são confiados, porque qualquer par ou servidor poderia escrevê-los para outra conta.
 *
 * @param {object} card Entrada de diretório recebida (`routeId` + `signedCard`).
 * @returns {Promise<boolean>} true se o cartão assinado era novo e foi aplicado.
 */
export async function applyDirectoryProfileCard(card) {
  const signed = card?.signedCard;
  if (!signed || typeof signed !== "object") return false;
  const routeId = String(card.routeId || card.author || "").trim();
  if (!routeId || signed.routeId !== routeId || moderation.shouldDropGossip(routeId)) return false;
  if (!(await localAccount.verifyPayload(signed))) return false;
  return applyVerifiedProfileCardItem(signed);
}

/*
 * Tetos de tamanho do gossip P2P e contagem do descarte. Par malicioso manda payload gigante ou tipo estranho;
 * o aparelho descarta em silêncio (sem lançar) e só incrementa um contador. Valores coerentes com o projeto:
 * 1 MiB por mensagem (quadro do relay de sinalização, `relay/signaling.py`), 512 KiB por post/lápide
 * (`MAX_ITEM_BYTES` da memória central) e 64 KiB por cartão. Vivem aqui porque este módulo já está no precache do SW.
 */
/** Teto da mensagem inteira recebida da malha (item + blob + metadados), em bytes UTF-8. */
export const MAX_GOSSIP_MESSAGE_BYTES = 1024 * 1024;
/** Teto de um post, edição ou lápide recebido, em bytes UTF-8. */
export const MAX_GOSSIP_ITEM_BYTES = 512 * 1024;
/** Teto de um cartão de perfil recebido, em bytes UTF-8. */
export const MAX_PROFILE_CARD_BYTES = 64 * 1024;

const drops = { oversizedMessage: 0, oversizedItem: 0, oversizedProfileCard: 0, unknownType: 0 };

/**
 * Soma um descarte ao contador do motivo dado.
 * @param {"oversizedMessage"|"oversizedItem"|"oversizedProfileCard"|"unknownType"} reason Motivo do descarte.
 */
export function noteGossipDrop(reason) {
  if (Object.hasOwn(drops, reason)) drops[reason] += 1;
}

/**
 * Cópia dos contadores de descarte desta sessão (memória; zeram ao recarregar).
 * @returns {{oversizedMessage: number, oversizedItem: number, oversizedProfileCard: number, unknownType: number}} Contagens.
 */
export function getGossipDropCounts() {
  return { ...drops };
}

/** Zera os contadores (uso em testes). */
export function resetGossipDropCounts() {
  for (const key of Object.keys(drops)) drops[key] = 0;
}

/**
 * Valor serializado passa do teto? Valor que não serializa (ciclo, BigInt) conta como acima do teto.
 * @param {unknown} value Mensagem ou item.
 * @param {number} maxBytes Teto em bytes UTF-8.
 * @returns {boolean} true se deve ser descartado.
 */
export function exceedsBytes(value, maxBytes) {
  try {
    const text = JSON.stringify(value);
    if (typeof text !== "string") return false;
    // Cada unidade UTF-16 ocupa 1 a 3 bytes: acima do teto em unidades já passou; abaixo de teto/3 não passa; no meio, mede.
    return text.length > maxBytes || (text.length * 3 > maxBytes && new TextEncoder().encode(text).length > maxBytes);
  } catch {
    return true;
  }
}
