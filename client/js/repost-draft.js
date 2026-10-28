/** Draft puro de republicação — sem peers/DOM. */

export const REPOST_LABEL = "Republicar na praça";
export const REPOST_HINT =
  "Cria um post local que cita o original. Feed cronológico — sem impulsionar.";
const EXCERPT_MAX = 160;

export function excerptOf(post, max = EXCERPT_MAX) {
  const raw = String(post?.body || post?.title || "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max - 1)}…`;
}

export function newTopicId() {
  return `top_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOriginalId(post) {
  return String(post?.originalId || "").trim();
}

export function isRepost(post) {
  return Boolean(post?.originalId || post?.isRepost);
}

export function postsCiting(posts, originalId) {
  const id = String(originalId || "").trim();
  if (!id || !Array.isArray(posts)) return [];
  return posts.filter((p) => getOriginalId(p) === id);
}

export function countCites(posts, originalId) {
  return postsCiting(posts, originalId).length;
}

export function findOwnCite(posts, originalId, authorId) {
  const author = String(authorId || "").trim();
  return (
    postsCiting(posts, originalId).find((p) => {
      if (p.isOwnLocalPost) return true;
      const who = String(p.author || p.owner || "").trim();
      return Boolean(author && who === author);
    }) || null
  );
}

export function buildRepostDraft(original, { id } = {}) {
  const originalId = String(original?.id || "").trim();
  if (!originalId) return null;
  const author = String(original.author || original.owner || "").trim();
  const excerpt = excerptOf(original);
  const cite = author || "autor original";
  return {
    id: id || newTopicId(),
    type: "topic",
    communityId: original.communityId || "geral",
    title: "Republicação na praça",
    body: `Republicação de ${cite}\n#/t/${originalId}\n\n${excerpt}`,
    originalId,
    originalAuthor: author,
    excerpt,
    isRepost: true,
  };
}
