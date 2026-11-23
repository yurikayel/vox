/**
 * @file Lista de conversas de DM: busca, fixados, nova conversa, copiar o próprio link e puxar a caixa.
 *
 * @module app/screens-dm-list
 */
import * as render from "../render.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as dmMsg from "../dm-messenger.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { ensureOnboardingSideEffects } from "./onboarding-side-effects.js";
import { pollInboxMessages } from "./screens-dm-inbox.js";

/**
 * Desenha a lista de conversas e liga os controles.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {object[]} convs Conversas.
 * @param {string} user Rota de quem vê.
 * @param {string} [searchQuery=""] Busca atual.
 */
function renderAndBindDmList(main, convs, user, searchQuery = "") {
  render.renderDmList(main, convs, user, {
    contactList: contacts.listContacts(),
    searchQuery,
  });
  bindDmListControls(main, convs, user);
}

/**
 * Liga os controles da lista de conversas.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {object[]} convs Conversas.
 * @param {string} user Rota de quem vê.
 */
function bindDmListControls(main, convs, user) {
  document.getElementById("btn-copy-my-dm-link")?.addEventListener("click", () => {
    const link = `${window.location.origin}${window.location.pathname}#/dm/${encodeURIComponent(user)}`;
    navigator.clipboard.writeText(link);
    share.showToast("Link copiado! Manda para quem quiser te escrever.");
  });

  document.getElementById("form-new-dm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = document.getElementById("dm-peer-input")?.value.trim();
    const peer = peopleIndex.parseConnectTarget(raw) || raw;
    if (peer) location.hash = `#/dm/${encodeURIComponent(peer)}`;
  });

  document.getElementById("btn-pull-inbox")?.addEventListener("click", async () => {
    const pulled = await pollInboxMessages(user);
    share.showToast(pulled > 0 ? `${pulled} nova(s) mensagem(ns)!` : "Inbox verificado: sem novas mensagens.");
    showDmList();
  });

  bindDmListSearchAndPins(main, convs, user);
}

/**
 * Liga a busca e os fixados da lista de conversas.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {object[]} convs Conversas.
 * @param {string} user Rota de quem vê.
 */
function bindDmListSearchAndPins(main, convs, user) {
  const searchInput = document.getElementById("dm-search-input");
  searchInput?.addEventListener("input", () => {
    const val = searchInput.value;
    const pos = searchInput.selectionStart ?? val.length;
    renderAndBindDmList(main, convs, user, val);
    const nextInput = document.getElementById("dm-search-input");
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(pos, pos);
    }
  });

  main.querySelectorAll(".btn-dm-pin").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const res = dmMsg.togglePinPeer(btn.dataset.peer);
      if (res.reason === "limit" || res.limitReached) {
        share.showToast("Limite de 3 conversas fixadas atingido.", "error");
        return;
      }
      renderAndBindDmList(main, convs, user, searchInput?.value || "");
    });
  });
}

/**
 * Monta lista de conversas DM.
 *
 * @returns {void}
 */
export async function showDmList() {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "dm", "Mensagens"));
  if (!user) {
    main.innerHTML = `<div class="card"><h2>Mensagens Diretas</h2><div class="error">Não foi possível carregar sua conta local.</div></div>`;
    return;
  }
  await ensureOnboardingSideEffects(user);
  await pollInboxMessages(user);
  const convs = await cacheNode.getDmConversations();
  renderAndBindDmList(main, convs, user, "");
}
