/**
 * Espelho local de índice de comunidade no relay HTTP (V-I03).
 * O cliente monta JSON leve e envia POST /vox/mirror para acelerar leitura na LAN.
 */

import { getRelayHttpUrl } from "./inbox.js";

export function buildCommunityMirrorIndex(community, topics = [], options = {}) {
  const communityId = String(community?.communityId || community?.id || "").trim();
  if (!communityId) {
    throw new Error("communityId obrigatório");
  }

  const normalizedTopics = (topics || [])
    .map((t) => ({
      id: String(t.id || t.txId || "").trim(),
      title: t.title || t.topicTitle || "Tópico",
      owner: t.owner || "",
    }))
    .filter((t) => t.id);

  return {
    communityId,
    title: community.title || communityId,
    description: community.description || "",
    owner: community.owner || "",
    topics: normalizedTopics,
    mirroredAt: options.mirroredAt || new Date().toISOString(),
    source: options.source || "vox-pwa",
  };
}

export async function postCommunityMirrorToRelay(indexPayload, baseUrl = null) {
  const communityId = indexPayload?.communityId;
  if (!communityId) {
    throw new Error("communityId obrigatório");
  }
  const root = (baseUrl || getRelayHttpUrl()).replace(/\/+$/, "");
  const url = `${root}/vox/mirror`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(indexPayload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Falha ao espelhar comunidade (HTTP ${res.status}): ${text}`);
  }
  return await res.json();
}

export async function mirrorCommunityToRelay(community, topics, baseUrl = null, options = {}) {
  const index = buildCommunityMirrorIndex(community, topics, options);
  const result = await postCommunityMirrorToRelay(index, baseUrl);
  return { index, result };
}

/** Best-effort: não propaga erro (ex.: relay offline). */
export async function tryMirrorCommunityToRelay(community, topics, baseUrl = null) {
  try {
    return await mirrorCommunityToRelay(community, topics, baseUrl);
  } catch {
    return null;
  }
}
