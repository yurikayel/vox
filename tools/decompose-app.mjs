/**
 * One-off: split client/js/app.js into client/js/app/*.js modules.
 * Run from repo root: node tools/decompose-app.mjs
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "client/js/app.js");
const OUT = path.join(ROOT, "client/js/app");

const IMPORT_BLOCK = `import * as gql from "../graphql.js";
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
import { route } from "./navigation.js";
`;

const MODULES = {
  "context.js": {
    doc: "/** @file Shared shell helpers for app screens. */\n",
    imports: `import * as wallet from "../wallet.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";
`,
    fns: ["getActiveUser", "makeShellProps", "attachPostShareHandlers"],
  },
  "zap-modal.js": {
    doc: "/** @file Pix zap modal UI. */\n",
    imports: `import * as render from "../render.js";
import * as share from "../share.js";
import * as brcode from "../brcode.js";
`,
    fns: ["getOrCreateZapModalContainer", "openZapModal", "bindZapModalEvents"],
  },
  "onboarding.js": {
    doc: "/** @file Cantina gate, OAuth enrich, pact modals. */\n",
    imports: `import * as render from "../render.js";
import * as share from "../share.js";
import * as localAccount from "../local-account.js";
import * as oauthProfile from "../oauth-profile.js";
import * as meshProfile from "../mesh-profile.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import { parseRoute } from "./route-parse.js";
import { route } from "./navigation.js";
`,
    fns: [
      "ensureOnboardingSideEffects",
      "setOAuthEnrichError",
      "setOAuthButtonBusy",
      "reportOAuthEnrichFailure",
      "runOAuthEnrichSignIn",
      "checkOAuthEnrichStep",
      "checkCantinaGate",
      "checkPactModal",
    ],
  },
  "screens-home.js": {
    doc: "/** @file Home feed, communities list, tag feed. */\n",
    imports: IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', "") + `import { ensureOnboardingSideEffects } from "./onboarding.js";
`,
    fns: ["showHome", "showCommunities", "showTagFeed"],
  },
  "screens-community.js": {
    doc: "/** @file Community, topic, listings, proposals. */\n",
    imports:
      IMPORT_BLOCK +
      `import { openZapModal } from "./zap-modal.js";
`,
    fns: [
      "showCommunity",
      "attachCommunityListingHandlers",
      "handleListingStatusUpdate",
      "handleListingRetract",
      "showTopic",
      "showProposal",
      "fetchProposalData",
      "loadProposalVotes",
      "attachProposalVotingHandlers",
    ],
  },
  "screens-profile.js": {
    doc: "/** @file Profile, handle lookup, wallet, pix lookup. */\n",
    imports:
      IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', "") +
      `import { syncIdentity } from "./screens-network.js";
`,
    fns: ["showProfile", "bindProfileButtons", "showHandleLookup", "showWallet", "showPixLookup"],
  },
  "screens-people.js": {
    doc: "/** @file People search and connect preview. */\n",
    imports: IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', ""),
    fns: ["showPeople", "showConnect"],
  },
  "screens-network.js": {
    doc: "/** @file Network settings and steward wizard. */\n",
    imports: IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', ""),
    fns: [
      "bindNetworkSettingsForm",
      "bindNetworkSettingsButtons",
      "showNetworkSettings",
      "bindStewardWizardForm",
      "showStewardWizard",
      "syncIdentity",
    ],
  },
  "screens-dm.js": {
    doc: "/** @file Direct messages list and thread. */\n",
    imports:
      IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', "") +
      `import { ensureOnboardingSideEffects } from "./onboarding.js";
`,
    fns: ["pollInboxMessages", "showDmList", "handleSendDmSubmit", "showDmThread", "initDmListeners"],
  },
  "screens-compose.js": {
    doc: "/** @file Compose flows and inline reply UI. */\n",
    imports: IMPORT_BLOCK.replace('import { route } from "./navigation.js";\n', ""),
    fns: [
      "showComposeCommunity",
      "showComposeTopic",
      "showComposeListing",
      "handleComposeListingSubmit",
      "showComposeProposal",
      "attachComposeProposalHandlers",
      "publishProposal",
      "showComposeReply",
      "persistLocalReply",
      "loadInlineReplies",
      "setCommentOpen",
      "closeOtherCommentPanels",
      "fillCommentFeed",
      "togglePostComments",
      "appendInlineReply",
      "bumpReplyCount",
      "onInlineReplySubmit",
    ],
  },
  "init.js": {
    doc: "/** @file Global listeners: gossip, DM, social/post interactions. */\n",
    imports: `import * as render from "../render.js";
import * as mock from "../mock.js";
import * as share from "../share.js";
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as cryptoDm from "../crypto-dm.js";
import * as localAccount from "../local-account.js";
import * as social from "../social.js";
import * as frames from "../frames.js";
import * as postOwnership from "../post-ownership.js";
import { parseRoute } from "./route-parse.js";
import { getActiveUser } from "./context.js";
import { route } from "./navigation.js";
import { openZapModal } from "./zap-modal.js";
import { showHome, showTagFeed } from "./screens-home.js";
import {
  showCommunity,
  showTopic,
  showProposal,
} from "./screens-community.js";
import { showDmThread, initDmListeners } from "./screens-dm.js";
`,
    fns: [
      "initGossipListeners",
      "resolvePostForFrame",
      "executeFrameAction",
      "handleFrameActionClick",
      "getPostEditModalContainer",
      "closePostEditModalUi",
      "openPostEditModal",
      "handleDeletePost",
      "initSocialInteractions",
    ],
    reExport: ["initDmListeners"],
  },
};

function parseFunctions(source) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l.startsWith("async function getActiveUser"));
  const body = lines.slice(start);
  const fns = new Map();
  let i = 0;
  while (i < body.length) {
    const m = body[i].match(/^(async )?function (\w+)/);
    if (!m) {
      i++;
      continue;
    }
    const name = m[2];
    const fnLines = [body[i]];
    i++;
    let depth = 0;
    const open = body[i - 1].includes("{");
    depth = open ? 1 : 0;
    if (depth === 0) {
      // single line function unlikely
    }
    while (i < body.length && depth > 0) {
      fnLines.push(body[i]);
      for (const ch of body[i]) {
        if (ch === "{") depth++;
        if (ch === "}") depth--;
      }
      i++;
    }
    fns.set(name, fnLines.join("\n"));
  }
  return fns;
}

function exportify(fnSrc, name) {
  let s = fnSrc.replace(/^(async )?function /, "export $1function ");
  if (name === "initDmListeners" && fnSrc.includes("function initDmListeners")) {
    s = fnSrc.replace(/^function initDmListeners/, "export function initDmListeners");
  }
  return s;
}

const src = fs.readFileSync(APP, "utf8");
const fnMap = parseFunctions(src);

fs.mkdirSync(OUT, { recursive: true });

fs.writeFileSync(
  path.join(OUT, "navigation.js"),
  `/** @file Deferred route() to break import cycles. */
/** @type {() => Promise<void>} */
let _route = async () => {};
export function setRoute(fn) {
  _route = fn;
}
export function route() {
  return _route();
}
`,
);

for (const [file, cfg] of Object.entries(MODULES)) {
  const chunks = [];
  chunks.push(cfg.doc);
  chunks.push(cfg.imports);
  for (const fn of cfg.fns) {
    const srcFn = fnMap.get(fn);
    if (!srcFn) throw new Error(`Missing function ${fn} for ${file}`);
    chunks.push(exportify(srcFn, fn));
    chunks.push("");
  }
  if (cfg.reExport) {
    for (const fn of cfg.reExport) {
      chunks.push(`export { ${fn} } from "./screens-dm.js";\n`);
    }
  }
  fs.writeFileSync(path.join(OUT, file), chunks.join("\n"));
}

const routeJs = `/** @file Hash router — dispatches to screen modules. */
import { parseRoute } from "./route-parse.js";
import { setRoute } from "./navigation.js";
import { checkCantinaGate } from "./onboarding.js";
import { showHome, showCommunities, showTagFeed } from "./screens-home.js";
import { showCommunity, showTopic, showProposal } from "./screens-community.js";
import { showProfile, showHandleLookup, showWallet, showPixLookup } from "./screens-profile.js";
import { showPeople, showConnect } from "./screens-people.js";
import { showNetworkSettings, showStewardWizard } from "./screens-network.js";
import { showDmList, showDmThread } from "./screens-dm.js";
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
`;

fs.writeFileSync(path.join(OUT, "route.js"), routeJs);

const entry = `/** @file Vox client entry — boot and route wiring. */
import * as demoSeed from "./demo-seed.js";
import { wireRoute, setupHashchangeListener, routeImpl as route } from "./app/route.js";
import { initDmListeners, initGossipListeners, initSocialInteractions } from "./app/init.js";
import { syncIdentity } from "./app/screens-network.js";

wireRoute();
setupHashchangeListener();
initDmListeners();
initGossipListeners();
initSocialInteractions();
syncIdentity();
demoSeed.ensureDemoSeed().finally(() => route());
`;

fs.writeFileSync(APP, entry);

console.log("Wrote modules to", OUT);
console.log("Functions parsed:", fnMap.size);
