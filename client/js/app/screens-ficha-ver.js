/**
 * @file Rota `#/ficha/ver#voxchar=…`: mostra, só para leitura, uma ficha recebida por link (docs/specs/voxchar-v0.md §9).
 * O dado é de outra pessoa: passa pelo mesmo `checkVoxchar`, é escapado na tela e nada é gravado ao abrir.
 * Só "Usar como modelo" cria uma ficha (com id novo), a pedido da pessoa. Carregado por `import()`.
 *
 * @module app/screens-ficha-ver
 */
import * as render from "../render.js";
import { escapeHtml } from "../shared/html.js";
import { getActiveUser, makeShellProps } from "./context.js";

const esc = (v) => escapeHtml(String(v ?? ""));

function abilitiesHtml(abilities = {}) {
  const rows = Object.entries(abilities).map(([k, v]) => `<li><strong>${esc(k)}</strong> ${esc(v)}</li>`).join("");
  return rows ? `<ul class="ficha-ver-abilities">${rows}</ul>` : "";
}

function itemsHtml(inventory = {}) {
  const rows = Object.values(inventory).map((i) => `<li>${esc(i.label)}${i.qty > 1 ? ` ×${esc(i.qty)}` : ""}</li>`).join("");
  return rows ? `<h3>Itens</h3><ul>${rows}</ul>` : "";
}

/**
 * HTML da ficha só de leitura (texto sempre escapado; nenhum campo vira marcação).
 * @param {object} doc Documento `.voxchar` já validado por `checkVoxchar`.
 * @returns {string} HTML da visualização, com os botões "Usar como modelo" e "Baixar .voxchar".
 */
export function renderFichaView(doc) {
  const a = doc.sheet?.attributes_lww || {};
  const notes = doc.sheet?.sheet_meta?.notes_public;
  return `
    <section class="card guided-card" data-ficha-ver>
      <h2>${esc(a.name)}</h2>
      <p class="compose-step-lead" role="note">Esta ficha veio de um link e ninguém a conferiu. Você só está vendo; nada foi salvo.</p>
      <p>${esc(a.class_name)} ${esc(a.ancestry)} · nível ${esc(a.level)} · CA ${esc(a.armor_class)} · Deslocamento ${esc(a.speed_ft)} pés</p>
      ${abilitiesHtml(a.abilities)}
      ${itemsHtml(doc.sheet?.inventory_orset)}
      ${notes ? `<h3>Notas públicas</h3><p>${esc(notes)}</p>` : ""}
      <button type="button" class="btn btn-primary" data-ficha="use-template">Usar como modelo</button>
      <button type="button" class="btn" data-ficha="download">Baixar .voxchar</button>
      <p id="ficha-ver-status" role="alert"></p>
    </section>`;
}

/**
 * HTML do erro de um link recusado.
 * @param {string[]} issues Motivos em português.
 * @returns {string} Cartão com os motivos em `role="alert"`.
 */
export function renderFichaError(issues) {
  const items = issues.map((m) => `<li>${esc(m)}</li>`).join("");
  return `<section class="card guided-card"><h2>Ficha não aberta</h2><div role="alert"><ul>${items}</ul></div></section>`;
}

function download(bytes, name) {
  const href = URL.createObjectURL(new Blob([bytes], { type: "application/json;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

async function useAsTemplate(bytes, status) {
  const [{ importVoxchar }, { getDungeonSession }] = await Promise.all([import("../dungeon/voxchar.js"), import("../dungeon/dungeon-state.js")]);
  const out = await importVoxchar(getDungeonSession(), { bytes });
  if (out.ok) { location.hash = "#/dungeon/ficha"; return; }
  status.textContent = out.issues.join(" ");
}

function wireView(main, bytes) {
  const status = main.querySelector("#ficha-ver-status");
  main.querySelector('[data-ficha="download"]')?.addEventListener("click", () => download(bytes, "ficha.voxchar"));
  main.querySelector('[data-ficha="use-template"]')?.addEventListener("click", () => useAsTemplate(bytes, status));
}

/**
 * Abre a visualização do link. Troca a URL por `#/ficha/ver` logo na entrada (o fragmento não fica na barra nem no
 * histórico) e só então lê e valida o conteúdo. Não grava nada.
 * @param {{hash?: string}} [route] Rota com o `location.hash` completo capturado no parse.
 * @returns {Promise<void>} Conclui após montar a tela.
 */
export async function showFichaVer(route = {}) {
  const { parseVoxcharLink, VOXCHAR_VIEW_ROUTE } = await import("../dungeon/voxchar-link.js");
  try { history.replaceState(null, "", `${location.pathname}${location.search}${VOXCHAR_VIEW_ROUTE}`); } catch { /* ignore */ }
  const main = render.renderShell(makeShellProps(await getActiveUser(), "profile", "Ficha"));
  const out = await parseVoxcharLink(route.hash || "");
  main.innerHTML = out.ok ? renderFichaView(out.doc) : renderFichaError(out.issues);
  if (out.ok) wireView(main, out.bytes);
}
