/** @file Telas do aviso assinado (lote D): aba de avisos, cartão, compositor em etapas e folha de envio. Spec: docs/specs/aviso-assinado-v0.md. */
import { escapeHtml } from "./util.js";
import { roleLabel } from "../aviso-roles.js";

const KIND_LABEL = { convocacao: "📣 Convocação", informe: "ℹ️ Informe", alerta: "⚠️ Alerta" };
const STATE_LABEL = { ativo: "", encerrado: "Encerrado", cancelado: "Cancelado" };
const CHOICES = [["ciente", "✅ Ciente"], ["vou", "🙋 Vou"], ["talvez", "🤔 Talvez"], ["nao-vou", "❌ Não vou"]];

export const AVISO_SAFETY_HINT = "Não ponha telefone, CPF ou endereço de ninguém no aviso.";

const avisosHref = (communityId) => `#/c/${encodeURIComponent(communityId)}/avisos`;

function whenLine(aviso) {
  if (!aviso.eventAt) return "";
  const when = new Date(aviso.eventAt).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" });
  const place = aviso.eventPlace ? ` · ${escapeHtml(aviso.eventPlace)}` : "";
  return `<p class="aviso-when">Quando: ${escapeHtml(when)}${place}</p>`;
}

const hasCount = (counts, key) => Number(counts?.[key] || 0) > 0;

function countsLine(label, counts) {
  const parts = CHOICES.filter(([key]) => hasCount(counts, key)).map(([key, text]) => `${text} ${Number(counts[key])}`);
  return parts.length ? `<p class="aviso-counts"><strong>${label}:</strong> ${parts.join(" · ")}</p>` : "";
}

function pastedCounts(count) {
  if (!count) return null;
  return { ciente: count.countCiente, vou: count.countVou, talvez: count.countTalvez, "nao-vou": count.countNaoVou };
}

function renderResponseButtons(item) {
  const options = item.aviso.eventAt ? CHOICES : CHOICES.slice(0, 1);
  const buttons = options.map(([key, text]) => {
    const mine = item.myChoice === key ? " is-active" : "";
    return `<button type="button" class="btn btn-outline btn-sm${mine}" data-aviso-action="responder" data-aviso-id="${escapeHtml(item.aviso.id)}" data-choice="${key}">${text}</button>`;
  });
  return `<div class="aviso-actions" role="group" aria-label="Responder ao aviso">${buttons.join("")}</div>`;
}

function renderModTools(item) {
  const id = escapeHtml(item.aviso.id);
  return `<div class="aviso-actions">
    <button type="button" class="btn btn-outline btn-sm" data-aviso-action="enviar" data-aviso-id="${id}">Enviar pelo WhatsApp</button>
    <button type="button" class="btn btn-outline btn-sm" data-aviso-action="colar" data-aviso-id="${id}">Colar respostas do WhatsApp</button>
    <button type="button" class="btn btn-outline btn-sm" data-aviso-action="cancelar" data-aviso-id="${id}">Cancelar ou corrigir</button>
  </div>
  <div class="aviso-sheet" data-aviso-sheet="${id}" hidden></div>`;
}

const CALL_STATE = { aberta: "Aberta", quorum: "✅ Quórum atingido", "sem-quorum": "Sem quórum no prazo" };

/** Vagas por papel e quórum, pela contagem que a coordenação publicou. */
function callLines(call) {
  if (!call) return "";
  const roles = call.roles.map((r) => `${escapeHtml(roleLabel(r.role))} ${r.filled}/${r.slots}`).join(" · ");
  const pending = call.counted ? "" : " · a coordenação ainda não publicou a contagem";
  return `<p class="aviso-roles"><strong>Vagas:</strong> ${roles}</p>
    <p class="aviso-quorum"><strong>Quórum:</strong> ${call.filled} de ${call.quorum} · ${CALL_STATE[call.state] || ""}${pending}</p>`;
}

function roleButton(item, role, text) {
  const mine = item.myRole === role ? " is-active" : "";
  return `<button type="button" class="btn btn-outline btn-sm${mine}" data-aviso-action="assumir" data-aviso-id="${escapeHtml(item.aviso.id)}" data-role="${escapeHtml(role)}">${text}</button>`;
}

