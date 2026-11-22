/**
 * @file Submódulo de carregamento e montagem de dados de perfil.
 * @module app/profile-screen-data
 */

import * as gql from "../graphql.js";
import * as mock from "../mock.js";
import * as wallet from "../wallet.js";
import * as mod from "../moderation.js";
import * as cacheNode from "../cache-node.js";
import * as cryptoDm from "../crypto-dm.js";
import * as localAccount from "../identity/index.js";
import * as social from "../social.js";
import * as pixKeyHelper from "../pix-key.js";
import * as postOwnership from "../post-ownership.js";
import * as profileDirectory from "../profile-directory.js";
import * as welcomeProfile from "../vox-welcome-profile.js";
import { getCachedBskyPosts } from "../bsky-feed.js";
import * as voxels from "../voxels.js";
import { getLocalIdentityMeta, pickIdentityMeta } from "../profile-identity-meta.js";

let activeProfileCache = null;

function collectByIds(posts, ids) {
  const set = new Set(ids);
  const out = [];
  const seen = new Set();
  for (const p of posts || []) {
    if (!p?.id || !set.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Invalida cache de perfil no aparelho.
 *
 * @returns {void}
 */
export function invalidateProfileCache() {
  activeProfileCache = null;
}

async function loadProfileMemberships(targetAddress) {
  const memberships = await gql.fetchUserMemberships(targetAddress);
  const localMems = await cacheNode.getLocalPosts({ type: "membership" });
  for (const m of localMems) {
    if (m.author === targetAddress && !memberships.some((x) => x.communityId === m.communityId)) {
      memberships.push({ id: m.id, communityId: m.communityId });
    }
  }
  return memberships;
}

async function loadProfileWalletAndDm(isSelf) {
  let dmPub = null;
  if (isSelf) {
    dmPub = await cryptoDm.getPublicJwk();
  }
  let balance = "0.000";
  if (wallet.hasWallet() && isSelf) {
    try {
      balance = await wallet.getBalance(await wallet.getAddress());
    } catch {
      balance = "0.000";
    }
  }
  return { dmPub, balance };
}

async function fetchHandleWithConflict(targetAddress) {
  const handle = await gql.fetchHandleForAddress(targetAddress);
  if (!handle) return { handle: null, conflictInfo: null };
  const hRes = await gql.fetchHandle(handle);
  const conflictInfo = hRes && hRes.isConflict ? hRes : null;
  return { handle, conflictInfo };
}

function resolveIdentityFields(targetAddress, isSelf, resolved, mockProf) {
  if (welcomeProfile.isWelcomeRouteId(targetAddress)) {
    return {
      displayName: resolved.name || "Vox",
      handleOverride: "vox",
      profileBio: resolved.bio || "",
    };
  }
  if (mockProf) {
    return {
      displayName: mockProf.name || resolved.name || "",
      handleOverride: null,
      profileBio: mockProf.bio || resolved.bio || "",
    };
  }
  const selfName = isSelf ? localAccount.getDisplayName() : "";
  return {
    displayName: resolved.name || selfName,
    handleOverride: null,
    profileBio: resolved.bio || "",
  };
}

async function loadProfileIdentity(targetAddress, isSelf) {
  const { handle: fetchedHandle, conflictInfo } = await fetchHandleWithConflict(targetAddress);
  const mockProf = mock.getMockProfile(targetAddress);
  const resolved = await profileDirectory.resolveProfile(targetAddress);
  const { displayName, handleOverride, profileBio } = resolveIdentityFields(targetAddress, isSelf, resolved, mockProf);
  const handle = handleOverride || fetchedHandle;
  const pixKey = isSelf ? pixKeyHelper.storedPixValue(localAccount.getPixKey()) : (mockProf?.pixKey || "");
  const pixKeyMasked = pixKey ? pixKeyHelper.maskForDisplay(pixKey) : "";
  return { handle, conflictInfo, mockProf, resolved, displayName, profileBio, pixKey, pixKeyMasked };
}

async function loadProfilePosts(targetAddress, isSelf, user, mockProf) {
  const localPosts = await cacheNode.getLocalPosts({ type: "topic" });
  let authorPosts = localPosts.filter((p) => (p.author || p.owner) === targetAddress);
  if (isSelf) authorPosts = postOwnership.mapOwnLocalFlags(authorPosts, user);
  if (!authorPosts.length && mockProf) {
    authorPosts = mock.MOCK_DEMO_TOPICS.filter((t) => t.author === targetAddress);
  }
  const allAvailable = [...localPosts, ...mock.MOCK_DEMO_TOPICS, ...getCachedBskyPosts()];
  const starredPosts = collectByIds(allAvailable, social.getStarredPostIds());
  const savedPosts = collectByIds(allAvailable, social.getSavedPostIds());
  return { authorPosts, allAvailable, starredPosts, savedPosts };
}

function resolveProfileSocialFields(isSelf, targetAddress, mockProf, resolved) {
  if (isSelf) {
    const readme = social.getLocalReadme();
    const enrich = localAccount.getProfileEnrichment();
    return {
      githubHandle: social.getLocalGithubHandle(),
      readme,
      finalReadme: readme,
      pinnedPostId: social.getPinnedPostId(targetAddress),
      oauthProvider: enrich ? enrich.oauthProvider || "" : "",
      identityMeta: getLocalIdentityMeta(targetAddress),
    };
  }
  const readme = mockProf ? mockProf.readme || "" : "";
  return {
    githubHandle: mockProf ? mockProf.githubHandle || "" : "",
    readme,
    finalReadme: readme,
    pinnedPostId: mockProf ? mockProf.pinnedPostId || "" : "",
    oauthProvider: "",
    identityMeta: pickIdentityMeta(resolved, mockProf),
  };
}

function buildProfileDataObject({
  targetAddress, isSelf, ident, postsData, balance, memberships, dmPub, activeTab,
}) {
  const soc = resolveProfileSocialFields(isSelf, targetAddress, ident.mockProf, ident.resolved);
  return {
    address: targetAddress,
    isCurrentWallet: isSelf,
    handle: ident.handle || "",
    isConflict: Boolean(ident.conflictInfo?.isConflict),
    claimants: ident.conflictInfo?.claimants || [],
    displayName: ident.displayName,
    profileBio: ident.profileBio,
    stats: ident.mockProf?.stats || null,
    posts: postsData.authorPosts,
    authorPostList: postsData.authorPosts,
    allAvailablePosts: postsData.allAvailable,
    starredPosts: postsData.starredPosts,
    savedPosts: postsData.savedPosts,
    hasWallet: wallet.hasWallet(),
    balance,
    pixKey: ident.pixKey,
    pixKeyMasked: ident.pixKeyMasked,
    ...soc,
    isBlocked: mod.isUserBlocked(targetAddress),
    isMuted: mod.isUserMuted(targetAddress),
    meshDiscoverable: localAccount.getMeshDiscoverable(),
    receipts: voxels.loadVoxelReceipts(targetAddress),
    memberships, dmPub, activeTab,
  };
}

/**
 * Carrega dados completos do perfil para renderização com suporte a cache local.
 *
 * @param {string} targetAddress Endereço ou rota do perfil.
 * @param {boolean} isSelf Indica se o perfil pertence à identidade ativa.
 * @param {string} user Endereço da identidade ativa.
 * @param {string} [activeTab="posts"] Aba ativa exibida no perfil.
 * @returns {Promise<object>} Objeto com dados compilados para renderização do perfil.
 */
export async function loadProfileData(targetAddress, isSelf, user, activeTab = "posts") {
  if (activeProfileCache && activeProfileCache.address === targetAddress) {
    const all = activeProfileCache.allAvailablePosts || [];
    activeProfileCache.starredPosts = collectByIds(all, social.getStarredPostIds());
    activeProfileCache.savedPosts = collectByIds(all, social.getSavedPostIds());
    activeProfileCache.activeTab = activeTab;
    return activeProfileCache;
  }

  const memberships = await loadProfileMemberships(targetAddress);
  const { dmPub, balance } = await loadProfileWalletAndDm(isSelf);
  const ident = await loadProfileIdentity(targetAddress, isSelf);
  if (ident.mockProf && !memberships.some((x) => x.communityId === "demo-aprenda-vox")) {
    memberships.push({ id: `mem_${targetAddress}`, communityId: "demo-aprenda-vox" });
  }
  const postsData = await loadProfilePosts(targetAddress, isSelf, user, ident.mockProf);

  const data = buildProfileDataObject({
    targetAddress, isSelf, ident, postsData, balance, memberships, dmPub, activeTab,
  });
  activeProfileCache = data;
  return data;
}
