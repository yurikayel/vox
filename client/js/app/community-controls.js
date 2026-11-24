/**
 * @file Controles de cabeçalho e lista da tela da comunidade (foto, exportação, seed, moderação, busca/ordenação).
 * @module app/community-controls
 */
import { escapeHtml } from "../shared/html.js";
import { compressCommunityAvatarFile, validateCommunityAvatarFile, acceptCommunityAvatarDataUrl } from "../shared/community-avatar-image.js";
import { addContactAndNotify } from "./contact-notify-flow.js";
import * as render from "../render.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../identity/index.js";
import * as communityUpdates from "../community-updates.js";
import * as communitySeed from "../community-seed-checklist.js";
import { TOPICS_PAGE_SIZE } from "../render/community.js";
import { orderCommunityTopics } from "../community-topic-order.js";
import { parseRoute } from "./route-parse.js";
import { route } from "./navigation.js";
import { dispatchCommunityModAction } from "./community-metadata.js";

/**
 * Monta o arquivo de gênesis da comunidade exportado pela moderação.
 *
 * @param {string} communityId Comunidade.
 * @param {object} meta Metadados.
 * @param {object[]} topics Tópicos visíveis.
 * @returns {object}
 */
function buildCommunityGenesisPayload(communityId, meta, topics) {
  return {
    type: "vox-community-genesis",
    version: 1,
    communityId,
    meta,
    exportedAt: Date.now(),
    topicsCount: topics.length,
    topics: topics.map((t) => ({
      id: t.id, title: t.title, body: t.body, author: t.author || t.owner, ts: t.ts, image: t.image, audio: t.audio, video: t.video,
    })),
  };
}

/**
 * Liga o botão que exporta o gênesis da comunidade.
 *
 * @param {string} communityId
 * @param {object} meta
 * @param {object[]} filteredTopics Tópicos incluídos no arquivo.
 */
function bindGenesisExport(communityId, meta, filteredTopics) {
  const btn = document.getElementById("btn-export-comm-genesis");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const data = buildCommunityGenesisPayload(communityId, meta, filteredTopics);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    share.downloadBlob(blob, `comunidade-${communityId}-genesis.json`);
    share.showToast("Gênesis da comunidade exportado com sucesso!");
  });
}

/**
 * Liga os botões de semente e de modo apoiador da vizinhança.
 *
 * @param {string} communityId
 * @param {object} meta Metadados.
 * @param {object} peerSettings Ajustes atuais de vizinhos.
 */
function bindSeedAndNeighborControls(communityId, meta, peerSettings) {
  document.getElementById("btn-neighbor-comm-only")?.addEventListener("click", () => {
    peers.savePeerSettings({ ...peerSettings, commOnly: true, enabled: true });
    communitySeed.saveSeedState(communityId, { commOnlyNudgeSeen: true });
    share.showToast("Modo Apoiador: cache focado nas suas comunidades.");
    location.hash = "#/settings/network#net-comm-only-wrap";
  });
  document.getElementById("btn-seed-invite")?.addEventListener("click", () => {
    communitySeed.recordSeedInvite(communityId);
    share.shareCommunity({ title: meta.title || communityId, communityId });
    share.showToast(`Convite ${communitySeed.loadSeedState(communityId).invitesSent}/2 registrado.`);
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  });
  document.getElementById("btn-seed-dismiss")?.addEventListener("click", () => {
    communitySeed.dismissSeedRitual(communityId);
    share.showToast("Checklist dispensado — você pode reabrir em Configurações → Rede.");
    route(parseRoute(location.hash.slice(1) || `/c/${communityId}`));
  });
}

/**
 * Mostra a nova foto da comunidade na tela sem recarregar.
 *
 * @param {string} safeSrc URL já validada da imagem.
 * @param {object} meta Metadados.
 * @param {string} communityId
 */
function paintCommunityPhotoOnDom(safeSrc, meta, communityId) {
  const img = document.querySelector(".community-avatar-img");
  if (img) {
    img.src = safeSrc;
    img.style.display = "block";
  } else {
    const box = document.querySelector(".community-avatar-box");
    if (box) {
      box.innerHTML = `<img class="community-avatar-img" src="${escapeHtml(safeSrc)}" alt="${escapeHtml(meta.title || communityId)}" />`;
    }
  }
  const fb = document.querySelector(".community-avatar-fallback");
  if (fb) fb.style.display = "none";
}

