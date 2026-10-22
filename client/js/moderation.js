import { fetchModActions as gqlFetchModActions } from "./graphql.js";

export async function fetchModActions(communityId) {
  return gqlFetchModActions(communityId);
}

export function parseModerators(rawModerators = "") {
  if (!rawModerators) return [];
  return rawModerators
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isModerator(userAddress, communityOwner, rawModerators = "") {
  if (!userAddress) return false;
  if (communityOwner && userAddress.toLowerCase() === communityOwner.toLowerCase()) {
    return true;
  }
  const list = parseModerators(rawModerators);
  return list.some((m) => m.toLowerCase() === userAddress.toLowerCase());
}

export function applyFilters(items, actions = [], communityOwner = "", rawModerators = "") {
  if (!Array.isArray(items) || !items.length) return [];
  if (!Array.isArray(actions) || !actions.length) return items;

  const validModerators = new Set();
  if (communityOwner) validModerators.add(communityOwner.toLowerCase());
  for (const m of parseModerators(rawModerators)) {
    validModerators.add(m.toLowerCase());
  }

  const hiddenTargets = new Set();
  const bannedOwners = new Set();

  for (const act of actions) {
    const actOwner = (act.owner || "").toLowerCase();
    // Ação só tem efeito se partiu de um moderador legítimo
    if (validModerators.size > 0 && !validModerators.has(actOwner)) {
      continue;
    }

    if (act.action === "hide" && act.target) {
      hiddenTargets.add(act.target);
    } else if (act.action === "ban" && act.target) {
      bannedOwners.add(act.target.toLowerCase());
    }
  }

  return items.filter((item) => {
    if (hiddenTargets.has(item.id)) return false;
    if (item.owner && bannedOwners.has(item.owner.toLowerCase())) return false;
    return true;
  });
}
