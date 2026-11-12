/** @file People search and connect preview. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as contacts from "../contacts.js";
import * as contactNotify from "../contact-notify.js";
import * as centralMemory from "../central-memory.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { addContactAndNotify, listPendingAddedYouNotices } from "./contact-notify-flow.js";
import { pollInboxMessages } from "./screens-dm.js";
import { mountInviteCard } from "./vox-link-flow.js";

function refreshAddedYouSection(rawQuery = "") {
  const box = document.getElementById("people-added-you-container");
  if (!box) return;
  const q = String(rawQuery || "").trim();
  box.innerHTML = q ? "" : render.renderAddedYouSection(listPendingAddedYouNotices());
}

async function updatePeopleResultsContainer(rawQuery) {
  const container = document.getElementById("people-results-container");
  if (!container) return;
  const q = String(rawQuery || "").trim();
  refreshAddedYouSection(q);
  const sections = q ? null : await peopleIndex.buildPeopleSections();
  const results = q ? await peopleIndex.searchPeople(q) : [];
  container.innerHTML = render.resolvePeopleSearchBody(sections, results, q);
}

let watchingContactAdded = false;
function ensureContactAddedLiveListener() {
  if (watchingContactAdded || typeof document === "undefined") return;
  watchingContactAdded = true;
  document.addEventListener("vox:contact-added-received", () => {
    const q = document.getElementById("people-search-input")?.value || "";
    refreshAddedYouSection(q);
  });
}

function bindPeopleAddedYouActions() {
  const box = document.getElementById("people-added-you-container");
  box?.addEventListener("click", (e) => {
    const back = e.target.closest(".btn-added-you-back");
    const dismiss = e.target.closest(".btn-added-you-dismiss");
    const id = (back || dismiss)?.dataset.route;
    if (!id) return;
    if (back) {
      addContactAndNotify(id, back.dataset.label || "");
      share.showToast("Contato adicionado.");
    }
    contactNotify.dismissIncomingContactNotice(id);
    void updatePeopleResultsContainer(document.getElementById("people-search-input")?.value || "");
  });
}

export async function showPeople(initialQuery = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "people", "Pessoas"));
  const q = initialQuery || "";
  const hasQ = Boolean(q.trim());
  const sections = hasQ ? null : await peopleIndex.buildPeopleSections();
  const results = hasQ ? await peopleIndex.searchPeople(q) : [];
  const addedBy = hasQ ? [] : listPendingAddedYouNotices();
  render.renderPeopleSearch(main, { sections, results, query: q, addedBy });

  bindPeopleAddedYouActions();
  ensureContactAddedLiveListener();
  const searchInput = document.getElementById("people-search-input");
  searchInput?.addEventListener("input", () => void updatePeopleResultsContainer(searchInput.value));

  document.getElementById("form-people-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = searchInput?.value.trim() || "";
    const target = peopleIndex.parseConnectTarget(next);
    location.hash = target ? `#/connect/${encodeURIComponent(target)}` : (next ? `#/people?q=${encodeURIComponent(next)}` : "#/people");
  });

  void pollInboxMessages(user).then((n) => n > 0 && refreshAddedYouSection(searchInput?.value || q));
  void centralMemory.syncWithCentralMemory({
    onHydrated: () => void updatePeopleResultsContainer(searchInput?.value || q),
  });
}

export async function showConnect(routeId, invite = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "people", "Conectar"));
  const profile = await profileDirectory.resolveProfile(routeId);
  render.renderConnectPreview(main, profile, routeId, { isContact: contacts.hasContact(routeId) });
  if (invite) await mountInviteCard(main, { inviter: routeId, token: invite, name: profile.name });

  document.getElementById("btn-connect-add")?.addEventListener("click", (e) => {
    const id = e.currentTarget.dataset.route || routeId;
    addContactAndNotify(id, profile.name || "");
    share.showToast("Contato adicionado.");
    showConnect(id, invite);
  });

  document.getElementById("btn-connect-share")?.addEventListener("click", () => {
    void share.shareConnect({ routeId, displayName: profile.name });
  });
}
