/** @file Regras de formato, validação e resolução de URLs de redes para contas vinculadas. */

/** Chave do `localStorage` com as contas vinculadas, por rede. */
export const LINKED_ACCOUNTS_KEY = "vox-linked-accounts-v1";
/** Chave do `localStorage` da replicação automática (`"true"` ligada). */
export const AUTO_REPLICATE_KEY = "vox-auto-replicate-enabled";
/** Chave do `localStorage` do webhook geral, que recebe toda replicação. */
export const GENERAL_WEBHOOK_KEY = "vox-replication-webhook";
/** Servidor de dados (PDS) do Bluesky usado quando a conta não indica outro. */
export const BSKY_DEFAULT_PDS = "https://bsky.social";

/**
 * Redes que podem ser vinculadas, com nome, ícone, cor e o que cada uma aceita: webhook automático, postagem direta
 * pelo AT Protocol e leitura do feed.
 */
export const SUPPORTED_NETWORKS = Object.freeze([
  { id: "bsky", name: "Bluesky", icon: "🦋", color: "#0085ff", canAutoWebhook: true, supportsAtProto: true, hasFeed: true },
  { id: "twitter", name: "Twitter / X", icon: "🐦", color: "#1d9bf0", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "threads", name: "Threads", icon: "🧵", color: "#000000", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "instagram", name: "Instagram", icon: "📸", color: "#e1306c", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "facebook", name: "Facebook", icon: "👥", color: "#1877f2", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "tiktok", name: "TikTok", icon: "🎵", color: "#000000", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "github", name: "GitHub", icon: "🐙", color: "#24292f", canAutoWebhook: false, supportsAtProto: false, hasFeed: false },
]);

/** Formato de @usuário aceito por rede (regras públicas de cada plataforma). */
const HANDLE_RULES = {
  bsky: { re: /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i, hint: "domínio completo, ex.: voce.bsky.social" },
  twitter: { re: /^[A-Za-z0-9_]{1,15}$/, hint: "até 15 letras, números ou _" },
  threads: { re: /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/, hint: "até 30 letras, números, . ou _" },
  instagram: { re: /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/, hint: "até 30 letras, números, . ou _" },
  facebook: { re: /^[A-Za-z0-9.]{5,50}$/, hint: "5 a 50 letras, números ou ." },
  tiktok: { re: /^[A-Za-z0-9._]{2,24}$/, hint: "2 a 24 letras, números, . ou _" },
  github: { re: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, hint: "até 39 letras, números ou -" },
};

/** Perfis oficiais das próprias redes — nunca são "a sua conta". */
const OFFICIAL_HANDLES = {
  bsky: ["bsky.app", "bluesky", "bsky.social"],
  twitter: ["x", "twitter", "xdevelopers"],
  threads: ["threads", "instagram", "meta"],
  instagram: ["instagram", "meta", "creators"],
  facebook: ["facebook", "meta", "zuck"],
  tiktok: ["tiktok"],
  github: ["github"],
};

/**
 * Limpa o @usuário digitado: tira espaços, `@` iniciais, o começo de um link de perfil colado e barras no fim.
 * @param {unknown} raw Texto digitado.
 * @returns {string} O usuário limpo (pode ficar vazio).
 */
export function normalizeHandle(raw) {
  return String(raw || "").trim().replace(/^@+/, "").replace(/^https?:\/\/\S*?\/(?:@)?/i, "").replace(/\/+$/, "");
}

/**
 * Valida o @usuário digitado. Nada é inventado: sem handle válido, não há vínculo.
 * @param {string} netId Rede.
 * @param {unknown} raw Texto digitado (passa por `normalizeHandle`).
 * @returns {{ ok: boolean, handle: string, error?: string }} O usuário limpo e, se recusado (vazio, fora do formato da
 *   rede ou perfil oficial da própria rede), o texto do erro.
 */