/** Botões para assumir um papel; a resposta vai só para quem convocou. */
function renderRoleButtons(item) {
  const buttons = item.call.roles.map((r) => roleButton(item, r.role, `Assumir: ${escapeHtml(roleLabel(r.role))}`));
  if (item.myRole) buttons.push(roleButton(item, "", "Desistir do papel"));
  return `<div class="aviso-actions" role="group" aria-label="Assumir um papel">${buttons.join("")}</div>
    <p class="hint">Sua resposta vai só para quem convocou, por mensagem cifrada. O grupo vê só os números.</p>`;
}

/** Só no aparelho de quem convocou: quem assumiu cada papel e o botão de publicar os números. */
function renderCoordinationPanel(item) {
  const byRole = new Map(item.call.roles.map((r) => [r.role, []]));
  for (const c of item.received || []) byRole.get(c.role)?.push(c.authorDisplay || `${String(c.author).slice(0, 10)}…`);
  const lines = [...byRole].map(([role, names]) =>
    `<li><strong>${escapeHtml(roleLabel(role))}:</strong> ${names.length ? escapeHtml(names.join(", ")) : "ninguém ainda"}</li>`).join("");
  return `<div class="aviso-coordination">
    <p class="hint">Só você vê os nomes.</p><ul>${lines}</ul>
    <button type="button" class="btn btn-outline btn-sm" data-aviso-action="publicar-papeis" data-aviso-id="${escapeHtml(item.aviso.id)}">Publicar contagem por papel</button>
  </div>`;
}

/** O que quem vê o cartão pode fazer: responder, assumir papel, ver os nomes, gerir. */
function cardActions(item, { isMod, canRespond, live }) {
  const respond = live && canRespond;
  return [
    respond ? renderResponseButtons(item) : "",
    respond && item.call ? renderRoleButtons(item) : "",
    isMod && item.call && item.received ? renderCoordinationPanel(item) : "",
    live && isMod ? renderModTools(item) : "",
  ].join("");
}

/** Cartão de um aviso. `item`: `{ aviso, code, tally, count, myChoice, call?, myRole?, received? }`. */
export function renderAvisoCard(item, { isMod = false, canRespond = false } = {}) {
  const { aviso } = item;
  const state = STATE_LABEL[aviso.avisoState] || "";
  const live = aviso.avisoState === "ativo";
  return `<article class="card aviso-card${live ? "" : " is-closed"}" data-aviso-card="${escapeHtml(aviso.id)}">
    <p class="aviso-seal">📣 Aviso da coordenação · ${KIND_LABEL[aviso.avisoKind] || ""} · código <strong>${escapeHtml(item.code)}</strong>${state ? ` · <em>${state}</em>` : ""}</p>
    <h3 class="aviso-title">${escapeHtml(aviso.title)}</h3>
    ${aviso.body ? `<p class="aviso-body">${escapeHtml(aviso.body)}</p>` : ""}
    ${whenLine(aviso)}
    ${countsLine("No Vox", item.tally?.members)}
    ${countsLine("De fora do grupo", item.tally?.outsiders)}
    ${countsLine("Contado no WhatsApp", pastedCounts(item.count))}
    ${callLines(item.call)}
    ${cardActions(item, { isMod, canRespond, live })}
  </article>`;
}

/** Aviso fixo no topo da comunidade, com o caminho para a aba. */
export function renderPinnedAviso(item, communityId) {
  const card = item ? renderAvisoCard(item) : "";
  return `<section class="aviso-pinned">${card}<p><a class="btn btn-outline btn-sm" href="${avisosHref(communityId)}">📣 Avisos da comunidade</a></p></section>`;
}

/** Aba de avisos: lista com ativos, encerrados e cancelados. */
export function renderAvisosScreen(main, { communityId, title, items, isMod, canRespond }) {
  const compose = isMod
    ? `<a class="btn btn-primary" href="#/compose/aviso?c=${encodeURIComponent(communityId)}">Novo aviso</a>`
    : "";
  const list = items.length
    ? items.map((item) => renderAvisoCard(item, { isMod, canRespond })).join("")
    : `<div class="empty card"><p>Nenhum aviso da coordenação ainda.</p></div>`;
  main.innerHTML = `<div class="aviso-screen">
    <p><a href="#/c/${encodeURIComponent(communityId)}" class="btn btn-outline btn-sm">← ${escapeHtml(title)}</a> ${compose}</p>
    ${list}
  </div>`;
}