/**
 * Valida e publica a foto da comunidade; só dono ou moderador pode trocar.
 *
 * @param {File} file Imagem escolhida.
 * @param {string} communityId
 * @param {object} meta Metadados.
 */
async function uploadCommunityPhoto(file, communityId, meta) {
  if (!communityUpdates.canUpdateCommunity(meta, await localAccount.getRouteId())) {
    share.showToast("Só o dono ou um moderador desta comunidade pode trocar a foto.", "error");
    return;
  }
  const check = validateCommunityAvatarFile(file);
  if (!check.ok) {
    share.showToast(check.message, "error");
    return;
  }
  const dataUrl = await compressCommunityAvatarFile(file);
  const signed = await localAccount.signPayload({
    id: `comm_update_${communityId}_${Date.now()}`,
    type: communityUpdates.COMMUNITY_UPDATE_TYPE,
    communityId,
    image: dataUrl,
    avatar: dataUrl,
    updatedAt: Date.now(),
  });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  paintCommunityPhotoOnDom(acceptCommunityAvatarDataUrl(dataUrl), meta, communityId);
  share.showToast("Foto da comunidade atualizada!");
}

/**
 * Liga o campo de arquivo da foto da comunidade.
 *
 * @param {string} communityId
 * @param {object} meta Metadados.
 */
function bindCommunityPhotoInput(communityId, meta) {
  const input = document.getElementById("input-comm-photo-file");
  if (!input) return;
  input.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadCommunityPhoto(file, communityId, meta);
    } catch (err) {
      share.showToast(`Erro ao atualizar foto: ${err.message}`, "error");
    }
  });
}

/**
 * Reflete na tela o estado da quarentena da comunidade.
 *
 * @param {boolean} nextState Quarentena ligada.
 */
function paintCommunityQuarantineOnDom(nextState) {
  if (typeof document === "undefined") return;
  const on = Boolean(nextState);
  const stateEl = document.querySelector(".community-quarantine-state");
  if (stateEl) stateEl.textContent = on ? "Ligada" : "Desligada";
  const btn = document.getElementById("btn-toggle-comm-quarantine");
  if (btn) {
    btn.dataset.next = on ? "false" : "true";
    btn.textContent = on ? "Desligar" : "Ligar";
    btn.title = on ? "Desligar quarentena de chaves novas" : "Ligar quarentena de chaves novas";
  }
}

/**
 * Alterna e propaga a configuração de quarentena de chave nova de uma comunidade.
 * @param {string} communityId Id da comunidade.
 * @param {object} meta Metadados da comunidade.
 * @param {boolean} [explicitNext] Estado desejado (opcional; se omitido, inverte o atual).
 * @returns {Promise<object|null>} Post de atualização assinado ou null se recusado.
 */
export async function toggleCommunityQuarantine(communityId, meta, explicitNext) {
  const routeId = await localAccount.getRouteId();
  if (!communityUpdates.canUpdateCommunity(meta, routeId)) {
    share.showToast("Só o dono ou um moderador desta comunidade pode alterar a quarentena.", "error");
    return null;
  }
  const nextState = typeof explicitNext === "boolean" ? explicitNext : !meta?.newKeyQuarantine;
  const now = Date.now();
  const payload = {
    id: `comm_update_${communityId}_${now}`,
    type: communityUpdates.COMMUNITY_UPDATE_TYPE,
    communityId,
    newKeyQuarantine: nextState,
    newKeyQuarantineSince: String(now),
    updatedAt: now,
  };
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  if (meta) {
    meta.newKeyQuarantine = nextState;
    meta.newKeyQuarantineSince = String(now);
  }
  paintCommunityQuarantineOnDom(nextState);
  share.showToast(nextState ? "Quarentena de chave nova ativada!" : "Quarentena de chave nova desativada!");
  return signed;
}

