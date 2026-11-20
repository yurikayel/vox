/**
 * @file Overlay leve de dados 3D/2.5D (E4, lazy): face final travada no resultado da rolagem.
 * @module dungeon/dice-3d
 */

function styleOverlay(layer, inner, sides, value) {
  layer.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;pointer-events:none;z-index:40;";
  inner.style.cssText = "min-width:96px;padding:1rem 1.25rem;border-radius:14px;background:rgba(24,18,40,.92);color:#f4efe6;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.35);";
  inner.dataset.sides = String(sides);
  inner.innerHTML = `<strong>${value}</strong><span>d${sides}</span>`;
}

/**
 * Monta animação breve sobre o contêiner da mesa.
 * @param {HTMLElement} container Elemento pai (geralmente `#dungeon-main`).
 * @param {object} rollResult Resultado de `rollDiceFormula`.
 * @param {{ reducedMotion?: boolean }} [opts]
 * @returns {() => void} Função para remover o overlay.
 */
export function mountDice3dOverlay(container, rollResult, opts = {}) {
  if (!container || !rollResult?.ok) return () => {};
  const kept = rollResult.rolls?.find((d) => d.kept);
  const sides = kept?.sides || 20;
  const value = rollResult.total;
  const reduced = Boolean(opts.reducedMotion || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const layer = document.createElement("div");
  layer.className = "dungeon-dice3d-overlay";
  layer.setAttribute("role", "status");
  const die = document.createElement("div");
  die.className = "dungeon-dice3d-die";
  layer.appendChild(die);
  styleOverlay(layer, die, sides, value);
  container.appendChild(layer);
  if (!reduced) {
    die.style.transform = "rotateX(420deg) rotateY(180deg)";
    requestAnimationFrame(() => {
      die.style.transition = "transform 900ms cubic-bezier(.2,.9,.2,1)";
      die.style.transform = "rotateX(0deg) rotateY(0deg)";
    });
  }
  const ms = reduced ? 400 : 1400;
  const timer = setTimeout(() => layer.remove(), ms);
  return () => {
    clearTimeout(timer);
    layer.remove();
  };
}