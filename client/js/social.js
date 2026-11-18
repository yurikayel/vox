/**
 * @file Preferências sociais locais (curtidas, estrelas, salvos, acompanhar) em `localStorage`.
 *
 * Métricas locais são privadas deste aparelho e não substituem contadores de rede.
 */

const LIKES_KEY = "vox-liked-posts";
const SAVED_KEY = "vox-saved-posts";
const STARS_KEY = "vox-starred-posts";
const WATCHED_KEY = "vox-watched-profiles";
const PINNED_KEY = "vox-pinned-posts";
const README_KEY = "vox-profile-readme";
const GITHUB_KEY = "vox-profile-github";
const COMMENT_REACT_KEY = "vox-liked-comments";
const EXPLODE_COUNTS_KEY = "vox-explode-counts";

function loadSet(key) {
  if (typeof window === "undefined" || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

function loadMap(key) {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMap(key, map) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {}
}

/* --- Curtidas (Likes ❤️) --- */

/**
 * Indica curtida local no post.
 * @param {string} postId Id do post.
 * @returns {boolean}
 */
export function isLiked(postId) {
  if (!postId) return false;
  return loadSet(LIKES_KEY).has(postId);
}

/**
 * Contagem exibida somando base de rede e curtida local.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {number}
 */
export function getLikesCount(postId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  return isLiked(postId) ? base + 1 : base;
}

/**
 * Alterna curtida local e devolve estado e contagem ajustada.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {{ liked: boolean, count: number }}
 */
export function toggleLike(postId, baseCount = 0) {
  if (!postId) return { liked: false, count: Number(baseCount) || 0 };
  const set = loadSet(LIKES_KEY);
  let liked = false;
  if (set.has(postId)) {
    set.delete(postId);
    liked = false;
  } else {
    set.add(postId);
    liked = true;
  }
  saveSet(LIKES_KEY, set);
  const count = (Number(baseCount) || 0) + (liked ? 1 : 0);
  return { liked, count };
}

/* --- Reações em comentários (♥ local) --- */

/**
 * Indica reação local em comentário.
 * @param {string} commentId Id do comentário.
 * @returns {boolean}
 */
export function isCommentReacted(commentId) {
  if (!commentId) return false;
  return loadSet(COMMENT_REACT_KEY).has(commentId);
}

/**
 * Contagem de reações no comentário com ajuste local.
 * @param {string} commentId Id do comentário.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {number}
 */
export function getCommentReactCount(commentId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  return isCommentReacted(commentId) ? base + 1 : base;
}

/**
 * Alterna reação local no comentário.
 * @param {string} commentId Id do comentário.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {{ reacted: boolean, count: number }}
 */
export function toggleCommentReact(commentId, baseCount = 0) {
  if (!commentId) return { reacted: false, count: Number(baseCount) || 0 };
  const set = loadSet(COMMENT_REACT_KEY);
  let reacted = false;
  if (set.has(commentId)) {
    set.delete(commentId);
    reacted = false;
  } else {
    set.add(commentId);
    reacted = true;
  }
  saveSet(COMMENT_REACT_KEY, set);
  const count = (Number(baseCount) || 0) + (reacted ? 1 : 0);
  return { reacted, count };
}

/* --- Estrelas (Stars ⭐ - GitHub UX) --- */

/**
 * Indica estrela local no post.
 * @param {string} postId Id do post.
 * @returns {boolean}
 */
export function isStarred(postId) {
  if (!postId) return false;
  return loadSet(STARS_KEY).has(postId);
}

/**
 * Contagem de estrelas com ajuste local.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {number}
 */
export function getStarsCount(postId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  return isStarred(postId) ? base + 1 : base;
}

/**
 * Alterna estrela local.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {{ starred: boolean, count: number }}
 */
export function toggleStar(postId, baseCount = 0) {
  if (!postId) return { starred: false, count: Number(baseCount) || 0 };
  const set = loadSet(STARS_KEY);
  let starred = false;
  if (set.has(postId)) {
    set.delete(postId);
    starred = false;
  } else {
    set.add(postId);
    starred = true;
  }
  saveSet(STARS_KEY, set);
  const count = (Number(baseCount) || 0) + (starred ? 1 : 0);
  return { starred, count };
}

/**
 * Ids de posts com estrela local.
 * @returns {string[]}
 */
export function getStarredPostIds() {
  return Array.from(loadSet(STARS_KEY));
}

/* --- Salvos / Favoritos (Bookmarks 🔖) --- */

/**
 * Indica post salvo localmente.
 * @param {string} postId Id do post.
 * @returns {boolean}
 */
export function isSaved(postId) {
  if (!postId) return false;
  return loadSet(SAVED_KEY).has(postId);
}

/**
 * Alterna salvamento local.
 * @param {string} postId Id do post.
 * @returns {boolean} Novo estado `saved`.
 */
export function toggleSave(postId) {
  if (!postId) return false;
  const set = loadSet(SAVED_KEY);
  let saved = false;
  if (set.has(postId)) {
    set.delete(postId);
    saved = false;
  } else {
    set.add(postId);
    saved = true;
  }
  saveSet(SAVED_KEY, set);
  return saved;
}

/**
 * Ids de posts salvos.
 * @returns {string[]}
 */
export function getSavedPostIds() {
  return Array.from(loadSet(SAVED_KEY));
}

/* --- Acompanhar Perfis (Watch 👁️ / Seguindo) --- */

/**
 * Indica acompanhamento local do perfil.
 * @param {string} routeId Rota do perfil.
 * @returns {boolean}
 */
export function isWatching(routeId) {
  if (!routeId) return false;
  return loadSet(WATCHED_KEY).has(routeId);
}

/**
 * Alterna acompanhamento do perfil.
 * @param {string} routeId Rota do perfil.
 * @returns {boolean} Novo estado `watching`.
 */
export function toggleWatch(routeId) {
  if (!routeId) return false;
  const set = loadSet(WATCHED_KEY);
  let watching = false;
  if (set.has(routeId)) {
    set.delete(routeId);
    watching = false;
  } else {
    set.add(routeId);
    watching = true;
  }
  saveSet(WATCHED_KEY, set);
  return watching;
}

/**
 * Rotas de perfis acompanhados.
 * @returns {string[]}
 */
export function getWatchedProfiles() {
  return Array.from(loadSet(WATCHED_KEY));
}

/**
 * Contador de seguidores com +1 local se acompanha o perfil.
 * @param {string} routeId Rota do perfil.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {number}
 */
export function getFollowersCount(routeId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  return isWatching(routeId) ? base + 1 : base;
}

/* --- Posts Fixados (Pinned 📌) --- */

/**
 * Id do post fixado no perfil, se houver.
 * @param {string} routeId Rota do perfil.
 * @returns {string}
 */
export function getPinnedPostId(routeId) {
  if (!routeId) return "";
  const map = loadMap(PINNED_KEY);
  return map[routeId] || "";
}

/**
 * Fixa ou remove fixação de post no perfil.
 * @param {string} routeId Rota do perfil.
 * @param {string} postId Id do post; vazio remove.
 * @returns {boolean}
 */
export function setPinnedPostId(routeId, postId) {
  if (!routeId) return false;
  const map = loadMap(PINNED_KEY);
  if (!postId) {
    delete map[routeId];
  } else {
    map[routeId] = postId;
  }
  saveMap(PINNED_KEY, map);
  return true;
}

/**
 * Indica se o post é o fixado do perfil.
 * @param {string} routeId Rota do perfil.
 * @param {string} postId Id do post.
 * @returns {boolean}
 */
export function isPostPinned(routeId, postId) {
  if (!routeId || !postId) return false;
  return getPinnedPostId(routeId) === postId;
}

/* --- Perfil README & GitHub Link --- */

/**
 * Texto README do perfil guardado neste aparelho.
 * @returns {string}
 */
export function getLocalReadme() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    return window.localStorage.getItem(README_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Grava README local do perfil.
 * @param {string} text Markdown ou texto livre.
 * @returns {boolean}
 */
export function setLocalReadme(text) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(README_KEY, String(text || ""));
    return true;
  } catch {
    return false;
  }
}

/**
 * Usuário GitHub associado ao perfil neste aparelho.
 * @returns {string}
 */
export function getLocalGithubHandle() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    return window.localStorage.getItem(GITHUB_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Define ou remove handle GitHub local (sem `@` inicial).
 * @param {string} handle Nome de usuário.
 * @returns {boolean}
 */
export function setLocalGithubHandle(handle) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const clean = String(handle || "").replace(/^@+/, "").trim();
    if (!clean) {
      window.localStorage.removeItem(GITHUB_KEY);
    } else {
      window.localStorage.setItem(GITHUB_KEY, clean);
    }
    return true;
  } catch {
    return false;
  }
}

