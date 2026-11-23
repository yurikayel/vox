/**
 * @file Post guardado: a forma assinada (o que vai para a rede) e a forma de tela (com padrões).
 * O aparelho grava o post exatamente como chegou assinado, com a marca `_wire`; os padrões só entram
 * na leitura. Antes, a gravação misturava ~35 campos padrão no registro, e o post guardado deixava de
 * bater com a assinatura: a sincronização ao conectar e a memória central repassavam posts que quem
 * recebe descarta.
 */
import * as hashtags from "./hashtags.js";

/** Campo marcador que identifica registro gravado na forma assinada original (`_wire`). */
export const WIRE_MARK = "_wire";
/** Mídia anexada no aparelho (vídeo, áudio ou imagem de um `mediaRef`): fica no registro, fora da assinatura. */
export const MEDIA_FIELD = "_media";
const LOCAL_ONLY_KEYS = new Set(["tags", "isLocalP2p", WIRE_MARK, MEDIA_FIELD]);

/** Valores padrão aplicados apenas na leitura de posts locais para exibição em tela. */
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

/**
 * Envolve o post na forma armazenada em IndexedDB adicionando a marca `_wire`.
 * @param {object} post Post assinado recebido ou criado.
 * @returns {object} Registro pronto para persistência local.
 */
export const toStoredRecord = (post) => ({ ...post, [WIRE_MARK]: 1 });

/**
 * Converte um registro armazenado para a forma de tela com padrões, hashtags e `isLocalP2p`.
 * @param {object} record Registro lido do armazenamento local.
 * @returns {object} Post normalizado para exibição.
 */
export function normalizeLocalPost(record) {
  const { [WIRE_MARK]: _mark, [MEDIA_FIELD]: media, ...post } = record;
  const combinedText = `${post.title || ""} ${post.body || ""} ${post.description || ""}`;
  return {
    ...LOCAL_POST_DEFAULTS,
    ...post,
    ...media,
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

/**
 * Diz se o campo tem o valor padrão legado acrescentado pela normalização antiga.
 * @param {string} key Campo
 * @param {*} value Valor
 * @returns {boolean} `true` se for.
 */
const isLegacyDefault = (key, value) => key in LOCAL_POST_DEFAULTS && Object.is(LOCAL_POST_DEFAULTS[key], value);

/** Registro gravado antes da marca: tira o que a normalização antiga acrescentou (melhor esforço; quem recebe confere a assinatura). */
function stripLegacyFields(record) {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    if (!LOCAL_ONLY_KEYS.has(key) && !isLegacyDefault(key, value)) out[key] = value;
  }
  return out;
}

/**
 * Recupera a forma assinada limpa do registro para repasse na rede ou verificação.
 * @param {object} record Registro local ou normalizado.
 * @returns {object} Payload sem campos apenas-locais (`_wire`, `_media`, etc.).
 */
export function toWireForm(record) {
  if (!record || typeof record !== "object") return record;
  if (record[WIRE_MARK]) {
    const { [WIRE_MARK]: _mark, [MEDIA_FIELD]: _media, ...wire } = record;
    return wire;
  }
  return record.isLocalP2p ? stripLegacyFields(record) : record;
}
