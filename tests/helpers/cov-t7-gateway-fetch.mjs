/**
 * @file Fetch falso roteado por URL para os testes de cobertura T7 de GraphQL (config de gateways, POST GraphQL e leitura raw).
 * @module tests/helpers/cov-t7-gateway-fetch
 */

/**
 * Cria um `fetch` falso que responde ao `gateways.json`, ao GraphQL e ao raw por rotas declaradas.
 * @param {{ config: object, graphql?: Record<string, (body: object) => object>, raw?: Record<string, (() => object)|object> }} spec
 * Rotas: `graphql[url](body)` devolve `{ status?, text?, json?, headers? }`; `raw[url]` idem.
 * @returns {{ fetch: typeof fetch, calls: string[] }} Função e registro das URLs chamadas, em ordem.
 */
export function createGatewayFetch(spec) {
  const calls = [];
  const reply = (r) => {
    const status = r.status ?? 200;
    const text = r.text ?? JSON.stringify(r.json ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => (r.headers || {})[k.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => JSON.parse(text),
    };
  };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.endsWith("config/gateways.json")) return reply({ json: spec.config });
    if (spec.graphql?.[u]) return reply(spec.graphql[u](JSON.parse(init.body || "{}")));
    const raw = spec.raw?.[u];
    if (raw) return reply(typeof raw === "function" ? raw() : raw);
    throw new Error(`rota não prevista: ${u}`);
  };
  return { fetch: fetchImpl, calls };
}

/**
 * Monta uma aresta GraphQL de transação com tags.
 * @param {string} id Id da transação.
 * @param {Record<string, string>} [tags] Tags por nome.
 * @param {string} [owner] Endereço do dono.
 * @returns {{ node: object, cursor: string }} Aresta no formato do gateway.
 */
export function edge(id, tags = {}, owner = "own1") {
  return {
    cursor: `c-${id}`,
    node: { id, owner: { address: owner }, tags: Object.entries(tags).map(([name, value]) => ({ name, value })) },
  };
}
