/**
 * @module app/route-parse
 * Parser puro de `location.hash` e query `?h=` / `?labs=` — sem DOM side effects.
 */

function parseSearchHints() {
  if (typeof window === "undefined" || !window.location?.search) return null;
  const q = new URLSearchParams(window.location.search);
  const paramHandle = q.get("h");
  if (paramHandle) return { name: "handle-lookup", slug: paramHandle };
  if (q.get("labs") === "mofn") return { name: "labs-mofn" };
  if (q.get("labs") === "dungeon") return { name: "labs-dungeon" };
  return null;
}

function parseLabsHash(parts) {
  if (parts[0] !== "labs") return null;
  if (parts[1] === "mofn") return { name: "labs-mofn" };
  if (parts[1] === "frames") return { name: "labs-frames" };
  if (parts[1] === "dungeon") return { name: "labs-dungeon" };
  return null;
}

function parseDungeonRoute(parts) {
  if (parts[0] !== "dungeon") return null;
  const sub = (parts[1] || "").toLowerCase();
  const target = parts[2] ? decodeURIComponent(parts[2]) : "";
  if (sub === "entrar") return { name: "dungeon", screen: "mesa", tableId: target, joinP2p: true };
  if (sub === "mesa") return { name: "dungeon", screen: "mesa", tableId: target || "vila-nova" };
  if (sub === "ficha") return { name: "dungeon", screen: "ficha", charId: target || "lyra" };
  if (sub === "mestre") return { name: "dungeon", screen: "mestre", tableId: target || "vila-nova" };
  return { name: "dungeon", screen: "acampamento" };
}

function parseSettingsRoute(parts) {
  if (parts[0] !== "settings") return null;
  if (parts[1] === "linked-accounts") return { name: "linked-accounts" };
  if (parts[1] === "network" && parts[2] === "steward") return { name: "steward-wizard" };
  if (parts[1] === "network" && parts[2] === "guia") return { name: "network-wizard" };
  return { name: "network-settings" };
}

const COMMUNITY_TAB_MAP = {
  listings: "listings",
  classificados: "listings",
  feira: "listings",
  governance: "governance",
  governanca: "governance",
  members: "members",
  membros: "members",
  online: "members",
};

function resolveCommunityTab(subPath, rawQueryTab) {
  const qTab = (rawQueryTab || "").toLowerCase();
  if (COMMUNITY_TAB_MAP[qTab]) return COMMUNITY_TAB_MAP[qTab];
  const sPath = (subPath || "").toLowerCase();
  return COMMUNITY_TAB_MAP[sPath] || "posts";
}

function parseCommunityRoute(parts, query) {
  if (parts[0] !== "c" || !parts[1]) return null;
  if (parts[2] === "avisos") return { name: "community-avisos", communityId: decodeURIComponent(parts[1]) };
  if (parts[2] === "proposal" && parts[3]) {
    return {
      name: "proposal",
      communityId: decodeURIComponent(parts[1]),
      proposalId: decodeURIComponent(parts[3]),
    };
  }
  return {
    name: "community",
    id: decodeURIComponent(parts[1]),
    tab: resolveCommunityTab(parts[2], query.get("tab")),
  };
}

/**
 * Compositores que recebem a comunidade em `?c=`. A chave vazia é `#/compose` sozinho, o endereço que a
 * pessoa adivinha: abre o mesmo compositor do botão central.
 */
const COMPOSE_WITH_COMMUNITY = {
  "": "compose-topic",
  topic: "compose-topic",
  listing: "compose-listing",
  proposal: "compose-proposal",
  aviso: "compose-aviso",
};

function parseComposeRoute(parts, query) {
  if (parts[0] !== "compose") return null;
  const sub = parts[1] || "";
  if (sub === "community") return { name: "compose-community" };
  if (sub === "reply") {
    return { name: "compose-reply", topicId: query.get("t") || "", communityId: query.get("c") || "", parentId: query.get("p") || "" };
  }
  if (!Object.hasOwn(COMPOSE_WITH_COMMUNITY, sub)) return null;
  return { name: COMPOSE_WITH_COMMUNITY[sub], communityId: query.get("c") || "" };
}

function parseUserProfileRoute(rawParam, query) {
  if (rawParam.startsWith("@")) return { name: "handle-lookup", slug: rawParam.slice(1) };
  return { name: "profile", address: rawParam, tab: (query.get("tab") || "posts").toLowerCase() };
}

function parseEntityRoute(parts, query) {
  const [root, param] = parts;
  if (!param) {
    if (root === "dm") return { name: "dm-list" };
    return null;
  }
  const decoded = decodeURIComponent(param);
  if (root === "connect") return { name: "connect", routeId: decoded, invite: query.get("convite") || "" };
  if (root === "pix") return { name: "pix-lookup", query: decoded };
  if (root === "h") return { name: "handle-lookup", slug: decoded };
  if (root === "tag") return { name: "tag-feed", slug: decoded };
  if (root === "dm") return { name: "dm-thread", address: decoded };
  if (root === "t") return { name: "topic", id: decoded, communityId: query.get("c") || "" };
  if (root === "u") return parseUserProfileRoute(decoded, query);
  return null;
}

