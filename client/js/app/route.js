/** @file Hash router — dispatches to screen modules. */
import { parseRoute } from "./route-parse.js";
import { setRoute } from "./navigation.js";
import { checkCantinaGate } from "./onboarding.js";
import { showHome, showCommunities, showTagFeed } from "./screens-home.js";
import { showCommunity, showTopic, showProposal } from "./screens-community.js";
import { showProfile, showHandleLookup, showWallet, showPixLookup } from "./screens-profile.js";
import { showPeople, showConnect } from "./screens-people.js";
import { showNetworkSettings, showStewardWizard } from "./screens-network.js";
import { showDmList, showDmThread } from "./screens-dm.js";
import { showVoxpedia } from "./screens-voxpedia.js";
import {
  showComposeCommunity,
  showComposeTopic,
  showComposeListing,
  showComposeProposal,
  showComposeReply,
} from "./screens-compose.js";

export async function routeImpl() {
  checkCantinaGate();
  const r = parseRoute();
  if (r.name === "home") return showHome(r.feed);
  if (r.name === "tag-feed") return showTagFeed(r.slug);
  if (r.name === "communities") return showCommunities();
  if (r.name === "people") return showPeople(r.query);
  if (r.name === "connect") return showConnect(r.routeId);
  if (r.name === "perfil") return showProfile(null, r.tab);
  if (r.name === "pix-lookup") return showPixLookup(r.query);
  if (r.name === "network-settings") return showNetworkSettings();
  if (r.name === "steward-wizard") return showStewardWizard();
  if (r.name === "handle-lookup") return showHandleLookup(r.slug);
  if (r.name === "dm-list") return showDmList();
  if (r.name === "dm-thread") return showDmThread(r.address);
  if (r.name === "voxpedia") return showVoxpedia();
  if (r.name === "community") return showCommunity(r.id, r.tab);
  if (r.name === "proposal") return showProposal(r.communityId, r.proposalId);
  if (r.name === "topic") return showTopic(r.id, r.communityId);
  if (r.name === "profile") return showProfile(r.address, r.tab);
  if (r.name === "wallet") return showWallet();
  if (r.name === "compose-community") return showComposeCommunity();
  if (r.name === "compose-listing") return showComposeListing(r.communityId);
  if (r.name === "compose-proposal") return showComposeProposal(r.communityId);
  if (r.name === "compose-topic") return showComposeTopic(r.communityId);
  if (r.name === "compose-reply") return showComposeReply(r.topicId, r.communityId);
  return showHome();
}

export function wireRoute() {
  setRoute(routeImpl);
}

export function setupHashchangeListener() {
  window.addEventListener("hashchange", () => routeImpl());
}
