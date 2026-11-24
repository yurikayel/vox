/**
 * @file Validação de esquema, papéis, canais, cartuchos opcionais e políticas de kits (laboratório).
 * @module labs/parado/kit-genesis-validate
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

/**
 * Valida estrutura, roles, canais, cartuchos opcionais e política de segurança.
 * @param {object} manifest Manifesto do kit.
 * @returns {true}
 * @throws {Error} Quando o esquema viola regras do motor de gênese.
 */
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

/**
 * Valida uma chave e valor individuais da política de segurança.
 * @param {string} key Nome da chave da política.
 * @param {*} val Valor associado.
 * @returns {void}
 * @throws {Error} Quando a chave é desconhecida ou o tipo é inválido.
 */
export function validatePolicyKeyValue(key, val) {
  if (!ALLOWED_POLICY_KEYS.has(key)) {
    throw new Error(`Chave desconhecida na política de segurança: '${key}'`);
  }
  if (key === "minTrustScore") {
    if (!Number.isInteger(val) || val < 0) {
      throw new Error("minTrustScore deve ser um número inteiro maior ou igual a zero");
    }
    return;
  }
  if (typeof val !== "boolean") {
    throw new Error(`Valor para flag de segurança '${key}' deve ser estritamente booleano`);
  }
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
  return (
    permissions.includes("*") ||
    permissions.includes("write:channel:*") ||
    permissions.includes(`write:channel:${channelId}`)
  );
}

function validateChannelRoleIsolation(ch, roles) {
  for (const [roleName, perms] of Object.entries(roles)) {
    if (roleName === ch.writeRole || roleName === "Admin") continue;
    if (hasChannelWritePermission(perms, ch.id)) {
      throw new Error(
        `Papel '${roleName}' não pode ter permissão de escrita no canal '${ch.id}', restrito ao papel '${ch.writeRole}'`
      );
    }
  }
}

function validateKitCartridges(cartridges, channels) {
  if (cartridges === undefined || cartridges === null) return;
  if (!Array.isArray(cartridges)) {
    throw new Error("Campo 'cartridges' no manifesto deve ser um array quando informado");
  }
  const validChannelIds = new Set(channels.map((c) => c.id));
  const seenCartIds = new Set();

  for (const c of cartridges) {
    validateSingleCartridge(c, validChannelIds, seenCartIds);
  }
}

function validateSingleCartridge(c, validChannelIds, seenCartIds) {
  if (!c || typeof c !== "object" || !c.id || !c.channelId || !c.crdtStrategy) {
    throw new Error("Cartucho no manifesto deve conter id, channelId e crdtStrategy");
  }
  if (c.filename !== undefined && c.filename !== null && (typeof c.filename !== "string" || !c.filename.trim())) {
    throw new Error(`filename do cartucho '${c.id}', quando informado, deve ser string não vazia`);
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
