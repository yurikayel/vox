/**
 * @module account-social-match
 * Reconhece, entre as contas guardadas neste aparelho, a que pertence a um login social (Google ou Meta).
 * Funções puras sobre as entradas do cofre local; quem lê e grava o cofre é `local-account.js`.
 */

const META_AVATAR_HOSTS = ["facebook.com", "fbsbx.com", "fbcdn.net"];

/**
 * De que login social é a foto, pelo host da URL (nunca por trecho do texto):
 * "https://x.example/?a=googleusercontent.com/" não é Google. Só https.
 * @param {string} avatarUrl
 * @returns {"google"|"meta"|null}
 */
export function detectSocialAvatarType(avatarUrl) {
  let url;
  try {
    url = new URL(avatarUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = `.${url.hostname}`;
  if (host.endsWith(".googleusercontent.com")) return "google";
  return META_AVATAR_HOSTS.some((h) => host.endsWith(`.${h}`)) ? "meta" : null;
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

/**
 * Compara o provedor esperado com o atual; `meta` e `facebook` contam como o mesmo.
 * @param {string} expected Provedor esperado
 * @param {string} current Provedor atual
 * @returns {boolean} `true` se forem compatíveis.
 */
function isSameProvider(expected, current) {
  if (!expected || !current || expected === current) return true;
  return expected === "meta" && current === "facebook";
}

/**
 * Diz se o avatar da rede social enriquecida corresponde ao avatar da conta.
 * @param {string} enrichAv Avatar vindo do enriquecimento
 * @param {string} targetAv Avatar da conta alvo
 * @param {boolean} isGoogleAv Se o avatar é do Google
 * @returns {boolean} `true` se correspondem.
 */
function matchesSocialAvatar(enrichAv, targetAv, isGoogleAv) {
  if (!enrichAv || !targetAv) return false;
  if (isGoogleAv && enrichAv.split("=")[0] === targetAv.split("=")[0]) return true;
  return detectSocialAvatarType(targetAv) === "meta" && enrichAv === targetAv;
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
