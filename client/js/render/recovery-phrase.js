/**
 * @file ADR-032 §3.3 — HTML da tela da frase de recuperação (`#/frase`): aviso, palavras, cartão para imprimir
 * e conferência de 3 palavras. Funções puras; quem liga os botões é `app/screens-phrase.js`.
 */

import { escapeHtml } from "../shared/html.js";

const WARNING =
  "Quem tiver estas palavras entra como você. Escreva no papel, guarde longe do celular e não fotografe.";

/**
 * Primeira etapa: o que é a frase e, se a conta estiver travada, o campo da Senha Soberana.
 * @param {{ needsPassphrase: boolean }} opts
 * @returns {string}
 */
export function renderPhraseIntroHtml({ needsPassphrase }) {
  const pass = needsPassphrase
    ? `<input type="password" id="phrase-pass" class="agora-inscription genesis-input" placeholder="Senha Soberana" autocomplete="current-password" aria-label="Senha Soberana" required />`
    : "";
  return `
    <section class="phrase-screen" id="phrase-screen">
      <h2>Frase de recuperação</h2>
      <p>São palavras que trazem esta conta de volta em qualquer aparelho, sem servidor, sem e-mail e sem empresa.</p>
      <p class="phrase-warning" role="note">${WARNING}</p>
      <form id="form-phrase-show" class="genesis-inline-form genesis-inline-form--stack">
        ${pass}
        <button type="submit" class="agora-btn agora-btn--primary" id="btn-phrase-show">Mostrar minha frase</button>
      </form>
      <p id="phrase-error" class="oauth-enrich-error" role="alert" hidden></p>
      <p class="phrase-alt"><a href="#/backup">Prefiro senha e cofre</a></p>
    </section>`;
}

function wordListHtml(words) {
  return `<ol class="phrase-words">${words.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ol>`;
}

/**
 * Segunda etapa: as palavras, o cartão para imprimir e o botão para conferir.
 * @param {{ words: string[], kind: "semente"|"chave" }} phrase
 * @returns {string}
 */
export function renderPhraseWordsHtml({ words, kind }) {
  const legacy =
    kind === "chave"
      ? `<p class="phrase-note">Esta conta é de antes da frase curta, por isso são ${words.length} palavras. Elas trazem a conta e os posts; as mensagens diretas antigas só voltam pelo backup com a Senha Soberana.</p>`
      : "";
  return `
    <h2>Sua frase (${words.length} palavras)</h2>
    <p class="phrase-warning" role="note">${WARNING}</p>
    ${wordListHtml(words)}
    ${legacy}
    <div class="phrase-actions">
      <button type="button" class="agora-btn" id="btn-phrase-print">Imprimir cartão</button>
      <button type="button" class="agora-btn agora-btn--primary" id="btn-phrase-written">Já anotei</button>
    </div>
    <div class="phrase-print-card" id="phrase-print-card" aria-hidden="true">
      <h1>Vox — frase de recuperação</h1>
      <p>${WARNING}</p>
      ${wordListHtml(words)}
      <p>Para entrar: Vox → Já tenho conta → digite as palavras na ordem.</p>
    </div>`;
}

/**
 * Terceira etapa: digitar de volta as palavras sorteadas.
 * @param {number[]} positions posições base 0
 * @returns {string}
 */
export function renderPhraseConfirmHtml(positions) {
  const fields = positions
    .map(
      (pos) => `<label class="phrase-confirm-field">Palavra nº ${pos + 1}
        <input type="text" class="genesis-input" data-phrase-pos="${pos}" autocomplete="off" autocapitalize="none" spellcheck="false" required />
      </label>`
    )
    .join("");
  return `
    <h2>Confira</h2>
    <p>Sem olhar a tela anterior, digite as palavras pedidas, pelo papel.</p>
    <form id="form-phrase-confirm" class="genesis-inline-form genesis-inline-form--stack">
      ${fields}
      <button type="submit" class="agora-btn agora-btn--primary">Confirmar</button>
      <button type="button" class="genesis-link" id="btn-phrase-back">Ver as palavras de novo</button>
    </form>
    <p id="phrase-error" class="oauth-enrich-error" role="alert" hidden></p>`;
}

/**
 * Fim: a frase passou a valer como saída.
 * @returns {string}
 */
export function renderPhraseDoneHtml() {
  return `
    <h2>Pronto: esta conta tem saída</h2>
    <p>Se você limpar o navegador ou perder o celular, escolha "Já tenho conta" e digite a frase.</p>
    <a class="agora-btn agora-btn--primary" href="#/">Voltar para a Ágora</a>`;
}
