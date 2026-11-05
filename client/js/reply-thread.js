/** @file Árvore de respostas (pura, sem DOM): agrupamento por parentId e achatamento com profundidade limitada. */

export const MAX_THREAD_DEPTH = 4;

/**
 * Agrupa respostas por pai. Órfãs (parentId ausente no conjunto) sobem para a raiz,
 * para nunca sumirem quando o pai foi moderado ou ainda não chegou via gossip.
 */
export function groupRepliesForThread(replies = []) {
  const ids = new Set(replies.map((r) => r.id));
  const byParent = {};
  const tops = [];
  for (const r of replies) {
    const pid = r.parentId || "";
    if (pid && pid !== r.id && ids.has(pid)) {
      (byParent[pid] ||= []).push(r);
    } else {
      tops.push(r);
    }
  }
  return { tops, byParent };
}

/** Achata em ordem de leitura (DFS cronológico). Profundidade visual travada em maxDepth. */
export function flattenReplyThread(replies = [], maxDepth = MAX_THREAD_DEPTH) {
  const { tops, byParent } = groupRepliesForThread(replies);
  const byTs = (a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0);
  const out = [];
  const seen = new Set();
  const stack = [...tops].sort(byTs).reverse().map((reply) => ({ reply, depth: 0 }));
  while (stack.length) {
    const { reply, depth } = stack.pop();
    if (seen.has(reply.id)) continue;
    seen.add(reply.id);
    out.push({ reply, depth: Math.min(depth, maxDepth) });
    const kids = [...(byParent[reply.id] || [])].sort(byTs).reverse();
    for (const child of kids) stack.push({ reply: child, depth: depth + 1 });
  }
  // Ciclos de parentId (dados malformados): sobra vai para a raiz, nunca some.
  for (const r of replies) if (!seen.has(r.id)) out.push({ reply: r, depth: 0 });
  return out;
}
