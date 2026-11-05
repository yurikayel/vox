/**
 * kit-genesis.js — Manifestos Declarativos e Motor de Gênese de Comunidades (Vox)
 *
 * Implementa:
 * 1. 3 arquétipos de comunidade soberana congelados (Kit Bairro, Sindicato, Coletivo);
 * 2. Validação estrita de esquema e isolamento generalizado de canais;
 * 3. Regra anti-rebaixamento estrita e tipada (no-downgrade) em securityPolicyOverrides;
 * 4. Validação estrita de creatorAddr e IDs com CSPRNG livre de colisões.
 */

const ALLOWED_POLICY_KEYS = new Set([
  "requirePresenceQr",
  "allowGuestRead",
  "minTrustScore",
  "requirePadesGovBrOnVote",
  "requireWorkerRegistration",
  "requireHashVerifiedPin",
]);

const ALLOWED_CRDT_STRATEGIES = new Set(["id-lookup", "audit-log"]);

export function deepFreeze(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") return obj;
  if (seen.has(obj)) return obj;
  seen.add(obj);

  for (const prop of Object.getOwnPropertyNames(obj)) {
    const val = obj[prop];
    if (val !== null && (typeof val === "object" || typeof val === "function")) {
      deepFreeze(val, seen);
    }
  }
  return Object.freeze(obj);
}

export const KIT_BAIRRO = deepFreeze({
  id: "kit-bairro",
  version: "1.0.0",
  title: "Comunidade de Bairro & Comércio Hiperlocal",
  description: "Organização comunitária local, zeladoria urbana, feira livre e entregas sem comissão.",
  roles: {
    Admin: ["*"],
    Merchant: ["write:channel:feira-livre-do-bairro", "send:xdc:feira-pix", "read:channel:*"],
    Resident: ["write:channel:zeladoria-e-obras", "read:channel:*"],
    VerifiedPeer: ["read:channel:*", "write:channel:mural-entregas"],
  },
  channels: [
    {
      id: "zeladoria-e-obras",
      title: "Zeladoria e Obras",
      description: "Demandas de infraestrutura, buracos e iluminação pública",
      writeRole: "Resident",
    },
    {
      id: "feira-livre-do-bairro",
      title: "Feira Livre & Comércio",
      description: "Cardápios, produtos locais e pagamentos Pix sem taxa",
      writeRole: "Merchant",
    },
    {
      id: "mural-entregas",
      title: "Mural de Entregas & Serviços",
      description: "Corridas e entregas diretas entre vizinhos sem plataforma",
      writeRole: "VerifiedPeer",
    },
    {
      id: "avisos-comunitarios",
      title: "Avisos da Comunidade",
      description: "Comunicados gerais e reuniões presenciais",
      writeRole: "Admin",
    },
  ],
  cartridges: [
    {
      id: "feira-pix",
      filename: "feira-pix.xdc",
      channelId: "feira-livre-do-bairro",
      crdtStrategy: "id-lookup",
      epochThreshold: 50,
    },
    {
      id: "mural-entregas",
      filename: "mural-entregas.xdc",
      channelId: "mural-entregas",
      crdtStrategy: "id-lookup",
      epochThreshold: 50,
    },
  ],
  securityPolicy: {
    requirePresenceQr: true,
    allowGuestRead: true,
    minTrustScore: 1,
  },
});

