/**
 * @file Moderador natural no app (PM-83): carregar os vínculos válidos e a tela "Meus vínculos".
 * Atrás da flag de laboratório `vox.lab.moderador`. Lógica pura em `natural-mod.js`.
 */
import * as natural from "../natural-mod.js";
import { VOX_LINK_TYPE } from "../vox-link.js";
import { escapeHtml } from "../render/util.js";

export const NATURAL_MOD_LAB_KEY = "vox.lab.moderador";

export function naturalModLabOn(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(NATURAL_MOD_LAB_KEY) === "1";
  } catch {
    return false;
  }
}

/** Vínculos válidos que este aparelho conhece (forma assinada, as duas assinaturas conferidas). */
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

/** Tela "Meus vínculos": quem pode cuidar dos meus posts e de quem eu cuido. */
export function renderMyLinksHtml(model) {
  const kids = model.godchildren.length
    ? `<p><strong>Você é padrinho de ${model.godchildren.length}:</strong> ${model.godchildren.map(person).join(", ")}.</p>`
    : "";
  const common = model.common.length ? `<p><strong>Vínculos comuns:</strong> ${model.common.map(person).join(", ")}.</p>` : "";
  return `<details class="card natural-mod-links"><summary>🤝 Meus vínculos</summary>
    ${sponsorLine(model)}${kids}${common}
    <p class="hint">Moderador natural é quem conhece você: só age quando chega uma denúncia ou um pedido de mediação sobre alguém do vínculo dele. Vínculos circulam na malha, não no Arweave.</p>
  </details>`;
}

/** No topo da tela Pessoas (só com a flag). */
export async function mountMyLinks(main, deps = null) {
  if (!main || !naturalModLabOn(deps?.storage)) return;
  const me = deps?.me || (await (await import("../local-account.js")).getRouteId());
  const model = natural.myLinksModel(await loadLinks(deps), me);
  main.querySelector(".natural-mod-links")?.remove();
  main.insertAdjacentHTML("afterbegin", renderMyLinksHtml(model));
}
