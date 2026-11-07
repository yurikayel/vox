/**
 * Gera, no deploy do Pages, a configuração de login social (segredos/variáveis do Actions):
 *  - _site/config/oauth.json — IDs PÚBLICOS dos apps (nunca segredos) + URL do relay de troca.
 *  - _site/oauth/bsky-client-metadata.json — metadados do cliente OAuth do Bluesky; o client_id
 *    é a própria URL deste arquivo no site publicado (VOX_SITE_URL ou o Pages do repositório).
 */
import fs from "node:fs";
import path from "node:path";

const env = (k) => String(process.env[k] || "").trim();
const isSet = (v) => Boolean(v) && !v.includes("YOUR_");

const ids = {
  googleClientId: env("VOX_GOOGLE_CLIENT_ID"),
  facebookAppId: env("VOX_FACEBOOK_APP_ID"),
  xClientId: env("VOX_X_CLIENT_ID"),
  githubClientId: env("VOX_GITHUB_CLIENT_ID"),
  threadsAppId: env("VOX_THREADS_APP_ID"),
  tiktokClientKey: env("VOX_TIKTOK_CLIENT_KEY"),
  instagramAppId: env("VOX_INSTAGRAM_APP_ID"),
};

const enabledProviders = [];
if (isSet(ids.googleClientId)) enabledProviders.push("google");
if (isSet(ids.facebookAppId)) enabledProviders.push("facebook");

const payload = { ...ids, oauthRelayUrl: env("VOX_OAUTH_RELAY_URL"), enabledProviders };

/** URL pública do site (com barra final). */
export function resolveSiteUrl(e = process.env) {
  const explicit = String(e.VOX_SITE_URL || "").trim();
  if (explicit) return explicit.endsWith("/") ? explicit : `${explicit}/`;
  const [owner, repo] = String(e.GITHUB_REPOSITORY || "").split("/");
  if (!owner || !repo) return "";
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

/** Metadados do cliente OAuth do AT Protocol (cliente público, DPoP obrigatório). */
export function buildBskyClientMetadata(siteUrl) {
  return {
    client_id: `${siteUrl}oauth/bsky-client-metadata.json`,
    client_name: "Vox",
    client_uri: siteUrl,
    logo_uri: `${siteUrl}icons/icon-white-512.png`,
    redirect_uris: [`${siteUrl}oauth-callback.html`],
    scope: "atproto transition:generic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  };
}

function writeJson(rel, data) {
  const file = path.join(process.cwd(), "_site", rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

if (process.argv[1] && process.argv[1].endsWith("write-oauth-deploy-config.mjs")) {
  writeJson("config/oauth.json", payload);
  const site = resolveSiteUrl();
  if (site) {
    writeJson("oauth/bsky-client-metadata.json", buildBskyClientMetadata(site));
    console.log(`OAuth Bluesky: client_id ${site}oauth/bsky-client-metadata.json`);
  } else {
    console.warn("::warning:: OAuth Bluesky: VOX_SITE_URL/GITHUB_REPOSITORY ausentes — login do Bluesky desativado neste deploy.");
  }
  const logins = Object.entries(ids).filter(([, v]) => isSet(v)).map(([k]) => k);
  console.log(`OAuth Pages: IDs configurados: ${logins.join(", ") || "nenhum"}; relay: ${payload.oauthRelayUrl || "não configurado"}`);
}