export const KIT_SINDICATO = deepFreeze({
  id: "kit-sindicato",
  version: "1.0.0",
  title: "Sindicato & Associação de Trabalhadores",
  description: "Deliberação coletiva, assembleias sindicais, preparação para urna eletrônica e prestação de contas.",
  roles: {
    Admin: ["*"],
    Delegate: [
      "create:poll",
      "close:poll",
      "write:channel:votacoes-e-editais",
      "read:channel:*",
    ],
    VerifiedWorker: ["vote:xdc:urna-pades-govbr", "read:channel:*", "write:channel:assembleia-permanente"],
    Auditor: ["audit:signatures", "read:channel:*"],
  },
  channels: [
    {
      id: "assembleia-permanente",
      title: "Assembleia Permanente",
      description: "Pautas de negociação coletiva e consultas de base",
      writeRole: "VerifiedWorker",
    },
    {
      id: "votacoes-e-editais",
      title: "Votações e Editais Oficiais",
      description: "Urna e editais para consultas e deliberações estatutárias",
      writeRole: "Delegate",
    },
    {
      id: "prestacao-de-contas",
      title: "Prestação de Contas & Fundo",
      description: "Transparência financeira e relatórios contábeis",
      writeRole: "Admin",
    },
  ],
  cartridges: [
    {
      id: "urna-pades-govbr",
      filename: "urna-pades-govbr.xdc",
      channelId: "votacoes-e-editais",
      crdtStrategy: "audit-log",
      epochThreshold: 20,
    },
    {
      id: "ata-automerge",
      filename: "ata-automerge.xdc",
      channelId: "assembleia-permanente",
      crdtStrategy: "id-lookup",
      epochThreshold: 50,
    },
  ],
  securityPolicy: {
    requirePadesGovBrOnVote: true,
    requireWorkerRegistration: true,
    allowGuestRead: false,
  },
});

export const KIT_COLETIVO = deepFreeze({
  id: "kit-coletivo",
  version: "1.0.0",
  title: "Coletivo Cultural & Biblioteca Aberta",
  description: "Acervo compartilhado de livros/mídias, eventos culturais e redação colaborativa descentralizada.",
  roles: {
    Admin: ["*"],
    Curator: ["manage:catalog", "write:channel:acervo-livros", "read:channel:*"],
    Member: [
      "reserve:item",
      "write:channel:leituras-e-debates",
      "write:channel:agenda-cultural",
      "read:channel:*",
    ],
  },
  channels: [
    {
      id: "acervo-livros",
      title: "Biblioteca de Bolso",
      description: "Catálogo comunitário de empréstimos e doações de livros",
      writeRole: "Curator",
    },
    {
      id: "leituras-e-debates",
      title: "Clube de Leituras & Debates",
      description: "Discussões sobre textos, ensaios e oficinas",
      writeRole: "Member",
    },
    {
      id: "agenda-cultural",
      title: "Agenda Cultural & Saraus",
      description: "Encontros presenciais e programação livre",
      writeRole: "Member",
    },
  ],
  cartridges: [
    {
      id: "biblioteca-bolso",
      filename: "biblioteca-bolso.xdc",
      channelId: "acervo-livros",
      crdtStrategy: "id-lookup",
      epochThreshold: 50,
    },
    {
      id: "caderno-coletivo",
      filename: "caderno-coletivo.xdc",
      channelId: "leituras-e-debates",
      crdtStrategy: "id-lookup",
      epochThreshold: 30,
    },
  ],
  securityPolicy: {
    requireHashVerifiedPin: true,
    allowGuestRead: true,
    minTrustScore: 0,
  },
});

const KITS_MAP = new Map([
  [KIT_BAIRRO.id, KIT_BAIRRO],
  [KIT_SINDICATO.id, KIT_SINDICATO],
  [KIT_COLETIVO.id, KIT_COLETIVO],
]);

export function listAvailableKits() {
  return [KIT_BAIRRO, KIT_SINDICATO, KIT_COLETIVO];
}

export function getKitManifest(kitId) {
  if (typeof kitId !== "string") return null;
  return KITS_MAP.get(kitId.trim()) || null;
}

export function validateKitManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifesto do kit deve ser um objeto válido");
  }
  validateKitMeta(manifest);
  validateKitRoles(manifest.roles);
  validateKitChannels(manifest.channels, manifest.roles);
  validateKitCartridges(manifest.cartridges, manifest.channels);
  validateKitSecurityPolicy(manifest.securityPolicy);
  return true;
}

function validateKitMeta(manifest) {
  if (typeof manifest.id !== "string" || !manifest.id.trim()) {
    throw new Error("Manifesto deve conter campo 'id' como string não vazia");
  }
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error("Manifesto deve conter campo 'version' como string");
  }
  if (typeof manifest.title !== "string" || !manifest.title.trim()) {
    throw new Error("Manifesto deve conter campo 'title'");
  }
}

