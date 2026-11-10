import * as defaultUpload from "./upload.js";
import * as defaultWallet from "./wallet.js";
import * as defaultPermanence from "./permanence-notice.js";
import * as mediaBlob from "./media-blob.js";

/** Dependências trocáveis em teste: módulos ES não aceitam stub por atribuição. */
const DEFAULT_DEPS = Object.freeze({ upload: defaultUpload, wallet: defaultWallet, permanence: defaultPermanence });

/**
 * Sobe ao Arweave a mídia de um post, a partir do blob de `mediaBlob.detachMedia`
 * (`{ hash, mime, byteLength, data }`, com `data` em data URL). Devolve o id da transação ou null.
 */
export async function uploadTopicMediaToPermaweb(blob, aspectRatio, upload = defaultUpload) {
  if (!blob?.data || !mediaBlob.isDataUrl(blob.data)) return null;
  const rawBytes = mediaBlob.dataUrlToUint8Array(blob.data);
  if (rawBytes.length > upload.FREE_TIER_MAX_BYTES) return null;

  const mediaTags = upload.buildTags("media", {
    "Content-Type": blob.mime || "image/webp",
    "Media-Type": blob.mime || "image/webp",
    "Blob-Hash": blob.hash,
    "Aspect-Ratio": aspectRatio || "original",
  });
  const mediaRes = await upload.postBinary(rawBytes, mediaTags);
  return mediaRes?.success ? mediaRes.id : null;
}

/** Publica o tópico no Arweave (mídia primeiro, ligada pela tag `Media-Tx`). Sem carteira, não faz nada. */
export async function uploadTopicToPermaweb({ topicId, commSlug, title, body, blob, aspectRatio }, deps = DEFAULT_DEPS) {
  const { upload, wallet, permanence } = deps;
  if (!wallet.hasWallet()) return null;
  if (!(await permanence.confirmPermanentPublish())) return permanence.MESH_ONLY_RESULT;
  const ratio = aspectRatio || "original";
  try {
    const mediaTxId = await uploadTopicMediaToPermaweb(blob, ratio, upload);
    const tags = upload.buildTags("topic", {
      "Community-Id": commSlug,
      "Topic-Title": title,
      Title: title,
      "Local-Origin-Id": topicId,
      ...(mediaTxId ? { "Media-Tx": mediaTxId, "Media-Type": blob?.mime || "image/webp", "Aspect-Ratio": ratio } : {}),
    });
    return await upload.postData({ title, body, communityId: commSlug, mediaTx: mediaTxId, aspectRatio: ratio }, tags);
  } catch (err) {
    console.warn("Falha no upload Permaweb:", err);
    return null;
  }
}
