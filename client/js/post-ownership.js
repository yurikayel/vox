/** Regras de edição/exclusão — só posts locais assinados pelo autor ativo (vx_…). */

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