function validateKitRoles(roles) {
  if (!roles || typeof roles !== "object" || Object.keys(roles).length === 0) {
    throw new Error("Manifesto deve definir ao menos uma role com lista de permissões");
  }
  for (const [roleName, perms] of Object.entries(roles)) {
    if (!Array.isArray(perms) || perms.length === 0) {
      throw new Error(`Role '${roleName}' deve conter um array não vazio de permissões`);
    }
  }
}

function validateKitChannels(channels, roles) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("Manifesto deve conter uma lista não vazia de canais");
  }
  const seenIds = new Set();
  for (const ch of channels) {
    validateSingleChannel(ch, roles, seenIds);
  }
}

function validateSingleChannel(ch, roles, seenIds) {
  if (!ch.id || !ch.title || typeof ch.writeRole !== "string") {
    throw new Error("Canal no manifesto deve conter id, title e writeRole");
  }
  if (seenIds.has(ch.id)) {
    throw new Error(`ID de canal duplicado no manifesto: '${ch.id}'`);
  }
  seenIds.add(ch.id);

  if (!Object.prototype.hasOwnProperty.call(roles, ch.writeRole)) {
    throw new Error(`writeRole '${ch.writeRole}' do canal '${ch.id}' não existe no mapa de roles`);
  }
  if (!hasChannelWritePermission(roles[ch.writeRole], ch.id)) {
    throw new Error(`writeRole '${ch.writeRole}' não possui permissão de escrita para o canal '${ch.id}'`);
  }
  validateChannelRoleIsolation(ch, roles);
}

function hasChannelWritePermission(permissions, channelId) {
  if (!Array.isArray(permissions)) return false;
  return permissions.includes("*") || permissions.includes("write:channel:*") || permissions.includes(`write:channel:${channelId}`);
}

function validateChannelRoleIsolation(ch, roles) {
  for (const [roleName, perms] of Object.entries(roles)) {
    if (roleName === ch.writeRole || roleName === "Admin") continue;
    if (perms.includes("*") || perms.includes("write:channel:*") || perms.includes(`write:channel:${ch.id}`)) {
      throw new Error(`Papel '${roleName}' não pode ter permissão de escrita no canal '${ch.id}', restrito ao papel '${ch.writeRole}'`);
    }
  }
}

function validateKitCartridges(cartridges, channels) {
  if (!Array.isArray(cartridges)) {
    throw new Error("Manifesto deve conter lista de cartuchos (array)");
  }
  const validChannelIds = new Set(channels.map((c) => c.id));
  const seenCartIds = new Set();

  for (const c of cartridges) {
    validateSingleCartridge(c, validChannelIds, seenCartIds);
  }
}

function validateSingleCartridge(c, validChannelIds, seenCartIds) {
  if (!c.id || !c.filename || !c.channelId || !c.crdtStrategy) {
    throw new Error("Cartucho no manifesto deve conter id, filename, channelId e crdtStrategy");
  }
  if (seenCartIds.has(c.id)) {
    throw new Error(`ID de cartucho duplicado no manifesto: '${c.id}'`);
  }
  seenCartIds.add(c.id);

  if (!validChannelIds.has(c.channelId)) {
    throw new Error(`channelId '${c.channelId}' do cartucho '${c.id}' não existe na lista de canais`);
  }
  if (!ALLOWED_CRDT_STRATEGIES.has(c.crdtStrategy)) {
    throw new Error(`Estratégia CRDT inválida no cartucho '${c.id}': '${c.crdtStrategy}'`);
  }
  const threshold = Number(c.epochThreshold);
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error(`epochThreshold do cartucho '${c.id}' deve ser um inteiro positivo`);
  }
}

function validateKitSecurityPolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Manifesto deve definir um objeto securityPolicy");
  }
  for (const [key, val] of Object.entries(policy)) {
    validatePolicyKeyValue(key, val);
  }
}

function validatePolicyKeyValue(key, val) {
  if (!ALLOWED_POLICY_KEYS.has(key)) {
    throw new Error(`Chave desconhecida na política de segurança: '${key}'`);
  }
  if (key === "minTrustScore") {
    if (!Number.isInteger(val) || val < 0) {
      throw new Error(`minTrustScore deve ser um número inteiro maior ou igual a zero`);
    }
  } else if (typeof val !== "boolean") {
    throw new Error(`Valor para flag de segurança '${key}' deve ser estritamente booleano`);
  }
}

