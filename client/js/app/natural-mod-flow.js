/**
 * @file Moderador natural no app (PM-83): carregar os vínculos válidos e a tela "Meus vínculos".
 * Atrás da flag de laboratório `vox.lab.moderador`. Lógica pura em `natural-mod.js`.
 */
import * as natural from "../natural-mod.js";
import { VOX_LINK_TYPE } from "../vox-link.js";
import { escapeHtml } from "../shared/html.js";
import { isModerator } from "../moderation.js";

/** @type {string} Flag de laboratório do moderador natural. */
export const NATURAL_MOD_LAB_KEY = "vox.lab.moderador";

/**
 * Indica se o experimento de moderador natural está ativo neste aparelho.
 * @param {Storage} [storage] Armazenamento local a consultar.
 * @returns {boolean} Verdadeiro se a flag estiver ligada.
 */
export function naturalModLabOn(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(NATURAL_MOD_LAB_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Vínculos válidos que este aparelho conhece (forma assinada, as duas assinaturas conferidas).
 * @param {object|null} [deps=null] Dependências opcionais (`getRecords`, `verify`).
 * @returns {Promise<object[]>} Vínculos válidos deduplicados.
 */
export async function loadLinks(deps = null) {
  const [cacheNode, localAccount] = deps ? [null, null] : await Promise.all([import("../cache-node.js"), import("../local-account.js")]);
  const getRecords = deps?.getRecords || (async () => (await cacheNode.getWirePosts()).filter((p) => p.type === VOX_LINK_TYPE));
  const verify = deps?.verify || ((signed) => localAccount.verifyPayload(signed));
  return natural.collectLinks(await getRecords(), verify);
}

const person = (route) => `<a href="#/connect/${encodeURIComponent(route)}"><code>${escapeHtml(String(route).slice(0, 14))}…</code></a>`;

function sponsorLine({ sponsor, closest }) {
  if (sponsor) {
    return `<p><strong>Seu padrinho:</strong> ${person(sponsor)}. Se alguém denunciar um post seu, ele vê o post e o motivo (não quem denunciou) e pode arquivar.</p>`;
  }
  if (closest) {
    return `<p><strong>Sem padrinho.</strong> Quem cuida de denúncias sobre você é a pessoa mais próxima: ${person(closest)} (o vínculo mais antigo).</p>`;
  }
  return `<p><strong>Sem vínculos.</strong> Denúncias sobre você vão direto para a moderação da comunidade.</p>`;
}

/**
 * Tela "Meus vínculos": quem pode cuidar dos meus posts e de quem eu cuido.
 * @param {object} model Modelo retornado por `myLinksModel`.
 * @returns {string} HTML do bloco de vínculos.
 */
export function renderMyLinksHtml(model) {
  const kids = model.godchildren.length
    ? `<p><strong>Você é padrinho de ${model.godchildren.length}:</strong> ${model.godchildren.map(person).join(", ")}.</p>`
    : "";
  const common = model.common.length ? `<p><strong>Vínculos comuns:</strong> ${model.common.map(person).join(", ")}.</p>` : "";
  const onlyMediation = model.mediationOnly?.length
    ? `<p><strong>Só para mediação:</strong> ${model.mediationOnly.map(person).join(", ")} (sem poder de arquivar).</p>` : "";
  const when = model.switching ? new Date(model.switching.at).toLocaleDateString("pt-BR") : "";
  const switching = model.switching ? `<p><strong>Troca de padrinho em andamento:</strong> ${person(model.switching.to)} passa a ser seu padrinho em ${when}.</p>` : "";
  return `<details class="card natural-mod-links"><summary>🤝 Meus vínculos</summary>
    ${sponsorLine(model)}${switching}${kids}${common}${onlyMediation}
    <p class="hint">Moderador natural é quem conhece você: só age quando chega uma denúncia ou um pedido de mediação sobre alguém do vínculo dele. Vínculos circulam na malha, não no Arweave.</p>
  </details>`;
}

async function casesHtml(links, me, deps) {
  if (deps?.skipCases) return "";
  const cases = await import("./natural-case-flow.js");
  return cases.renderCasesHtml(cases.listCases(), (target) => natural.hasFirmPower(links, me, target));
}

function bindCases(main, me, rerender) {
  main.querySelector(".natural-mod-links")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-case-action]");
    if (!btn) return;
    btn.disabled = true;
    const [cases, share] = await Promise.all([import("./natural-case-flow.js"), import("../share.js")]);
    const c = cases.listCases().find((x) => x.caseId === btn.dataset.caseId && x.side === btn.dataset.caseSide);
    cases.decideCase(me, c, btn.dataset.caseAction)
      .then((msg) => { share.showToast(msg); rerender(); })
      .catch((err) => { share.showToast(`Erro: ${err.message}`, "error"); btn.disabled = false; });
  });
}

