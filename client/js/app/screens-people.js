/** @file People search and connect preview. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import { getActiveUser, makeShellProps } from "./context.js";

export async function showPeople(initialQuery = "") {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "people", "Pessoas"));
  const q = initialQuery || "";
  const hasQ = Boolean(q.trim());
  const sections = hasQ ? null : await peopleIndex.buildPeopleSections();
  const results = hasQ ? await peopleIndex.searchPeople(q) : [];
  render.renderPeopleSearch(main, { sections, results, query: q });

  document.getElementById("form-people-search")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = document.getElementById("people-search-input")?.value.trim() || "";
    location.hash = next ? `#/people?q=${encodeURIComponent(next)}` : "#/people";
  });

  document.getElementById("form-people-paste-link")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = document.getElementById("people-paste-input")?.value.trim() || "";
    const target = peopleIndex.parseConnectTarget(raw);
    if (target) location.hash = `#/connect/${encodeURIComponent(target)}`;
    else share.showToast("Cole um link #/connect ou vx_…", "error");
  });
}

export async function showConnect(routeId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "people", "Conectar"));
  const profile = await profileDirectory.resolveProfile(routeId);
  render.renderConnectPreview(main, profile, routeId, { isContact: contacts.hasContact(routeId) });

  document.getElementById("btn-connect-add")?.addEventListener("click", (e) => {
    const id = e.currentTarget.dataset.route || routeId;
    contacts.addContact(id, profile.name || "");
    share.showToast("Contato adicionado.");
    showConnect(id);
  });

  document.getElementById("btn-connect-share")?.addEventListener("click", () => {
    void share.shareConnect({ routeId, displayName: profile.name });
  });
}
