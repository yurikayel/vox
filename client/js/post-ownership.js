/** Regras de edição/exclusão — só posts locais assinados pelo autor ativo (vx_…). */
import * as localAccount from "./local-account.js";

/** Título Nostr/metadata a partir do texto único do compositor. */
export function deriveTopicTitleFromBody(bodyRaw) {
  const body = String(bodyRaw || "").trim();
  if (!body) return { title: "", body: "" };
  const firstLine = body.split(/\r?\n/)[0].trim();
  const title = firstLine.slice(0, 120) || "Publicação";
  return { title, body };
}

/**
 * Evita título + corpo duplicados quando title === primeira linha do body.
 * @returns {{ mode: "empty"|"caption"|"title-body", text?: string, title?: string, body?: string }}
 */
function stripLeadingTitle(b, t) {
  let rest = b.slice(t.length);
  if (rest.startsWith("\r\n")) rest = rest.slice(2);
  else if (rest.startsWith("\n")) rest = rest.slice(1);
  return rest.trimStart();
}

export function formatPostDisplay({ title = "", body = "" } = {}) {
  const t = String(title || "").trim();
  const b = String(body || "").trim();
  if (!t && !b) return { mode: "empty" };
  if (!b || b === t) return { mode: "caption", text: t || b };

  if (b.startsWith(t)) {
    const rest = stripLeadingTitle(b, t);
    if (!rest) return { mode: "caption", text: t };
    return { mode: "title-body", title: t, body: rest };
  }

  const fallbackTitle = t || b.split(/\r?\n/)[0].trim();
  return { mode: "title-body", title: fallbackTitle, body: b };
}

export function canMutateLocalPost(post, routeId) {
  if (!routeId || !post?.id || !post?.sig) return false;
  const author = post.author || post.owner || "";
  return author === routeId;
}

export function withOwnLocalFlag(post, routeId) {
  return { ...post, isOwnLocalPost: canMutateLocalPost(post, routeId) };
}

export function mapOwnLocalFlags(posts, routeId) {
  if (!routeId || !Array.isArray(posts)) return posts || [];
  return posts.map((p) => withOwnLocalFlag(p, routeId));
}

export async function createPostTombstone(post) {
  if (!post?.id || !post?.author) throw new Error("Post inválido para exclusão");
  const deletePayload = {
    kind: "post-tombstone",
    type: "tombstone",
    id: post.id,
    author: post.author,
    ts: post.ts || Date.now(),
    editedAt: Date.now(),
  };
  return await localAccount.signPayload(deletePayload);
}