/**
 * Liga o botão que liga e desliga a quarentena da comunidade.
 *
 * @param {string} communityId
 * @param {object} meta Metadados.
 */
function bindCommunityQuarantineToggle(communityId, meta) {
  const btn = document.getElementById("btn-toggle-comm-quarantine");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      const next = btn.dataset.next === "true";
      await toggleCommunityQuarantine(communityId, meta, next);
    } catch (err) {
      share.showToast(`Erro ao alterar quarentena: ${err.message}`, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * Liga os botões de ocultar item da moderação.
 *
 * @param {string} communityId
 */
function bindCommunityModHideButtons(communityId) {
  document.querySelectorAll(".btn-mod-hide").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const targetId = e.target.dataset.id;
      if (!confirm(`Ocultar o item ${targetId}?`)) return;
      e.target.disabled = true;
      try {
        await dispatchCommunityModAction(communityId, "hide", targetId);
        share.showToast("Ação de moderação enviada.");
        e.target.closest(".card")?.remove();
      } catch (err) {
        share.showToast(`Erro na moderação: ${err.message}`, "error");
        e.target.disabled = false;
      }
    });
  });
}

/**
 * Normaliza texto para busca: sem acento, minúsculo e sem espaços nas pontas.
 *
 * @param {string} str Texto de entrada.
 * @returns {string}
 */
function normalizeSearchText(str) {
  return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Mostra só as linhas de tópico que casam com a busca e o aviso de lista vazia.
 *
 * @param {NodeList|HTMLElement[]} rows Linhas de tópico.
 * @param {string} q Termo digitado.
 * @param {HTMLElement} main Raiz da tela.
 */
function filterTopicRows(rows, q, main) {
  let visibleCount = 0;
  const normQ = normalizeSearchText(q);
  rows.forEach((row) => {
    const matches = !normQ || normalizeSearchText(row.textContent).includes(normQ);
    row.style.display = matches ? "" : "none";
    if (matches) visibleCount++;
  });
  const listEl = main.querySelector(".community-vox-topic-list");
  let emptySearchEl = main.querySelector(".community-topic-search-empty");
  if (visibleCount === 0 && q) {
    if (!emptySearchEl && listEl) {
      emptySearchEl = document.createElement("div");
      emptySearchEl.className = "empty community-topic-search-empty";
      emptySearchEl.innerHTML = `<p>Nenhum tópico encontrado para "${escapeHtml(q)}".</p>`;
      listEl.appendChild(emptySearchEl);
    }
  } else if (emptySearchEl) {
    emptySearchEl.remove();
  }
}

/**
 * Liga o campo de busca de tópicos.
 *
 * @param {HTMLElement} main
 * @returns {HTMLInputElement|null}
 */
function bindCommunityTopicSearch(main) {
  const searchInput = main.querySelector("#input-comm-topic-search");
  if (!searchInput) return null;
  searchInput.addEventListener("input", (e) => {
    filterTopicRows(main.querySelectorAll(".community-topic-row"), e.target.value, main);
  });
  return searchInput;
}

/**
 * Mostra, atualiza ou remove o botão de carregar tópicos anteriores.
 *
 * @param {HTMLElement} main
 * @param {number} totalCount Total de tópicos.
 * @param {number} currentLimit Quantidade exibida.
 * @param {Function|null} onMore Chamado ao pedir mais.
 */
function updatePaginationControl(main, totalCount, currentLimit, onMore) {
  let paginationEl = main.querySelector(".community-topic-pagination");
  if (totalCount <= currentLimit) {
    if (paginationEl) paginationEl.remove();
    return;
  }
  const remaining = totalCount - currentLimit;
  const label = `Carregar tópicos anteriores (${remaining} ${remaining === 1 ? "restante" : "restantes"})`;
  if (!paginationEl) {
    paginationEl = document.createElement("div");
    paginationEl.className = "community-topic-pagination";
    paginationEl.style.cssText = "text-align:center; padding:12px 0 6px;";
    main.querySelector(".community-vox-feed")?.appendChild(paginationEl);
  }
  paginationEl.innerHTML = `<button type="button" class="btn btn-outline btn-sm btn-load-more-topics">${label}</button>`;
  paginationEl.querySelector(".btn-load-more-topics")?.addEventListener("click", onMore);
}

/**
 * Redesenha a lista de tópicos conforme ordem, limite e busca.
 *
 * @param {HTMLElement} main
 * @param {string} communityId
 * @param {object[]} filteredTopics Tópicos da comunidade.
 * @param {{sort: string, limit: number}} state Ordem e limite atuais.
 * @param {HTMLInputElement|null} searchInput Campo de busca.
 */
function refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput) {
  const listEl = main.querySelector(".community-vox-topic-list");
  if (!listEl) return;
  const ordered = orderCommunityTopics(filteredTopics, state.sort);
  if (state.sort === "pinned" && ordered.length === 0) {
    listEl.innerHTML = `<div class="empty community-vox-empty"><p>Nenhuma pauta ou tópico fixado no momento.</p></div>`;
    updatePaginationControl(main, 0, state.limit, null);
    return;
  }
  listEl.innerHTML = ordered.slice(0, state.limit).map((t) => render.renderCommunityTopicRow({ ...t, communityId })).join("");
  updatePaginationControl(main, ordered.length, state.limit, () => {
    state.limit += TOPICS_PAGE_SIZE;
    refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
  });
  if (searchInput?.value.trim()) filterTopicRows(main.querySelectorAll(".community-topic-row"), searchInput.value, main);
}

