/**
 * @file Agendador de confirmação com janela de cancelamento (`Desfazer`) e flush no fechamento da aba (`pagehide`).
 * @module shared/schedule-commit
 */

/**
 * Cancela o timer pendente e remove o ouvinte `pagehide` quando suportado pelo alvo.
 *
 * @param {ReturnType<typeof setTimeout>|null} timerId Identificador do timer agendado.
 * @param {EventTarget|null|undefined} target Alvo do evento `pagehide`.
 * @param {Function} listener Ouvinte registrado.
 * @returns {void}
 */
function settleTimer(timerId, target, listener) {
  if (timerId !== null) clearTimeout(timerId);
  if (typeof target?.removeEventListener === "function") {
    target.removeEventListener("pagehide", listener);
  }
}

/**
 * Agenda `onCommit()` após `delayMs` com suporte a cancelamento (`undo`) e flush imediato em `pagehide`.
 * Garante execução idempotente: `onCommit()` e `onUndo()` são mutuamente exclusivos e rodam no máximo uma vez.
 *
 * @param {object} [options={}] Configuração do agendamento.
 * @param {number} [options.delayMs=4000] Atraso em milissegundos antes de confirmar.
 * @param {() => unknown} [options.onCommit] Callback disparado ao confirmar (timer ou `pagehide`).
 * @param {() => unknown} [options.onUndo] Callback disparado ao desfazer antes da confirmação.
 * @param {EventTarget|null} [options.target=globalThis] Alvo onde o ouvinte `pagehide` será registrado.
 * @returns {{ undo: () => void, flush: () => void, isPending: () => boolean }} Controles do agendamento.
 */
export function scheduleCommit({ delayMs = 4000, onCommit, onUndo, target = globalThis } = {}) {
  const waitMs = Math.max(0, Number(delayMs ?? 4000) || 0);
  let pending = true;
  let timerId = null;

  const onPageHide = () => finish(onCommit);

  function finish(callback) {
    if (!pending) return;
    pending = false;
    settleTimer(timerId, target, onPageHide);
    timerId = null;
    callback?.();
  }

  if (typeof target?.addEventListener === "function") {
    target.addEventListener("pagehide", onPageHide);
  }
  timerId = setTimeout(() => finish(onCommit), waitMs);
  timerId?.unref?.();

  return {
    undo: () => finish(onUndo),
    flush: () => finish(onCommit),
    isPending: () => pending,
  };
}
