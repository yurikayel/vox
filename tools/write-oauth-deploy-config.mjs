/** Gera _site/config/oauth.json no deploy Pages (secrets Actions). */
import fs from "node:fs";
import path from "node:path";

const google = String(process.env.VOX_GOOGLE_CLIENT_ID || "").trim();
const facebook = String(process.env.VOX_FACEBOOK_APP_ID || "").trim();
const enabledProviders = [];
if (google && !google.includes("YOUR_")) enabledProviders.push("google");
if (facebook && !facebook.includes("YOUR_")) enabledProviders.push("facebook");

const payload = {
  googleClientId: google,
  facebookAppId: facebook,
  enabledProviders,
};

const outDir = path.join(process.cwd(), "_site", "config");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "oauth.json"), `${JSON.stringify(payload, null, 2)}\n`);

if (!enabledProviders.length) {
  console.warn(
    "::warning:: OAuth Pages: VOX_GOOGLE_CLIENT_ID e VOX_FACEBOOK_APP_ID vazios — modal manterá aviso de operador.",
  );
} else {
  console.log(`OAuth Pages: providers ativos: ${enabledProviders.join(", ")}`);
}
