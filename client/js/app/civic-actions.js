/** @file Interações cívicas no feed: posicionamento e enquete assinados (`civic-vote`). */
import * as cacheNode from "../cache-node.js";
import * as localAccount from "../local-account.js";
import * as peers from "../peers.js";
import * as share from "../share.js";
import { classifyCivicPost, isValidCivicChoice } from "../civic-post.js";

/** Votos cívicos guardados neste aparelho (próprios e recebidos por gossip). */
export async function loadCivicVotes() {
  return cacheNode.getLocalPosts({ type: "civic-vote" }).catch(() => []);
}

/**
 * Assina e propaga um voto cívico. O id é determinístico por (post, autor): votar de novo
 * substitui o voto anterior (gossip update com `editedAt`), então vale 1 voto por pessoa.
 */
export async function castCivicVote(post, user, choice) {
  const classification = classifyCivicPost(post);
  if (!classification.isCivic) throw new Error("Este post não cumpre os requisitos cívicos.");
  if (!isValidCivicChoice(classification, choice)) throw new Error("Escolha inválida.");
  const now = Date.now();
  const author = (await localAccount.getRouteId()) || user;
  const signed = await localAccount.signPayload({
    id: `civicvote_${post.id}_${author}`,
    type: "civic-vote",
    postId: post.id,
    communityId: post.communityId || "",
    choice,
    author,
    owner: author,
    ts: now,
    editedAt: now,
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossipUpdate(signed);
  return signed;
}

/**
 * Liga os botões `.civic-choice-btn` dos posts cívicos renderizados.
 * @param {(id: string) => object|undefined} findPost resolve o post pelo id
 * @param {string} user identidade ativa
 * @param {() => void} onVoted re-renderiza o feed
 */
export function attachCivicVoteHandlers(findPost, user, onVoted) {
  document.querySelectorAll(".civic-choice-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!user) {
        share.showToast("Crie sua identidade Vox para participar.", "error");
        return;
      }
      const post = findPost(btn.dataset.postId || "");
      if (!post) return;
      btn.closest(".civic-block")?.querySelectorAll(".civic-choice-btn").forEach((b) => { b.disabled = true; });
      try {
        await castCivicVote(post, user, btn.dataset.choice || "");
        share.showToast("Posicionamento assinado e registrado.");
        onVoted();
      } catch (err) {
        share.showToast(err?.message || "Não foi possível registrar.", "error");
        btn.closest(".civic-block")?.querySelectorAll(".civic-choice-btn").forEach((b) => { b.disabled = false; });
      }
    });
  });
}
