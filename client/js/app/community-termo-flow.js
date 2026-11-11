/**
 * @file Termo de convivência na tela da comunidade (lote 3): mostrar o termo, assinar na entrada,
 * reassinar quando muda e, para a moderação, publicar o texto. Atrás da flag `vox.lab.aviso`.
 * Lógica pura em `community-termo.js`.
 */
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";
import * as termo from "../community-termo.js";
import { escapeHtml } from "../render/util.js";

const localOf = (type, communityId) => cacheNode.getLocalPosts({ type, communityId }).catch(() => []);

async function loadTermo(communityId, meta) {
  return termo.latestTermo(await localOf(termo.TERMO_TYPE, communityId), communityId, meta);
}

/** Campos do termo para a entrada na comunidade (vazio se não houver termo). */
export async function joinTermoFields(communityId) {
  const { resolveCommunityMetadata } = await import("./screens-community.js");
  const meta = await resolveCommunityMetadata(communityId).catch(() => null);
  return termo.membershipTermoFields(meta ? await loadTermo(communityId, meta) : null);
}

async function myMembership(communityId, routeId) {
  const mine = (await localOf("membership", communityId)).filter((m) => (m.author || m.owner) === routeId);
  return mine.sort((a, b) => Number(b.joinedAt || 0) - Number(a.joinedAt || 0))[0] || null;
}

const STATUS_NOTE = {
  "nao-assinou": "Ao participar, você assina este termo.",
  assinou: "Você assinou este termo ao entrar.",
  mudou: "O termo mudou desde que você entrou.",
};

/** Cartão do termo: texto, situação de quem vê e, para a moderação, o editor. */
export function renderTermoHtml(current, status, { isMember = false, isMod = false } = {}) {
  const resign = isMember && status === "mudou"
    ? `<button type="button" class="btn btn-primary btn-sm" id="btn-termo-assinar">Assinar o termo atual</button>` : "";
  const body = current
    ? `<p class="termo-text">${escapeHtml(current.termoText).replace(/\n/g, "<br>")}</p><p class="hint">${STATUS_NOTE[status] || ""}</p>${resign}`
    : "";
  const editor = isMod ? `<form id="form-termo">
      <label for="termo-text">${current ? "Atualizar o termo" : "Escrever o termo"} (de ${termo.TERMO_MIN} a ${termo.TERMO_MAX} caracteres)</label>
      <textarea id="termo-text" class="form-control" name="termo" rows="5" maxlength="${termo.TERMO_MAX}">${escapeHtml(current?.termoText || "")}</textarea>
      <p class="hint">Quem já entrou vê que o termo mudou e pode assinar de novo.</p>
      <button type="submit" class="btn btn-outline btn-sm">Assinar e publicar o termo</button>
    </form>` : "";
  if (!body && !editor) return "";
  return `<details class="card community-termo"${status === "mudou" ? " open" : ""}><summary>📜 Termo de convivência</summary>${body}${editor}</details>`;
}

async function publish(payload) {
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  return signed;
}

async function resign(communityId, routeId, current) {
  const fields = await termo.membershipTermoFields(current);
  await publish({ id: `mem_${communityId}_${routeId}`, type: "membership", communityId, joinedAt: Date.now(), ...fields });
  share.showToast("Termo assinado.");
}

function bindTermo(main, ctx, rerender) {
  main.querySelector("#btn-termo-assinar")?.addEventListener("click", () =>
    resign(ctx.communityId, ctx.routeId, ctx.current).then(rerender).catch((err) => share.showToast(`Erro: ${err.message}`, "error")));
  main.querySelector("#form-termo")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get("termo");
    Promise.resolve()
      .then(() => publish(termo.buildTermo(ctx.communityId, text)))
      .then(() => { share.showToast("Termo publicado."); rerender(); })
      .catch((err) => share.showToast(err.message, "error"));
  });
}

/** No topo da comunidade (só com a flag): o termo e as ações de quem vê. */
export async function mountCommunityTermo(main, { communityId, meta, isMember, isMod }) {
  const { avisoLabOn } = await import("./aviso-flow.js");
  if (!main || !avisoLabOn()) return;
  const routeId = await localAccount.getRouteId();
  const current = await loadTermo(communityId, meta);
  const status = await termo.termoStatus(current, isMember ? await myMembership(communityId, routeId) : null);
  const html = renderTermoHtml(current, status, { isMember, isMod });
  if (!html) return;
  main.querySelector(".community-termo")?.remove();
  main.insertAdjacentHTML("afterbegin", html);
  bindTermo(main, { communityId, routeId, current }, () => mountCommunityTermo(main, { communityId, meta, isMember, isMod }));
}
