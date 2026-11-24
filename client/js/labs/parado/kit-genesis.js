/**
 * @file Fachada pública e instanciação validada de kits de comunidade (laboratório).
 * @module labs/parado/kit-genesis
 */

import {
  deepFreeze,
  KIT_BAIRRO,
  KIT_SINDICATO,
  KIT_COLETIVO,
  listAvailableKits,
  getKitManifest,
} from "./kit-genesis-data.js";
import { validateKitManifest, validatePolicyKeyValue } from "./kit-genesis-validate.js";

export {
  deepFreeze,
  KIT_BAIRRO,
  KIT_SINDICATO,
  KIT_COLETIVO,
  listAvailableKits,
  getKitManifest,
  validateKitManifest,
};

/**
 * Instancia estrutura de comunidade a partir de kit validado e metadados do criador.
 * Cartuchos Webxdc são opcionais e desativados por padrão (`includeCartridges: false`).
 * @param {string} kitId Id do kit registrado.
 * @param {object} [communityMeta={}] `creatorAddr`, `id` opcional, `includeCartridges`, overrides de policy.
 * @returns {object} Payload de comunidade pronto para persistência.
 * @throws {Error} Kit inexistente ou validação falha.
 */
export function instantiateCommunityFromKit(kitId, communityMeta = {}) {
  const manifest = getKitManifest(kitId);
  if (!manifest) {
    throw new Error(`Kit com id '${kitId}' não encontrado no registro`);
  }
  validateKitManifest(manifest);

  const creatorAddr = validateCreatorAddr(communityMeta.creatorAddr);
  const communityId = resolveCommunityId(manifest.id, communityMeta.id);
  const securityPolicy = applyPolicyOverrides(manifest.securityPolicy, communityMeta.securityPolicyOverrides);

  const payload = buildCommunityPayload({
    manifest,
    communityId,
    creatorAddr,
    meta: communityMeta,
    securityPolicy,
  });
  return deepFreeze(payload);
}

/**
 * Valida e normaliza o endereço do criador da comunidade.
 *
 * @param {string} addr Endereço `vx_…`.
 * @returns {string} Endereço sem espaços nas pontas.
 * @throws {Error} Se vazio, sem prefixo `vx_` ou com menos de 8 caracteres.
 */
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

/**
 * Usa o ID informado (validado) ou gera um ID novo com entropia criptográfica.
 *
 * @param {string} kitId ID do kit.
 * @param {string|null|undefined} customId ID escolhido pelo criador.
 * @returns {string} ID da comunidade.
 * @throws {Error} Se o ID informado for inválido.
 */
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

/**
 * Gera 128 bits de entropia em hexadecimal via CSPRNG.
 *
 * @returns {string} Texto hexadecimal.
 * @throws {Error} Se o ambiente não tiver CSPRNG.
 */
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

/**
 * Aplica sobreposições à política-base, recusando qualquer rebaixamento de segurança.
 *
 * @param {object} basePolicy Política do kit.
 * @param {object|undefined} overrides Valores pedidos pelo criador.
 * @returns {object} Política resultante.
 * @throws {Error} Se alguma sobreposição rebaixar a proteção.
 */
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

/**
 * Garante que a sobreposição não afrouxa a política-base.
 *
 * @param {string} key Nome da chave da política.
 * @param {*} baseVal Valor do kit.
 * @param {*} overrideVal Valor pedido.
 * @returns {void}
 * @throws {Error} Em caso de rebaixamento.
 */
function validateNoDowngrade(key, baseVal, overrideVal) {
  if (key === "allowGuestRead") {
    if (baseVal === false && overrideVal === true) {
      throw new Error("Não é permitido abrir leitura pública em comunidade com restrição de acesso a convidados");
    }
    return;
  }
  if (baseVal === true && overrideVal === false) {
    throw new Error(`Não é permitido desativar proteção obrigatória de segurança: '${key}'`);
  }
  if (key === "minTrustScore" && overrideVal < baseVal) {
    throw new Error(`Não é permitido reduzir o score mínimo de segurança (mínimo exigido: ${baseVal})`);
  }
}

/**
 * Monta a carga inicial da comunidade a partir do manifesto do kit.
 *
 * @param {object} params Dados já validados da instanciação.
 * @param {object} params.manifest Manifesto do kit.
 * @param {string} params.communityId ID da comunidade.
 * @param {string} params.creatorAddr Endereço do criador, que vira Admin.
 * @param {object} params.meta Nome, descrição e flags opcionais (`includeCartridges`).
 * @param {object} params.securityPolicy Política de segurança final.
 * @returns {object} Carga da comunidade.
 */
function buildCommunityPayload({ manifest, communityId, creatorAddr, meta, securityPolicy }) {
  const sourceCartridges =
    meta.includeCartridges === true && Array.isArray(manifest.cartridges) ? manifest.cartridges : [];
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
    cartridges: sourceCartridges.map((cart) => ({ ...cart, communityId })),
    securityPolicy,
  };
}