const STATIC_ROUTES = {
  vote: () => ({ name: "vote" }),
  votacao: () => ({ name: "vote" }),
  communities: () => ({ name: "communities" }),
  perfil: (_parts, query) => ({ name: "perfil", tab: (query.get("tab") || "posts").toLowerCase() }),
  status: () => ({ name: "status" }),
  wallet: (parts) => (parts[1] === "guia" ? { name: "wallet-wizard" } : { name: "wallet" }),
  backup: () => ({ name: "backup-wizard" }),
  frase: () => ({ name: "recovery-phrase" }),
  guardioes: () => ({ name: "guardians" }),
  guardiao: (_parts, query) => ({ name: "guardian-return", query }),
  voltar: () => ({ name: "guardian-recover" }),
  voxpedia: () => ({ name: "voxpedia" }),
  download: () => ({ name: "download" }),
  downloads: () => ({ name: "download" }),
  revolucao: () => ({ name: "revolucao" }),
  "revolução": () => ({ name: "revolucao" }),
};

function parseStaticRoute(parts, query) {
  const root = parts[0];
  if (STATIC_ROUTES[root]) return STATIC_ROUTES[root](parts, query);
  if (root === "people" || root === "pessoas") {
    return { name: "people", query: query.get("q") || "" };
  }
  if (root === "sync") {
    return {
      name: "sync",
      // PM-92: a senha não é mais lida do link; `p` só marca um link antigo, para avisar.
      legacyPassphrase: Boolean(query.get("p") || parts[1]),
      bundle: query.get("b") || "",
    };
  }
  if (root === "ajuda") {
    if (parts[1] === "voxpedia") return { name: "voxpedia" };
    if (parts[1] === "teste") return { name: "ajuda-teste" };
  }
  return null;
}

/**
 * Atalho `#/@arroba` para o perfil de um handle (o formato que as pessoas digitam).
 * @param {string[]} parts Partes do caminho do hash.
 * @returns {{name: string, slug: string} | null} Rota de busca por handle, ou `null`.
 */
function parseHandleShortcut(parts) {
  if (parts.length !== 1 || !parts[0].startsWith("@") || parts[0].length < 2) return null;
  return { name: "handle-lookup", slug: decodeURIComponent(parts[0].slice(1)) };
}

/**
 * Interpreta `location.hash` e query `?h=` / `?labs=` em objeto de rota nomeado.
 *
 * @returns {object} Descritor com `name` e campos específicos da rota.
 */
export function parseRoute() {
  const fromSearch = parseSearchHints();
  if (fromSearch) return fromSearch;

  const hash = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = hash.split("?");
  const parts = pathPart ? pathPart.split("/").filter(Boolean) : [];
  const query = new URLSearchParams(queryPart || "");

  if (!parts.length) return { name: "home", feed: (query.get("feed") || "for-you").toLowerCase() };

  return (
    parseStaticRoute(parts, query) ||
    parseDungeonRoute(parts) ||
    parseSettingsRoute(parts) ||
    parseEntityRoute(parts, query) ||
    parseCommunityRoute(parts, query) ||
    parseLabsHash(parts) ||
    parseComposeRoute(parts, query) ||
    parseHandleShortcut(parts) ||
    { name: "not-found" }
  );
}

const TITLE_SUFFIX = "Vox";

const ROUTE_TITLES = {
  home: "Ágora",
  vote: "Votação",
  "tag-feed": "Etiqueta",
  communities: "Comunidades",
  people: "Pessoas",
  connect: "Conectar",
  perfil: "Meu perfil",
  profile: "Perfil",
  "pix-lookup": "Buscar Pix",
  "network-settings": "Rede",
  "linked-accounts": "Redes vinculadas",
  "steward-wizard": "Guardião da rede",
  "network-wizard": "Guia da rede",
  "handle-lookup": "Buscar arroba",
  "dm-list": "Mensagens",
  "dm-thread": "Conversa",
  voxpedia: "Voxpedia",
  "ajuda-teste": "Teste aberto",
  status: "Saúde do nó",
  "labs-frames": "Laboratório",
  "labs-mofn": "Laboratório",
  "labs-dungeon": "Laboratório",
  dungeon: "Dungeon",
  community: "Comunidade",
  "community-avisos": "Avisos",
  "compose-aviso": "Novo aviso",
  proposal: "Proposta",
  topic: "Conversa",
  wallet: "Carteira",
  "wallet-wizard": "Guia da carteira",
  "backup-wizard": "Guia do backup",
  "recovery-phrase": "Frase de recuperação",
  guardians: "Guardiões",
  "guardian-return": "Guardião",
  "guardian-recover": "Recuperar conta",
  "compose-community": "Nova comunidade",
  "compose-listing": "Novo classificado",
  "compose-proposal": "Nova proposta",
  "compose-topic": "Nova conversa",
  "compose-reply": "Responder",
  sync: "Sincronizar",
  "not-found": "Página não encontrada",
};

/**
 * Título do documento para uma rota, no formato "Tela · Vox".
 *
 * @param {{name?: string}} route Descritor de {@link parseRoute}.
 * @returns {string} Título; rota desconhecida cai em "Ágora · Vox".
 */
export function routeTitle(route) {
  const screen = ROUTE_TITLES[route?.name] || ROUTE_TITLES.home;
  return `${screen} · ${TITLE_SUFFIX}`;
}

