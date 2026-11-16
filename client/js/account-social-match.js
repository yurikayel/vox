/**
 * @module account-social-match
 * Reconhece, entre as contas guardadas neste aparelho, a que pertence a um login social (Google ou Meta).
 * Funções puras sobre as entradas do cofre local; quem lê e grava o cofre é `local-account.js`.
 */

function detectSocialAvatarType(av) {
  if (!av) return null;
  if (av.includes("googleusercontent.com/")) return "google";
  if (av.includes("facebook.com") || av.includes("fbsbx.com") || av.includes("fbcdn.net")) return "meta";
  return null;
}

/**
 * Chave que identifica o login social de uma conta do cofre local (provedor + sub, e-mail ou foto),
 * para achar contas repetidas. Sem sinal social, `null`.
 * @param {object} acc entrada do cofre local de contas
 * @returns {string|null}
 */
export function computeAccountSocialKey(acc) {
  const enrich = acc?.enrichment || {};
  const av = enrich.avatarUrl || "";
  const avatarType = detectSocialAvatarType(av);
  const prov = enrich.oauthProvider || avatarType || "oauth";
  if (enrich.oauthSub) return `${prov}:${enrich.oauthSub}`;
  if (enrich.oauthEmail) return `${prov}:${enrich.oauthEmail.toLowerCase()}`;
  if (avatarType) return av.split("=")[0];
  const cleanName = (acc?.displayName && !acc.displayName.startsWith("vx_")) ? acc.displayName.trim() : null;
  return (cleanName && av) ? `name-av:${cleanName}:${av}` : null;
}

function isSameProvider(expected, current) {
  if (!expected || !current || expected === current) return true;
  return expected === "meta" && current === "facebook";
}

function matchesSocialAvatar(enrichAv, targetAv, isGoogleAv) {
  if (!enrichAv || !targetAv) return false;
  if (isGoogleAv && enrichAv.split("=")[0] === targetAv.split("=")[0]) return true;
  const isMetaAv = targetAv.includes("facebook.com") || targetAv.includes("fbsbx.com") || targetAv.includes("fbcdn.net");
  return Boolean(isMetaAv && enrichAv === targetAv);
}

/**
 * A conta do cofre local é a deste login social? Compara provedor, depois sub, e-mail e por fim a foto.
 * @param {{ enrich: object, cleanSub: string, cleanEmail: string, isGoogleAv: boolean, cleanAv: string, provider?: string }} args
 * @returns {boolean}
 */
export function matchesOAuthEnrichment({ enrich, cleanSub, cleanEmail, isGoogleAv, cleanAv, provider = "" }) {
  if (!isSameProvider(provider, enrich.oauthProvider)) return false;
  if (cleanSub && enrich.oauthSub === cleanSub) return true;
  if (cleanEmail && enrich.oauthEmail && enrich.oauthEmail.toLowerCase() === cleanEmail) return true;
  return matchesSocialAvatar(enrich.avatarUrl, cleanAv, isGoogleAv);
}
