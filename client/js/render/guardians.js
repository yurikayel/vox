/**
 * @file Guardiões, parte 3b — HTML da tela `#/guardioes`: escolher guardiões (só laço mútuo), M de N, estado dos
 * recibos e a lista de quem este aparelho guarda. Funções puras; quem liga os botões é `app/screens-guardians.js`.
 */

import { escapeHtml } from "../shared/html.js";
import { MAX_N, MIN_M } from "../shamir-gf256.js";

const HOW =
  "Cada pessoa recebe um pedaço cifrado da volta da sua conta. Sozinho, um pedaço não abre nada; o mínimo que você escolher, juntos, devolve a conta se você perder o celular.";
const RETURN_NOTE =
  "Para devolver, cada guardião confere com você por voz ou pessoalmente. Sem servidor da comunidade, a devolução é com os aparelhos juntos.";

function candidateHtml({ routeId, name }) {
  return `<label class="guardian-candidate">
      <input type="checkbox" name="guardian" value="${escapeHtml(routeId)}" />
      <span>${escapeHtml(name)}</span>
    </label>`;
}

function minimumOptions(selected) {
  return Array.from({ length: MAX_N - MIN_M + 1 }, (_, i) => MIN_M + i)
    .map((m) => `<option value="${m}"${m === selected ? " selected" : ""}>${m}</option>`)
    .join("");
}

/**
 * Formulário de escolha. Sem candidatos, explica como formar o laço mútuo.
 * @param {{ candidates: { routeId: string, name: string }[], m: number, needsPassphrase: boolean }} opts
 * @returns {string}
 */
export function renderGuardianChooserHtml({ candidates, m, needsPassphrase }) {
  if (!candidates.length) {
    return `<p class="guardian-empty">Ainda não há quem possa ser guardião. Só aparecem pessoas que você segue (ou tem nos contatos) e que também adicionaram você aos contatos: peça a quem você confia que faça isso.</p>`;
  }
  const pass = needsPassphrase
    ? `<input type="password" id="guardian-pass" class="agora-inscription genesis-input" placeholder="Senha Soberana" autocomplete="current-password" aria-label="Senha Soberana" required />`
    : "";
  return `
    <form id="form-guardians" class="genesis-inline-form genesis-inline-form--stack">
      <fieldset class="guardian-list"><legend>Escolha de ${MIN_M + 1} a ${MAX_N} pessoas que não se conheçam entre si</legend>
        ${candidates.map(candidateHtml).join("")}
      </fieldset>
      <label class="guardian-minimum">Quantas juntas devolvem a conta
        <select id="guardian-m">${minimumOptions(m)}</select>
      </label>
      <p class="guardian-hint" id="guardian-hint" aria-live="polite"></p>
      ${pass}
      <button type="submit" class="agora-btn agora-btn--primary" id="btn-guardians-send">Dividir e enviar</button>
    </form>`;
}

/**
 * Frase do efeito de M e N, em palavras.
 * @param {number} m
 * @param {number} n
 * @returns {string}
 */
export function describeThreshold(m, n) {
  if (n < MIN_M + 1) return `Escolha pelo menos ${MIN_M + 1} pessoas.`;
  if (m > n) return `O mínimo (${m}) passa do número de pessoas (${n}).`;
  const fewer = m - 1 === 1 ? "1 sozinha não consegue" : `${m - 1} sozinhas não conseguem`;
  return `${m} de ${n}: se você perder o celular, ${m} delas juntas devolvem sua conta; ${fewer}.`;
}

/**
 * Estado da divisão ativa da dona.
 * @param {{ confirmed: number, m: number, n: number, names: string[] }|null} status
 * @returns {string}
 */
export function renderGuardianStatusHtml(status) {
  if (!status?.n) return "";
  const done = status.confirmed >= status.m;
  const text = done
    ? `Pronto: ${status.confirmed} de ${status.n} guardiões confirmaram. Esta conta tem saída pelos guardiões.`
    : `${status.confirmed} de ${status.n} confirmaram que guardam o pedaço; a saída vale quando ${status.m} confirmarem. Quem estiver offline confirma quando abrir o Vox.`;
  return `<div class="guardian-status${done ? " is-done" : ""}" role="status">
      <p>${text}</p>
      <p class="guardian-names">${status.names.map(escapeHtml).join(" · ")}</p>
    </div>`;
}

/**
 * Lista de quem este aparelho guarda (sem os pedaços).
 * @param {{ owner: string, name: string }[]} held
 * @returns {string}
 */
export function renderHeldListHtml(held) {
  if (!held.length) return `<p class="guardian-empty">Você não guarda a volta de ninguém.</p>`;
  return `<ul class="guardian-held">${held
    .map(
      ({ owner, name }) => `<li>Você guarda a volta de <strong>${escapeHtml(name)}</strong>
        <button type="button" class="genesis-link" data-stop-guarding="${escapeHtml(owner)}">Parar de guardar</button></li>`
    )
    .join("")}</ul>
    <p class="guardian-note">O pedaço fica cifrado neste aparelho e não tem tela para abrir. Se você limpar o navegador, ele some: avise a pessoa.</p>`;
}

/**
 * A tela inteira, com os três blocos já montados.
 * @param {{ statusHtml: string, chooserHtml: string, heldHtml: string }} parts
 * @returns {string}
 */
export function renderGuardiansScreenHtml({ statusHtml, chooserHtml, heldHtml }) {
  return `
    <section class="guardians-screen" id="guardians-screen">
      <h2>Guardiões</h2>
      <p>${HOW}</p>
      <p class="phrase-note">${RETURN_NOTE}</p>
      ${statusHtml}
      ${chooserHtml}
      <p id="guardian-error" class="oauth-enrich-error" role="alert" hidden></p>
      <h3>Você guarda</h3>
      ${heldHtml}
      <p class="phrase-alt"><a href="#/frase">Prefiro a frase no papel</a></p>
    </section>`;
}
