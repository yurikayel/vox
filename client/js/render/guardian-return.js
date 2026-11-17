/**
 * @file Guardiões, parte 3c — HTML das duas telas do pedido de volta: a do guardião (`#/guardiao?…`), que confere e
 * devolve, e a do aparelho novo (`#/voltar`), que pede e junta. Funções puras; quem liga os botões é
 * `app/screens-guardian-return.js`.
 */

import { escapeHtml } from "../shared/html.js";

const REFUSALS = {
  invalid: "Este link de pedido não vale. Peça para a pessoa mandar de novo.",
  self: "Este pedido é da sua própria conta. Quem devolve são os seus guardiões, no aparelho deles.",
  old: "Este pedido tem mais de 24 horas e não vale mais. Peça para a pessoa gerar um novo.",
  future: "Este pedido tem data adiantada e não vale. Confira o relógio do aparelho novo e gere outro pedido.",
  "not-held": "Você não guarda a volta desta conta neste aparelho.",
};

/**
 * Há quanto tempo, em palavras.
 * @param {number} ms
 * @returns {string}
 */
export function describeAge(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return minutes === 1 ? "há 1 minuto" : `há ${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
}

function codeHtml(code) {
  return `<p class="guardian-code" aria-label="Código de conferência">${code.map(escapeHtml).join(" · ")}</p>`;
}

function ownerHtml({ name, avatarUrl }) {
  const img = avatarUrl ? `<img class="guardian-owner-avatar" src="${escapeHtml(avatarUrl)}" alt="" />` : "";
  return `<div class="guardian-owner">${img}<strong>${escapeHtml(name)}</strong></div>`;
}

/**
 * Tela do guardião antes de devolver. Sem marcar a conferência, o botão fica desligado.
 * @param {{ reason?: string, name?: string, avatarUrl?: string, ageMs?: number, code?: string[] }} view
 *   `name` e `avatarUrl` vêm dos contatos do guardião, nunca do pedido
 * @returns {string}
 */
export function renderGuardianReturnHtml(view) {
  if (view.reason) return `<section class="guardian-return" id="guardian-return"><h2>Devolver a conta</h2><p class="guardian-empty">${escapeHtml(REFUSALS[view.reason] || REFUSALS.invalid)}</p></section>`;
  const name = escapeHtml(view.name);
  return `
    <section class="guardian-return" id="guardian-return">
      <h2>Devolver a conta</h2>
      <p>Alguém pediu de volta a conta de</p>
      ${ownerHtml(view)}
      <p class="guardian-age">Pedido criado ${escapeHtml(describeAge(view.ageMs))}.</p>
      <p>Ligue para ${name} ou fale pessoalmente. Peça para ${name} ler o código que aparece no aparelho novo. Ele tem que ser este:</p>
      ${codeHtml(view.code)}
      <p class="phrase-note">Se alguém mandou este link por mensagem e não atende ligação, não devolva: pode ser golpe.</p>
      <label class="guardian-confirm"><input type="checkbox" id="guardian-return-confirm" />
        Falei com ${name} por voz ou pessoalmente agora, e ${name} leu para mim este mesmo código.</label>
      <button type="button" class="agora-btn agora-btn--primary" id="btn-guardian-return" disabled>Devolver meu pedaço</button>
      <p id="guardian-return-error" class="oauth-enrich-error" role="alert" hidden></p>
      <div id="guardian-return-sent" hidden></div>
    </section>`;
}

/**
 * Depois de devolver: a resposta selada para colar no aparelho novo.
 * @param {{ viaRelay: boolean, pasteText: string }} sent
 * @returns {string}
 */
export function renderReturnSentHtml({ viaRelay, pasteText }) {
  const how = viaRelay
    ? "Pronto: a resposta foi para a caixa temporária e chega no aparelho novo quando ele buscar."
    : "Pronto. Sem servidor da comunidade, a resposta não foi pela rede.";
  return `<p role="status">${how} Se vocês estão juntos, mande também este texto para o aparelho novo (ele só abre lá):</p>
    <textarea class="genesis-input guardian-paste" id="guardian-return-paste" rows="4" readonly>${escapeHtml(pasteText)}</textarea>
    <button type="button" class="agora-btn" id="btn-guardian-return-share">Copiar ou compartilhar</button>`;
}

/**
 * Tela do aparelho novo sem pedido: dizer quem é.
 * @returns {string}
 */
export function renderRecoverStartHtml() {
  return `
    <section class="guardian-recover" id="guardian-recover">
      <h2>Voltar pelos guardiões</h2>
      <p>Quem guarda a volta da sua conta pode devolvê-la para este aparelho. Primeiro, diga qual é a sua conta: cole o link do seu perfil ou o seu código <code>vx_…</code> (está no Perfil de quem segue você).</p>
      <form id="form-guardian-recover" class="genesis-inline-form genesis-inline-form--stack">
        <input type="text" id="guardian-recover-owner" class="genesis-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Link do perfil ou vx_…" aria-label="Sua conta" required />
        <button type="submit" class="agora-btn agora-btn--primary">Criar pedido</button>
      </form>
      <p id="guardian-recover-error" class="oauth-enrich-error" role="alert" hidden></p>
    </section>`;
}

/**
 * Tela do aparelho novo com o pedido aberto: link, código, respostas e entrar.
 * @param {{ link: string, code: string[], received: number }} view
 * @returns {string}
 */
export function renderRecoverPendingHtml({ link, code, received }) {
  const count = received === 1 ? "1 resposta recebida" : `${received} respostas recebidas`;
  return `
    <section class="guardian-recover" id="guardian-recover">
      <h2>Voltar pelos guardiões</h2>
      <ol class="guardian-steps">
        <li>Mande este link para cada guardião:
          <input type="text" class="genesis-input" id="guardian-recover-link" value="${escapeHtml(link)}" readonly aria-label="Link do pedido" />
          <button type="button" class="agora-btn" id="btn-guardian-recover-share">Copiar ou compartilhar</button>
          <button type="button" class="agora-btn" id="btn-guardian-recover-qr" data-qr-url="${escapeHtml(link)}">Mostrar QR para quem está do seu lado</button></li>
        <li>Ligue ou fale pessoalmente com cada um e leia este código:${codeHtml(code)}</li>
        <li>Cole aqui a resposta de quem estiver com você, ou busque na caixa temporária:
          <textarea class="genesis-input guardian-paste" id="guardian-recover-paste" rows="3" placeholder="vox-volta:…" aria-label="Resposta de um guardião"></textarea>
          <button type="button" class="agora-btn" id="btn-guardian-recover-add">Adicionar resposta</button>
          <button type="button" class="agora-btn" id="btn-guardian-recover-pull">Buscar na caixa temporária</button></li>
      </ol>
      <p class="guardian-received" role="status">${escapeHtml(count)}.</p>
      <button type="button" class="agora-btn agora-btn--primary" id="btn-guardian-recover-finish">Entrar na minha conta</button>
      <p id="guardian-recover-error" class="oauth-enrich-error" role="alert" hidden></p>
      <p class="phrase-note">O pedido vale por 24 horas e só nesta aba. Fechar a aba desfaz o pedido. Sem servidor da comunidade, as respostas chegam coladas aqui.</p>
      <p class="phrase-alt"><button type="button" class="genesis-link" id="btn-guardian-recover-cancel">Desistir deste pedido</button></p>
    </section>`;
}