export function validateHandle(netId, raw) {
  const handle = normalizeHandle(raw);
  const net = SUPPORTED_NETWORKS.find((n) => n.id === netId);
  const name = net?.name || netId;
  if (!handle) return { ok: false, handle, error: `Digite o seu @usuário no ${name}.` };
  const rule = HANDLE_RULES[netId];
  if (rule && !rule.re.test(handle)) return { ok: false, handle, error: `@${handle} não é um usuário válido no ${name} (${rule.hint}).` };
  if ((OFFICIAL_HANDLES[netId] || []).includes(handle.toLowerCase()) || handle.toLowerCase() === String(netId).toLowerCase()) {
    return { ok: false, handle, error: `@${handle} é o perfil oficial do ${name}, não o seu. Digite o seu @usuário.` };
  }
  return { ok: true, handle };
}

/** Redes que aceitam replicar abrindo o app ou o site com o texto pronto (intent), com rótulo e ícone. */
export const INTENT_NETWORK_META = Object.freeze({
  twitter: { id: "twitter", label: "X (Twitter)", icon: "🐦" },
  threads: { id: "threads", label: "Threads", icon: "🧵" },
  bsky: { id: "bluesky", label: "Bluesky", icon: "🦋" },
  instagram: { id: "instagram", label: "Instagram", icon: "📸" },
  facebook: { id: "facebook", label: "Facebook", icon: "👥" },
  tiktok: { id: "tiktok", label: "TikTok", icon: "🎵" },
});

/**
 * Endereço do perfil público da conta na rede.
 * @param {string} netId Rede.
 * @param {string} handle Usuário (com ou sem `@`).
 * @returns {string} O link, ou vazio sem usuário ou para rede desconhecida.
 */
export function resolveNetworkProfileUrl(netId, handle) {
  const h = String(handle || "").trim().replace(/^@/, "");
  if (!h) return "";
  if (netId === "instagram") return `https://www.instagram.com/${h}/`;
  if (netId === "twitter") return `https://x.com/${h}`;
  if (netId === "threads") return `https://www.threads.net/@${h}`;
  if (netId === "facebook") return `https://www.facebook.com/${h}`;
  if (netId === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (netId === "bsky") return `https://bsky.app/profile/${h}`;
  if (netId === "github") return `https://github.com/${h}`;
  return "";
}

const NETWORK_AUTH_TEMPLATES = {
  bsky: { withHandle: (h) => `https://bsky.app/profile/${encodeURIComponent(h)}`, fallback: "https://bsky.app/" },
  twitter: { withHandle: (h) => `https://x.com/${encodeURIComponent(h)}`, fallback: "https://x.com/" },
  threads: { withHandle: (h) => `https://www.threads.net/@${encodeURIComponent(h)}`, fallback: "https://www.threads.net/" },
  instagram: { withHandle: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`, fallback: "https://www.instagram.com/" },
  facebook: { fallback: "https://www.facebook.com/" },
  tiktok: { withHandle: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`, fallback: "https://www.tiktok.com/" },
  github: { withHandle: (h) => `https://github.com/${encodeURIComponent(h)}`, fallback: "https://github.com/login" },
};

/**
 * Página da rede a abrir para a pessoa conferir a conta: o perfil, se houver usuário e a rede aceitar, senão a
 * página inicial (ou de login) da rede.
 * @param {string} netId Rede.
 * @param {string} [handle=""] Usuário (com ou sem `@`).
 * @returns {string} O link; rede desconhecida cai em `https://google.com`.
 */
export function getNetworkAuthUrl(netId, handle = "") {
  const h = String(handle || "").trim().replace(/^@/, "");
  const tmpl = NETWORK_AUTH_TEMPLATES[netId];
  if (!tmpl) return "https://google.com";
  if (h && tmpl.withHandle) return tmpl.withHandle(h);
  return tmpl.fallback;
}

/**
 * Handle já informado pelo próprio usuário para esta rede (nunca um palpite a partir do nome,
 * do ID local ou de contas seguidas — isso gerava vínculos com perfis de outras pessoas).
 * @param {string} [netId=""] Rede.
 * @returns {string} O usuário guardado em `vox-profile-${netId}`, se for válido; senão vazio.
 */
export function getSuggestedHandle(netId = "") {
  if (typeof localStorage === "undefined") return "";
  const saved = localStorage.getItem(`vox-profile-${netId}`);
  const v = saved ? validateHandle(netId, saved) : null;
  return v?.ok ? v.handle : "";
}