/* --- Disparos EXPLODE! (📢 Métrica Cívica de Alcance) --- */

/**
 * Indica se já houve disparo EXPLODE registrado localmente para o post.
 * @param {string} postId Id do post.
 * @returns {boolean}
 */
export function isExploded(postId) {
  if (!postId) return false;
  const map = loadMap(EXPLODE_COUNTS_KEY);
  return (Number(map[postId]) || 0) > 0;
}

/**
 * Contagem de explodes somando base e registros locais.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {number}
 */
export function getExplodesCount(postId, baseCount = 0) {
  const base = Number(baseCount) || 0;
  if (!postId) return base;
  const map = loadMap(EXPLODE_COUNTS_KEY);
  return base + (Number(map[postId]) || 0);
}

/**
 * Incrementa contador local de EXPLODE para o post.
 * @param {string} postId Id do post.
 * @param {number} [baseCount=0] Contador remoto.
 * @returns {{ count: number, isNew: boolean }}
 */
export function recordExplosion(postId, baseCount = 0) {
  if (!postId) return { count: Number(baseCount) || 0, isNew: false };
  const map = loadMap(EXPLODE_COUNTS_KEY);
  const current = Number(map[postId]) || 0;
  const isNew = current === 0;
  map[postId] = current + 1;
  saveMap(EXPLODE_COUNTS_KEY, map);
  return { count: (Number(baseCount) || 0) + map[postId], isNew };
}