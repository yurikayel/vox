/**
 * @file Forma curta de um identificador de conta (`vx_…`, `0x…`, `did:…`), para rótulo e busca.
 *
 * Lógica pura, sem DOM. Mora no domínio, e não em `shared/`, porque conhece a conta oficial.
 *
 * @module short-id
 * @see docs/ARCHITECTURE.md (seção "Camadas")
 */
import { isWelcomeRouteId } from "./vox-welcome-profile.js";

/**
 * Encurta um identificador para exibição. Não serve para comparar contas: prefixos podem coincidir.
 * @param {string} id Identificador completo.
 * @returns {string} `"—"` sem id; `"vox"` na conta oficial; senão o começo do id (8 a 12 caracteres, com `…` no fim se o formato é desconhecido), ou o id inteiro se já for curto.
 * @example shortId("vx_abcdef123456") // "vx_abcdef"
 */
export function shortId(id) {
  if (!id) return "—";
  if (isWelcomeRouteId(id)) return "vox";
  if (id.startsWith("vx_")) return id.length <= 10 ? id : id.slice(0, 9);
  if (id.startsWith("0x")) return id.length <= 10 ? id : id.slice(0, 8);
  if (id.startsWith("did:")) return id.slice(0, 12);
  if (id.length > 14) return id.slice(0, 10) + "…";
  return id;
}
