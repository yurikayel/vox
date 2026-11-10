/** @file People search and connect preview. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as contacts from "../contacts.js";
import * as centralMemory from "../central-memory.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { mountInviteCard } from "./vox-link-flow.js";

async function updatePeopleResultsContainer(rawQuery) {
  const container = document.getElementById("people-results-container");
  if (!container) return;
  const q = String(rawQuery || "").trim();
  const sections = q ? null : await peopleIndex.buildPeopleSections();
  const results = q ? await peopleIndex.searchPeople(q) : [];
  container.innerHTML = render.resolvePeopleSearchBody(sections, results, q);
}

export async function showPeople(initialQuery = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "people", "Pessoas"));
  const q = initialQuery || "";
  const hasQ = Boolean(q.trim());
  const sections = hasQ ? null : await peopleIndex.buildPeopleSections();
  const results = hasQ ? await peopleIndex.searchPeople(q) : [];
  render.renderPeopleSearch(main, { sections, results, query: q });

  const searchInput = document.getElementById("people-search-input");
  searchInput?.addEventListener("input", () => {
    void updatePeopleResultsContainer(searchInput.value);
  });

  document.getElementById("form-people-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = searchInput?.value.trim() || "";
    const target = peopleIndex.parseConnectTarget(next);
    if (target) {
      location.hash = `#/connect/${encodeURIComponent(target)}`;
      return;
    }
    location.hash = next ? `#/people?q=${encodeURIComponent(next)}` : "#/people";
  });

  void centralMemory.syncWithCentralMemory({
    onHydrated: () => {
      void updatePeopleResultsContainer(searchInput?.value || q);
    },
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
    contacts.addContact(id, profile.name || "");
    share.showToast("Contato adicionado.");
    showConnect(id, invite);
  });

  document.getElementById("btn-connect-share")?.addEventListener("click", () => {
    void share.shareConnect({ routeId, displayName: profile.name });
  });
}
