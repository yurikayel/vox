/**
 * @file Manifestos congelados dos kits de comunidade (laboratório).
 * @module labs/parado/kit-genesis-data
 */

/**
 * Congela recursivamente objetos para manifestos imutáveis.
 * @param {object|null|undefined} obj Raiz a congelar.
 * @param {WeakSet<object>} [seen=new WeakSet()] Controle de ciclos.
 * @returns {object|null|undefined} O mesmo objeto, congelado.
 */
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

/**
 * Kit manifesto: comunidade de bairro e comércio local.
 * @type {object}
 */
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

/**
 * Kit manifesto: sindicato e associação de trabalhadores.
 * @type {object}
 */
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

/**
 * Kit manifesto: coletivo cultural ou de base.
 * @type {object}
 */
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

/**
 * Lista os três kits congelados disponíveis.
 * @returns {object[]}
 */
export function listAvailableKits() {
  return [KIT_BAIRRO, KIT_SINDICATO, KIT_COLETIVO];
}

/**
 * Busca manifesto por id de kit.
 * @param {string} kitId Identificador do kit.
 * @returns {object|null}
 */
export function getKitManifest(kitId) {
  if (typeof kitId !== "string") return null;
  return KITS_MAP.get(kitId.trim()) || null;
}
