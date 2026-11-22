/**
 * @file Máquina de estados finita acoplada a `signal` (ADR-035: pura em `shared/`).
 *
 * Bloqueia transições inválidas ou não autorizadas por `guard` antes de notificar efeitos.
 *
 * @module shared/state-machine
 */

import { signal } from "./signals.js";

function normalizeTransition(spec) {
  if (typeof spec === "string") return { target: spec };
  if (spec && typeof spec === "object" && typeof spec.target === "string") return spec;
  return null;
}

function resolveTransition(states, current, event) {
  const stateDef = states?.[current];
  const raw = stateDef?.on?.[event];
  const spec = normalizeTransition(raw);
  if (!spec || !Object.hasOwn(states, spec.target)) return null;
  return spec;
}

function allowsTransition(states, current, event, payload) {
  const spec = resolveTransition(states, current, event);
  if (!spec) return false;
  return typeof spec.guard === "function" ? Boolean(spec.guard(current, payload)) : true;
}

function executeTransition({ states, stateSig, spec, from, payload }) {
  const to = spec.target;
  if (to === from) {
    spec.action?.(from, payload, to);
    return { changed: false, from, to };
  }
  states[from]?.onExit?.(payload, from, to);
  stateSig.set(to);
  spec.action?.(from, payload, to);
  states[to]?.onEnter?.(payload, from, to);
  return { changed: true, from, to };
}

/**
 * Cria uma máquina de estados finita com leitura reativa via {@link signal}.
 * @param {object} config Configuração da máquina.
 * @param {string} config.initial Nome do estado inicial.
 * @param {Record<string, object>} config.states Mapa de estados e transições `on`.
 * @returns {{ state: { get: () => string, peek: () => string }, matches: (name: string) => boolean, can: (event: string, payload?: unknown) => boolean, send: (event: string, payload?: unknown) => { changed: boolean, from: string, to: string }, reset: () => void }} Instância da máquina.
 */
export function createMachine({ initial, states }) {
  if (!states || typeof states !== "object" || !Object.hasOwn(states, initial)) {
    throw new Error(`state-machine: estado inicial inválido "${String(initial)}"`);
  }
  const stateSig = signal(initial);
  return {
    state: { get: stateSig.get, peek: stateSig.peek },
    matches: (name) => stateSig.get() === name,
    can: (event, payload) => allowsTransition(states, stateSig.peek(), event, payload),
    send(event, payload) {
      const from = stateSig.peek();
      const spec = resolveTransition(states, from, event);
      if (!spec || (typeof spec.guard === "function" && !spec.guard(from, payload))) {
        return { changed: false, from, to: from };
      }
      return executeTransition({ states, stateSig, spec, from, payload });
    },
    reset: () => stateSig.set(initial),
  };
}