/**
 * No topo da tela Pessoas (só com a flag): meus vínculos e os casos para eu decidir.
 * @param {HTMLElement} main Contêiner principal da tela.
 * @param {object|null} [deps=null] Dependências opcionais para testes.
 * @returns {Promise<void>} Conclusão da montagem no DOM.
 */
export async function mountMyLinks(main, deps = null) {
  if (!main || !naturalModLabOn(deps?.storage)) return;
  const me = deps?.me || (await (await import("../local-account.js")).getRouteId());
  const links = await loadLinks(deps);
  const html = renderMyLinksHtml(natural.myLinksModel(links, me)).replace("</details>", `${await casesHtml(links, me, deps)}</details>`);
  main.querySelector(".natural-mod-links")?.remove();
  main.insertAdjacentHTML("afterbegin", html);
  if (!deps?.skipCases) bindCases(main, me, () => mountMyLinks(main, deps));
}

/**
 * Arquivamentos firmes conferidos desta comunidade, como ações que só este aparelho constrói (`naturalVerified`).
 * Vale se: assinatura e prova de padrinho batem, o afilhado está entre os 30 primeiros e quem arquivou tinha
 * menos de 3 reversões da moderação em 90 dias, contadas até aquele arquivamento.
 * @param {string} communityId Identificador da comunidade.
 * @param {object[]} [modActions=[]] Ações de moderação já resolvidas na comunidade.
 * @param {object|null} [deps=null] Dependências opcionais para carregar vínculos.
 * @returns {Promise<object[]>} Ações `natural-hide` validadas.
 */
export async function loadNaturalHideActions(communityId, modActions = [], deps = null) {
  const [cacheNode, localAccount, community] = await Promise.all([
    import("../cache-node.js"), import("../local-account.js"), import("./screens-community.js"),
  ]);
  const raw = (await cacheNode.getWirePosts()).filter((p) => p.type === natural.NATURAL_HIDE_TYPE && p.communityId === communityId);
  if (!raw.length) return [];
  const verify = (signed) => localAccount.verifyPayload(signed);
  const hides = (await Promise.all(raw.map((h) => natural.verifyNaturalHide(h, verify)))).filter(Boolean);
  const meta = await community.resolveCommunityMetadata(communityId).catch(() => ({}));
  const unhides = modActions.filter((a) => a.action === "unhide" && isModerator(String(a.owner || a.author || ""), meta.owner, meta.moderators));
  const links = await loadLinks(deps);
  return hides
    .filter((h) => natural.hasFirmPower(links, h.hider, h.target, {
      reversals: natural.reversalsAgainst(h.hider, { hides, unhides: unhides.filter((u) => Number(u.ts) < h.ts), now: h.ts }),
    }))
    .map((h) => ({ id: `nat_${h.postId}_${h.hider}`, action: "natural-hide", target: h.postId, targetAuthor: h.target, ts: h.ts, owner: "", naturalVerified: true }));
}
