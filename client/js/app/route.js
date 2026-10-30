/** @file Hash router — dispatches to screen modules. */
import { closePostMoreMenu } from "../render/post-more-menu.js";
import { parseRoute } from "./route-parse.js";
import { setRoute } from "./navigation.js";
import { checkCantinaGate } from "./onboarding.js";
import { showHome, showCommunities, showTagFeed } from "./screens-home.js";
import { showCommunity, showTopic, showProposal } from "./screens-community.js";
import { showProfile, showHandleLookup, showWallet, showPixLookup } from "./screens-profile.js";
import { showPeople, showConnect } from "./screens-people.js";
import { showNetworkSettings, showStewardWizard, showLinkedAccounts } from "./screens-network.js";
import { showDmList, showDmThread } from "./screens-dm.js";
import { showVoxpedia } from "./screens-voxpedia.js";
import { showAjudaTeste } from "./screens-ajuda-teste.js";
import { showStatus } from "./screens-status.js";
import { showLabsFrames, showLabsMofn } from "./screens-labs.js";
import {
  showComposeCommunity,
  showComposeTopic,
  showComposeListing,
  showComposeProposal,
  showComposeReply,
} from "./screens-compose.js";

const ROUTE_DISPATCH_TABLE = {
  home: (r) => showHome(r.feed),
  "tag-feed": (r) => showTagFeed(r.slug),
  communities: () => showCommunities(),
  people: (r) => showPeople(r.query),
  connect: (r) => showConnect(r.routeId),
  perfil: (r) => showProfile(null, r.tab),
  "pix-lookup": (r) => showPixLookup(r.query),
  "network-settings": () => showNetworkSettings(),
  "linked-accounts": () => showLinkedAccounts(),
  "steward-wizard": () => showStewardWizard(),
  "handle-lookup": (r) => showHandleLookup(r.slug),
  "dm-list": () => showDmList(),
  "dm-thread": (r) => showDmThread(r.address),
  voxpedia: () => showVoxpedia(),
  "ajuda-teste": () => showAjudaTeste(),
  status: () => showStatus(),
  "labs-frames": () => showLabsFrames(),
  "labs-mofn": () => showLabsMofn(),
  community: (r) => showCommunity(r.id, r.tab),
  proposal: (r) => showProposal(r.communityId, r.proposalId),
  topic: (r) => showTopic(r.id, r.communityId),
  profile: (r) => showProfile(r.address, r.tab),
  wallet: () => showWallet(),
  "compose-community": () => showComposeCommunity(),
  "compose-listing": (r) => showComposeListing(r.communityId),
  "compose-proposal": (r) => showComposeProposal(r.communityId),
  "compose-topic": (r) => showComposeTopic(r.communityId),
  "compose-reply": (r) => showComposeReply(r.topicId, r.communityId),
};

export async function routeImpl() {
  closePostMoreMenu();
  checkCantinaGate();
  const r = parseRoute();
  const handler = ROUTE_DISPATCH_TABLE[r.name] || (() => showHome());
  return await handler(r);
}

export function wireRoute() {
  setRoute(routeImpl);
}

export function setupHashchangeListener() {
  window.addEventListener("hashchange", () => routeImpl());
}
