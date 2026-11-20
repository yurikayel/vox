/**
 * @file Overlay leve de dados 3D/2.5D (E4, lazy): poliedro SVG travado no resultado da rolagem com destaque de crítico/falha.
 * @module dungeon/dice-3d
 */
import { escapeHtml } from "../shared/html.js";

function accentForRoll(rollResult) {
  if (rollResult?.crits) return { border: "#69dba9", badge: "CRÍTICO!" };
  if (rollResult?.fumbles) return { border: "#ffb4ab", badge: "FALHA CRÍTICA" };
  return { border: "#e7c26b", badge: "" };
}

function renderPolySvg(sides, value, border) {
  const safeVal = escapeHtml(String(value));
  const safeSides = escapeHtml(`d${sides}`);
  return `<svg width="86" height="86" viewBox="0 0 110 110" aria-hidden="true">
    <polygon points="55,6 98,30 98,80 55,104 12,80 12,30" fill="#1a1c1f" stroke="${border}" stroke-width="3"/>
    <polygon points="55,18 85,72 25,72" fill="#282a2d" stroke="#78d6cf" stroke-width="1.5" opacity="0.8"/>
    <text x="55" y="61" text-anchor="middle" fill="${border}" font-family="Georgia, serif" font-size="28" font-weight="700">${safeVal}</text>
    <text x="55" y="92" text-anchor="middle" fill="#bbc9c7" font-family="monospace" font-size="11">${safeSides}</text>
  </svg>`;
}

function styleOverlay(layer, inner, rollResult, sides) {
  const { border, badge } = accentForRoll(rollResult);
  layer.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:80;";
  inner.style.cssText = `min-width:128px;padding:0.9rem 1.25rem;border-radius:14px;background:rgba(12,14,17,0.94);border:1.5px solid ${border};color:#f4efe6;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.55);`;
  inner.dataset.sides = String(sides);
  const label = rollResult.label ? `<div style="font-size:0.76rem;color:#bbc9c7;margin-top:0.25rem">${escapeHtml(rollResult.label)}</div>` : "";
  const tag = badge ? `<div style="font-size:0.72rem;font-weight:700;letter-spacing:0.08em;color:${border};margin-top:0.2rem">${badge}</div>` : "";
  inner.innerHTML = `${renderPolySvg(sides, rollResult.total, border)}<strong class="sr-only">${escapeHtml(String(rollResult.total))}</strong><span class="sr-only">d${sides}</span>${label}${tag}`;
}

function resolveOverlayTarget(container) {
  const doc = container?.ownerDocument || globalThis.document;
  const host = doc?.body || container;
  if (!doc?.createElement || typeof host?.appendChild !== "function") return null;
  return { doc, host };
}

function animateDieElement(die, reduced) {
  if (reduced || typeof globalThis.requestAnimationFrame !== "function") return;
  die.style.transform = "rotateX(420deg) rotateY(180deg) scale(0.85)";
  globalThis.requestAnimationFrame(() => {
    die.style.transition = "transform 700ms cubic-bezier(.2,.9,.2,1)";
    die.style.transform = "rotateX(0deg) rotateY(0deg) scale(1)";
  });
}

/**
 * Monta animação breve sobre o corpo da página (sobrevive a redraws do contêiner da mesa).
 * @param {HTMLElement} container Elemento raiz ou pai (usa `ownerDocument.body` quando disponível).
 * @param {object} rollResult Resultado de `rollDiceFormula`.
 * @param {{ reducedMotion?: boolean }} [opts]
 * @returns {() => void} Função para remover o overlay.
 */
export function mountDice3dOverlay(container, rollResult, opts = {}) {
  if (!container || !rollResult?.ok) return () => {};
  const target = resolveOverlayTarget(container);
  if (!target) return () => {};
  const sides = rollResult.rolls?.find((d) => d.kept)?.sides || 20;
  const reduced = Boolean(opts.reducedMotion || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const layer = target.doc.createElement("div");
  layer.className = "dungeon-dice3d-overlay";
  layer.setAttribute("role", "status");
  const die = target.doc.createElement("div");
  die.className = "dungeon-dice3d-die";
  layer.appendChild(die);
  styleOverlay(layer, die, rollResult, sides);
  target.host.appendChild(layer);
  animateDieElement(die, reduced);
  const timer = setTimeout(() => layer.remove(), reduced ? 450 : 1450);
  return () => {
    clearTimeout(timer);
    layer.remove();
  };
}