export function instantiateCommunityFromKit(kitId, communityMeta = {}) {
  const manifest = getKitManifest(kitId);
  if (!manifest) {
    throw new Error(`Kit com id '${kitId}' não encontrado no registro`);
  }
  validateKitManifest(manifest);

  const creatorAddr = validateCreatorAddr(communityMeta.creatorAddr);
  const communityId = resolveCommunityId(manifest.id, communityMeta.id);
  const securityPolicy = applyPolicyOverrides(manifest.securityPolicy, communityMeta.securityPolicyOverrides);

  const payload = buildCommunityPayload(manifest, communityId, creatorAddr, communityMeta, securityPolicy);
  return deepFreeze(payload);
}

function validateCreatorAddr(addr) {
  const clean = String(addr || "").trim();
  if (!clean) {
    throw new Error("creatorAddr é obrigatório para instanciar a comunidade");
  }
  if (!clean.startsWith("vx_") || clean.length < 8) {
    throw new Error("creatorAddr deve possuir identificador válido com prefixo 'vx_' e ao menos 8 caracteres");
  }
  return clean;
}

function resolveCommunityId(kitId, customId) {
  if (customId !== undefined && customId !== null) {
    const clean = String(customId).trim();
    if (!/^[a-z0-9_-]{3,64}$/i.test(clean)) {
      throw new Error("ID de comunidade inválido (deve conter 3 a 64 caracteres alfanuméricos, '-' ou '_')");
    }
    return clean;
  }
  const cleanPrefix = kitId.replace(/^kit-/, "");
  const randomSuffix = generateCryptoEntropy();
  return `comm_${cleanPrefix}_${Date.now().toString(36)}_${randomSuffix}`;
}

function generateCryptoEntropy() {
  if (typeof crypto !== "undefined") {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
    if (typeof crypto.getRandomValues === "function") {
      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  }
  throw new Error("Módulo criptográfico CSPRNG não disponível no ambiente para geração de identificador");
}

function applyPolicyOverrides(basePolicy, overrides) {
  if (!overrides || typeof overrides !== "object") {
    return { ...basePolicy };
  }
  for (const [key, val] of Object.entries(overrides)) {
    validatePolicyKeyValue(key, val);
    validateNoDowngrade(key, basePolicy[key], val);
  }
  return { ...basePolicy, ...overrides };
}

function validateNoDowngrade(key, baseVal, overrideVal) {
  // Para allowGuestRead: false é a política mais restrita; mudar para true é rebaixamento!
  if (key === "allowGuestRead") {
    if (baseVal === false && overrideVal === true) {
      throw new Error("Não é permitido abrir leitura pública em comunidade com restrição de acesso a convidados");
    }
    return;
  }
  // Para outras flags booleanas: true é a proteção ativa; mudar para false é rebaixamento!
  if (baseVal === true && overrideVal === false) {
    throw new Error(`Não é permitido desativar proteção obrigatória de segurança: '${key}'`);
  }
  // Para minTrustScore: só pode aumentar o rigor, nunca diminuir
  if (key === "minTrustScore" && overrideVal < baseVal) {
    throw new Error(`Não é permitido reduzir o score mínimo de segurança (mínimo exigido: ${baseVal})`);
  }
}

function buildCommunityPayload(manifest, communityId, creatorAddr, meta, securityPolicy) {
  return {
    communityId,
    kitId: manifest.id,
    kitVersion: manifest.version,
    name: String(meta.name || manifest.title).trim(),
    description: String(meta.description || manifest.description).trim(),
    createdAt: Date.now(),
    creatorAddr,
    roles: { ...manifest.roles },
    memberRoles: { [creatorAddr]: ["Admin"] },
    channels: manifest.channels.map((ch) => ({ ...ch, communityId })),
    cartridges: manifest.cartridges.map((cart) => ({ ...cart, communityId })),
    securityPolicy,
  };
}
