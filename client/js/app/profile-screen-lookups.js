/**
 * @file Telas de consulta e resolução de rotas (busca de handle e consulta Pix).
 * @module app/profile-screen-lookups
 */

import * as gql from "../graphql.js";
import * as render from "../render.js";
import * as mock from "../mock.js";
import * as handles from "../handles.js";
import * as localAccount from "../identity/index.js";
import * as pixKeyHelper from "../pix-key.js";
import { getActiveUser, makeShellProps } from "./context.js";

/**
 * Mostra o resultado da busca por handle ou volta para a Ágora quando é um `vox-` sem dono.
 *
 * @param {HTMLElement} main Raiz da tela.
 * @param {string} slug Handle buscado.
 * @param {object|null} result Resultado da busca.
 */
function renderHandleLookupResult(main, slug, result) {
  if (!result || !result.primaryOwner) {
    if (/^vox-[a-z0-9]+$/i.test(slug)) {
      location.hash = "#/";
      return;
    }
    main.innerHTML = "";
    render.renderProfileGridNotFound(main, {
      handle: slug,
      bodyHtml: `<div class="empty"><p>Nenhum endereço encontrado para o perfil <code>@${render.escapeHtml(slug)}</code>.</p></div>`,
      actionsHtml: `<a class="btn btn-outline" href="#/">Voltar ao início</a>`,
    });
    return;
  }
  if (result.isConflict) {
    main.innerHTML = "";
    render.renderHandleConflict(main, slug, result.claimants);
    return;
  }
  location.hash = `#/u/${encodeURIComponent(result.primaryOwner)}`;
}

/**
 * Busca perfil por handle e redireciona ou renderiza erro/conflito.
 *
 * @param {unknown} rawSlug Slug ou handle a ser consultado.
 * @returns {Promise<void>}
 */
export async function showHandleLookup(rawSlug) {
  const user = await getActiveUser();
  const slug = handles.normalizeSlug(rawSlug);
  const main = render.renderShell(makeShellProps(user, "profile", `@${slug || "handle"}`));
  render.renderLoading(main, `Buscando perfil de @${slug}…`);

  const validation = handles.validateSlug(slug);
  if (!validation.valid) {
    main.innerHTML = "";
    render.renderError(main, `Handle inválido: ${validation.error}`);
    return;
  }

  const result = await gql.fetchHandle(slug);
  renderHandleLookupResult(main, slug, result);
}

/**
 * Procura o perfil dono de uma chave Pix, começando pela própria conta.
 *
 * @param {string} cleanQuery Chave buscada.
 * @param {string} myPix Chave Pix da própria conta.
 * @param {string} myRouteId Rota da própria conta.
 * @returns {object|null}
 */
function resolveProfileByPixKey(cleanQuery, myPix, myRouteId) {
  if (myPix && (myPix.toLowerCase() === cleanQuery.toLowerCase() || pixKeyHelper.normalizePixKey(cleanQuery).normalized === myPix)) {
    return {
      routeId: myRouteId,
      name: localAccount.getDisplayName() || "Você",
      handle: "",
      pixKey: myPix,
      pixKeyMasked: pixKeyHelper.maskForDisplay(myPix),
    };
  }
  const mockFound = mock.findMockByPixKey(cleanQuery);
  if (mockFound) {
    return {
      routeId: mockFound.routeId,
      name: mockFound.name,
      handle: mockFound.handle,
      pixKey: mockFound.pixKey,
      pixKeyMasked: pixKeyHelper.maskForDisplay(mockFound.pixKey),
    };
  }
  return null;
}

/**
 * Consulta perfil vinculado a uma chave Pix informada.
 *
 * @param {unknown} query Chave Pix a ser pesquisada.
 * @returns {Promise<void>}
 */
export async function showPixLookup(query) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "profile", "Consulta Pix"));
  render.renderLoading(main);

  const cleanQuery = String(query || "").trim();
  const myPix = pixKeyHelper.storedPixValue(localAccount.getPixKey());
  const myRouteId = await localAccount.getRouteId();
  const foundProfile = resolveProfileByPixKey(cleanQuery, myPix, myRouteId);

  main.innerHTML = "";
  render.renderPixLookup(main, query, foundProfile);
}
