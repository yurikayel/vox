/**
 * @file Registro fechado de números calculados do GURPS 4e para a faixa de derivados (spec derivados-por-sistema-v0,
 * fatia 3). Cada função é pura: recebe os derivados do motor, o rótulo declarado no pacote e o contexto de carga, e
 * devolve `{label, value}` em texto puro. A matemática vem de `system-gurps-math.js`; aqui só se escolhe o que mostrar.
 * Nenhum texto de regra do livro: só nomes curtos de mecânica (Esquiva, Carga).
 *
 * @module dungeon/system-display-gurps
 * @see docs/specs/derivados-por-sistema-v0.md
 */
import { encumbrance, gurpsSecondaries } from "./system-gurps-math.js";

const LOAD_LABELS = Object.freeze({ nenhuma: "Nenhuma", leve: "Leve", media: "Média", pesada: "Pesada", "muito-pesada": "Muito pesada" });

function scores(derived) {
  return Object.fromEntries((derived.abilities || []).map((a) => [a.id, a.score]));
}

function weightOf(ctx) {
  const w = Number(ctx?.weightLb);
  return Number.isFinite(w) && w > 0 ? w : 0;
}

/**
 * Registro de funções `computed` do GURPS: nome registrado no pacote → `(derived, label, ctx) => {label, value}`.
 * `ctx` traz `weightLb` (peso carregado) e `unweighed` (itens sem peso informado).
 * @type {Readonly<Object<string, (derived: object, label: string, ctx?: {weightLb?: number, unweighed?: number}) => {label: string, value: string}>>}
 */
export const GURPS_COMPUTED = Object.freeze({
  "gurps.hp": (derived, label) => ({ label, value: String(gurpsSecondaries(scores(derived)).hp) }),
  "gurps.fp": (derived, label) => ({ label, value: String(gurpsSecondaries(scores(derived)).fp) }),
  "gurps.basicSpeed": (derived, label) => ({ label, value: String(gurpsSecondaries(scores(derived)).basicSpeed).replace(".", ",") }),
  "gurps.basicMove": (derived, label) => ({ label, value: String(gurpsSecondaries(scores(derived)).basicMove) }),
  "gurps.dodge": (derived, label, ctx) => ({ label, value: String(encumbrance(scores(derived), weightOf(ctx)).dodge) }),
  "gurps.move": (derived, label, ctx) => ({ label, value: String(encumbrance(scores(derived), weightOf(ctx)).move) }),
  "gurps.load": (derived, label, ctx) => {
    const enc = encumbrance(scores(derived), weightOf(ctx));
    const base = enc.overloaded ? "Sobrecarga" : LOAD_LABELS[enc.level];
    return { label, value: ctx?.unweighed > 0 ? `${base} (itens sem peso)` : base };
  },
});
