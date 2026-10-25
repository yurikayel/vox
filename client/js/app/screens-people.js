/** @file People search and connect preview. */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as upload from "../upload.js";
import * as share from "../share.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as inbox from "../inbox.js";
import * as handles from "../handles.js";
import * as localAccount from "../local-account.js";
import * as demoSeed from "../demo-seed.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as listing from "../listing.js";
import * as listingUi from "../listing-ui.js";
import * as i18n from "../i18n-pt-br.js";
import * as gov from "../governance.js";
import * as brcode from "../brcode.js";
import * as hashtags from "../hashtags.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import * as communityMirror from "../community-mirror.js";
import * as stewardWizard from "../steward-wizard.js";
import * as gatewayTelemetry from "../gateway-telemetry.js";
import { attachInlineComposerHandlers } from "../inline-composer.js";
import * as oauthProfile from "../oauth-profile.js";
import * as contacts from "../contacts.js";
import * as peopleIndex from "../people-index.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import * as meshProfile from "../mesh-profile.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser, makeShellProps, attachPostShareHandlers } from "./context.js";

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
