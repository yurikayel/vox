/**
 * PM-11 — carregador único da biblioteca arweave, vendorizada em client/vendor/.
 * O bundle é autocontido e fixado por hash (docs/DEPENDENCIAS.md, tests/arweave-vendor.test.js);
 * a CSP não libera nenhum CDN para ele. Só é baixado ao publicar no Arweave ou consultar saldo.
 */
export const ARWEAVE_BUNDLE_URL = "../vendor/arweave-1.15.7.bundle.js";

/** Instância apontando para arweave.net com o timeout pedido (ms). */
export async function loadArweave(timeout) {
  const module = await import(ARWEAVE_BUNDLE_URL);
  const Arweave = module.default || module;
  return Arweave.init({ host: "arweave.net", port: 443, protocol: "https", timeout });
}
