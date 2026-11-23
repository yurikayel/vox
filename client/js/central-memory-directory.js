/**
 * @file Diretório de perfis alimentado pela sincronização: cartão da conta ativa e dos autores dos posts,
 * gravado só quando algum campo muda.
 *
 * @module central-memory-directory
 */
import * as localAccount from "./identity/index.js";
import * as profileDirectory from "./profile-directory.js";

/**
 * Converte um valor em texto aparado.
 * @param {*} val Valor
 * @returns {string} Texto aparado.
 */
function cleanStr(val) {
  return val ? String(val).trim() : "";
}

/**
 * Diz se o novo valor existe e difere do anterior.
 * @param {string} nextVal Valor novo
 * @param {string} prevVal Valor anterior
 * @returns {boolean} `true` se mudou.
 */
function hasFieldDiff(nextVal, prevVal) {
  return Boolean(nextVal && nextVal !== prevVal);
}

/**
 * Diz se o cartão do diretório mudaria com os novos campos.
 * @param {object|null} existing Cartão atual
 * @param {string} cleanName Nome
 * @param {string} cleanAvatar Avatar
 * @param {string} cleanBio Bio
 * @returns {boolean} `true` se há mudança.
 */
function hasCardChanges(existing, cleanName, cleanAvatar, cleanBio) {
  if (!existing) return true;
  if (hasFieldDiff(cleanName, existing.name)) return true;
  if (hasFieldDiff(cleanAvatar, existing.avatarUrl)) return true;
  return hasFieldDiff(cleanBio, existing.bio);
}

/**
 * Escolhe o valor novo ou mantém o existente.
 * @param {string} cleanVal Valor novo
 * @param {string} existingVal Valor atual
 * @returns {string} Valor escolhido.
 */
function mergeCardField(cleanVal, existingVal) {
  return cleanVal ? cleanVal : cleanStr(existingVal);
}

/**
 * Cria ou atualiza o cartão do diretório de perfis, se houver mudança.
 * @param {string} routeId Id de rota (`vx_...`)
 * @param {string} name Nome
 * @param {string} [avatarUrl=""] Avatar
 * @param {string} [bio=""] Bio
 */
function upsertDirectoryCardIfNeeded(routeId, name, avatarUrl = "", bio = "") {
  const id = cleanStr(routeId);
  if (!id.startsWith("vx_")) return;
  const existing = profileDirectory.getProfileCard(id);
  const cleanName = cleanStr(name);
  const cleanAvatar = cleanStr(avatarUrl);
  const cleanBio = cleanStr(bio);
  if (!hasCardChanges(existing, cleanName, cleanAvatar, cleanBio)) return;
  const ex = existing ? existing : {};
  profileDirectory.setProfileCard(id, {
    name: mergeCardField(cleanName, ex.name),
    avatarUrl: mergeCardField(cleanAvatar, ex.avatarUrl),
    bio: mergeCardField(cleanBio, ex.bio),
    discoverable: true,
  });
}

// Só a conta ativa, com nome e visível na malha. As outras contas do cofre não saem daqui: publicá-las
// juntas contaria a quem lê que são da mesma pessoa.
/**
 * Sincroniza o cartão da conta ativa com o diretório de perfis.
 */
function syncActiveAccountCard() {
  const myId = localAccount.getCachedRouteIdSync();
  if (!myId || !localAccount.getMeshDiscoverable()) return;
  const enrichObj = localAccount.getProfileEnrichment() || {};
  const myName = localAccount.getDisplayName() || enrichObj.displayName;
  if (profileDirectory.hasChosenCardName({ name: myName, routeId: myId })) {
    upsertDirectoryCardIfNeeded(myId, myName, enrichObj.avatarUrl, enrichObj.bio);
  }
}

/**
 * Atualiza o cartão do autor de um post no diretório.
 * @param {object} post Post
 */
export function upsertAuthorCard(post) {
  if (post) upsertDirectoryCardIfNeeded(post.author || post.owner, post.authorDisplay, post.authorAvatar, "");
}

/**
 * Sincroniza as contas locais e os autores dos posts com o diretório de perfis.
 * @param {object[]} allPosts Posts
 */
export function syncLocalAccountsToProfileDirectory(allPosts) {
  syncActiveAccountCard();
  for (const post of Array.isArray(allPosts) ? allPosts : []) upsertAuthorCard(post);
}
