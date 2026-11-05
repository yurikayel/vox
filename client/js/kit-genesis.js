/**
 * kit-genesis.js — Manifestos Declarativos e Motor de Gênese de Comunidades (Vox)
 *
 * Implementa:
 * 1. 3 arquétipos de comunidade soberana congelados (Kit Bairro, Sindicato, Coletivo);
 * 2. Validação estrita de esquema (roles convergentes, canais, cartuchos .xdc, securityPolicy);
 * 3. Motor de gênese para instanciar comunidades cívicas com canais e cartuchos pré-configurados;
 * 4. Zero dependências externas e 100% de integridade declarativa.
 */

function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  for (const prop of Object.getOwnPropertyNames(obj)) {
    const val = obj[prop];
    if (val !== null && (typeof val === "object" || typeof val === "function")) {
      deepFreeze(val);
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
    VerifiedPeer: ["read:channel:*", "write:channel:avisos-comunitarios"],
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
  description: "Deliberação coletiva, assembleias soberanas com voto assinado PAdES/gov.br e prestação de contas.",
  roles: {
    Admin: ["*"],
    Delegate: ["create:poll", "close:poll", "write:channel:*", "read:channel:*"],
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
      description: "Urna cívica para deliberações com fé pública",
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
    Member: ["reserve:item", "write:channel:leituras-e-debates", "read:channel:*"],
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
  validateKitChannels(manifest.channels);
  validateKitCartridges(manifest.cartridges);
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

function validateKitChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("Manifesto deve conter uma lista não vazia de canais");
  }
  for (const ch of channels) {
    if (!ch.id || !ch.title || typeof ch.writeRole !== "string") {
      throw new Error("Canal no manifesto deve conter id, title e writeRole");
    }
  }
}

function validateKitCartridges(cartridges) {
  if (!Array.isArray(cartridges)) {
    throw new Error("Manifesto deve conter lista de cartuchos (array)");
  }
  for (const c of cartridges) {
    if (!c.id || !c.filename || !c.channelId || !c.crdtStrategy) {
      throw new Error("Cartucho no manifesto deve conter id, filename, channelId e crdtStrategy");
    }
  }
}

function validateKitSecurityPolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Manifesto deve definir um objeto securityPolicy");
  }
}

export function instantiateCommunityFromKit(kitId, communityMeta = {}) {
  const manifest = getKitManifest(kitId);
  if (!manifest) {
    throw new Error(`Kit com id '${kitId}' não encontrado no registro`);
  }
  validateKitManifest(manifest);

  const communityId = buildCommunityId(manifest.id, communityMeta.id);
  const payload = buildCommunityPayload(manifest, communityId, communityMeta);
  return deepFreeze(payload);
}

function buildCommunityPayload(manifest, communityId, meta) {
  const creatorAddr = String(meta.creatorAddr || "").trim();
  return {
    communityId,
    kitId: manifest.id,
    kitVersion: manifest.version,
    name: String(meta.name || manifest.title).trim(),
    description: String(meta.description || manifest.description).trim(),
    createdAt: Date.now(),
    creatorAddr,
    roles: { ...manifest.roles },
    memberRoles: creatorAddr ? { [creatorAddr]: ["Admin"] } : {},
    channels: manifest.channels.map((ch) => ({ ...ch, communityId })),
    cartridges: manifest.cartridges.map((cart) => ({ ...cart, communityId })),
    securityPolicy: {
      ...manifest.securityPolicy,
      ...(meta.securityPolicyOverrides || {}),
    },
  };
}

function buildCommunityId(kitId, customId) {
  if (customId && typeof customId === "string" && customId.trim()) {
    return customId.trim();
  }
  const cleanPrefix = kitId.replace(/^kit-/, "");
  return `comm_${cleanPrefix}_${Date.now()}`;
}