function kindStep() {
  const options = Object.entries(KIND_LABEL).map(([value, label], i) =>
    `<label class="aviso-kind"><input type="radio" name="avisoKind" value="${value}"${i === 0 ? " checked" : ""} /> ${label}</label>`).join("");
  return `<section class="compose-step" data-step-key="kind">
    <h2>Que tipo de aviso?</h2>${options}
    <p class="hint">Cobrança e Pix não entram em aviso.</p>
    <button type="button" class="btn btn-primary" data-step-next>Continuar</button>
  </section>`;
}

function textStep() {
  return `<section class="compose-step" data-step-key="text" data-step-required="aviso-title" hidden>
    <h2>O que avisar?</h2>
    <label for="aviso-title">Título</label>
    <input id="aviso-title" name="title" required minlength="8" maxlength="80" />
    <label for="aviso-body">Texto (até 280)</label>
    <textarea id="aviso-body" name="body" maxlength="280" rows="4"></textarea>
    <p class="hint"><span data-aviso-counter>0</span>/280 · ${AVISO_SAFETY_HINT}</p>
    <p class="error" data-step-error hidden>O título precisa de pelo menos 8 letras.</p>
    <button type="button" class="btn btn-outline" data-step-prev>Voltar</button>
    <button type="button" class="btn btn-primary" data-step-next>Continuar</button>
  </section>`;
}

function whenStep() {
  return `<section class="compose-step" data-step-key="when" hidden>
    <h2>Quando e onde?</h2>
    <p class="hint">Só para convocação, e aí é obrigatório. Em informe e alerta, fica de fora.</p>
    <label for="aviso-event-at">Data e hora</label>
    <input id="aviso-event-at" name="eventAt" type="datetime-local" />
    <label for="aviso-place">Lugar</label>
    <input id="aviso-place" name="eventPlace" maxlength="80" />
    <label for="aviso-roles">Papéis e vagas (opcional)</label>
    <input id="aviso-roles" name="roleSlots" maxlength="200" placeholder="Ex.: jurídico 2, comunicação 3, apoio 5" />
    <label for="aviso-quorum">Quórum mínimo de pessoas (opcional)</label>
    <input id="aviso-quorum" name="quorumMin" type="number" min="1" max="999" />
    <p class="hint">Quem assume um papel responde só para você, por mensagem cifrada. O grupo vê só os números que você publicar.</p>
    <p class="error" data-aviso-error hidden></p>
    <button type="button" class="btn btn-outline" data-step-prev>Voltar</button>
    <button type="submit" class="btn btn-primary" id="btn-publish-aviso">Assinar e publicar</button>
  </section>`;
}

/** Compositor em três etapas: tipo, texto, quando e onde. */
export function renderAvisoComposer(main, communityId) {
  main.innerHTML = `<form id="form-compose-aviso" class="card agora-composer" novalidate>
    <p><a href="${avisosHref(communityId)}" class="btn btn-outline btn-sm">← Avisos</a></p>
    ${kindStep()}${textStep()}${whenStep()}
  </form>`;
}

/** Folha de envio: texto do WhatsApp e, sob demanda, o link de conferência. */
export function renderShareSheet(sheet, { avisoId, text, linkMessage = "" }) {
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const link = linkMessage
    ? `<p class="hint">Segunda mensagem, só se alguém pedir para conferir:</p>
       <pre class="aviso-preview">${escapeHtml(linkMessage)}</pre>
       <a class="btn btn-outline btn-sm" href="https://wa.me/?text=${encodeURIComponent(linkMessage)}" target="_blank" rel="noopener">Enviar o link de conferência</a>`
    : `<button type="button" class="btn btn-outline btn-sm" data-aviso-action="link" data-aviso-id="${escapeHtml(avisoId)}">Gerar link de conferência</button>`;
  sheet.innerHTML = `<pre class="aviso-preview">${escapeHtml(text)}</pre>
    <a class="btn btn-primary btn-sm" href="${wa}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a>
    ${link}`;
  sheet.hidden = false;
}

/** Folha para colar as respostas exportadas do WhatsApp. */
export function renderPasteSheet(sheet, avisoId) {
  sheet.innerHTML = `<label for="aviso-paste-${escapeHtml(avisoId)}">Cole aqui a conversa exportada ou as respostas</label>
    <textarea id="aviso-paste-${escapeHtml(avisoId)}" rows="6" data-aviso-paste></textarea>
    <p class="hint">O texto não sai do seu celular e não fica guardado. Só os números são publicados.</p>
    <button type="button" class="btn btn-primary btn-sm" data-aviso-action="contar" data-aviso-id="${escapeHtml(avisoId)}">Contar e publicar números</button>`;
  sheet.hidden = false;
}