/**
 * Liga os botões de ordenar tópicos.
 *
 * @param {HTMLElement} main
 * @param {Function} onSortChange Chamado com o novo modo.
 */
function bindCommunityTopicSort(main, onSortChange) {
  main.querySelectorAll(".btn-sort-topic").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.sort;
      if (!mode) return;
      main.querySelectorAll(".btn-sort-topic").forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
      onSortChange(mode);
    });
  });
}

/**
 * Liga busca, ordem e paginação da lista de tópicos.
 *
 * @param {HTMLElement} main
 * @param {string} communityId
 * @param {object[]} filteredTopics Tópicos da comunidade.
 */
function bindCommunityTopicControls(main, communityId, filteredTopics) {
  const state = { sort: "active", limit: TOPICS_PAGE_SIZE };
  const searchInput = bindCommunityTopicSearch(main);
  bindCommunityTopicSort(main, (newSort) => {
    state.sort = newSort;
    state.limit = TOPICS_PAGE_SIZE;
    refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
  });
  main.querySelector(".btn-load-more-topics")?.addEventListener("click", () => {
    state.limit += TOPICS_PAGE_SIZE;
    refreshCommunityTopicList(main, communityId, filteredTopics, state, searchInput);
  });
}

/**
 * Liga botões de cabeçalho, compartilhamento, foto, moderação, busca e paginação da comunidade.
 *
 * @param {{ main: HTMLElement, communityId: string, meta: object, user: string, peerSettings: object, filteredTopics: object[] }} ctx Contexto da comunidade montada.
 * @returns {void}
 */
export function bindCommunityHeaderEvents({ main, communityId, meta, user, peerSettings, filteredTopics }) {
  document.querySelectorAll(".btn-community-add-contact").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.route;
      if (!id) return;
      addContactAndNotify(id, btn.dataset.label || "");
      share.showToast("Contato adicionado.");
      btn.disabled = true;
      btn.textContent = "✓";
    });
  });
  document.getElementById("btn-share-comm")?.addEventListener("click", () => {
    share.shareCommunity({ title: meta.title || communityId, communityId });
    if (user && communitySeed.shouldOfferSeedRitual(communityId, user, meta)) communitySeed.recordSeedInvite(communityId);
  });
  bindGenesisExport(communityId, meta, filteredTopics);
  bindSeedAndNeighborControls(communityId, meta, peerSettings);
  bindCommunityPhotoInput(communityId, meta);
  bindCommunityQuarantineToggle(communityId, meta);
  bindCommunityModHideButtons(communityId);
  bindCommunityTopicControls(main, communityId, filteredTopics);
  void import("./assembly-ui.js").then((m) => m.bindAssemblyPanelHost(main, { communityId, meta })).catch(() => {});
}
