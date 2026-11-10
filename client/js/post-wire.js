/**
 * @file Post guardado: a forma assinada (o que vai para a rede) e a forma de tela (com padrões).
 * O aparelho grava o post exatamente como chegou assinado, com a marca `_wire`; os padrões só entram
 * na leitura. Antes, a gravação misturava ~35 campos padrão no registro, e o post guardado deixava de
 * bater com a assinatura: a sincronização ao conectar e a memória central repassavam posts que quem
 * recebe descarta.
 */
import * as hashtags from "./hashtags.js";

export const WIRE_MARK = "_wire";
const LOCAL_ONLY_KEYS = new Set(["tags", "isLocalP2p", WIRE_MARK]);

export const LOCAL_POST_DEFAULTS = Object.freeze({
  communityId: "",
  replyTo: "",
  proposalId: "",
  postId: "",
  frame: null,
  frameKind: "",
  buttonIndex: 0,
  buttonLabel: "",
  inputText: "",
  title: "",
  body: "",
  diffText: "",
  closesAt: 0,
  minQuorum: 0,
  state: "open",
  choice: "",
  joinedAt: 0,
  category: "",
  description: "",
  authorDisplay: "",
  authorAvatar: "",
  authorHandle: "",
  image: "",
  imageAlt: "",
  externalPain: "",
  voxResolution: "now",
  priceLabel: "",
  locationLabel: "",
  contactPix: "",
  listingStatus: "available",
  commercialEnabled: false,
  likesCount: 0,
  repliesCount: 0,
  pubKey: null,
  sig: "",
  editedAt: 0,
});

/** O que vai para o banco: o post como chegou, mais a marca. */
export const toStoredRecord = (post) => ({ ...post, [WIRE_MARK]: 1 });

/** Forma de tela: padrões, hashtags e `isLocalP2p` (o que o app sempre leu). */
export function normalizeLocalPost(record) {
  const { [WIRE_MARK]: _mark, ...post } = record;
  const combinedText = `${post.title || ""} ${post.body || ""} ${post.description || ""}`;
  return {
    ...LOCAL_POST_DEFAULTS,
    ...post,
    id: post.id,
    type: post.type,
    author: post.author || post.owner || "",
    buttonIndex: Number(post.buttonIndex) || 0,
    commercialEnabled: Boolean(post.commercialEnabled),
    likesCount: Number(post.likesCount) || 0,
    repliesCount: Number(post.repliesCount) || 0,
    tags: hashtags.extractHashtags(combinedText),
    ts: post.ts || post.createdAt || Date.now(),
    isLocalP2p: true,
  };
}

const isLegacyDefault = (key, value) => key in LOCAL_POST_DEFAULTS && Object.is(LOCAL_POST_DEFAULTS[key], value);

/** Registro gravado antes da marca: tira o que a normalização antiga acrescentou (melhor esforço; quem recebe confere a assinatura). */
function stripLegacyFields(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (!LOCAL_ONLY_KEYS.has(key) && !isLegacyDefault(key, value)) out[key] = value;
  }
  return out;
}

/** Forma assinada do registro, para repassar ou assinar de novo. */
export function toWireForm(record) {
  if (!record || typeof record !== "object") return record;
  if (record[WIRE_MARK]) {
    const { [WIRE_MARK]: _mark, ...wire } = record;
    return wire;
  }
  return record.isLocalP2p ? stripLegacyFields(record) : record;
}
