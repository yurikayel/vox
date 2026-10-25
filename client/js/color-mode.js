/** @file Light / dark / auto — parchment vs carbon; auto = OS prefers-color-scheme + sky clock. */

export const VOX_COLOR_MODE_KEY = "vox-color-mode";

const MODES = Object.freeze(["auto", "light", "dark"]);

/** @returns {"auto"|"light"|"dark"} */
export function parseColorMode(raw) {
  if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  return "auto";
}

/** @param {Storage|null|undefined} storage */
export function readColorMode(storage) {
  if (!storage) return "auto";
  return parseColorMode(storage.getItem(VOX_COLOR_MODE_KEY));
}

/** @param {Storage|null|undefined} storage @param {string} mode */
export function writeColorMode(storage, mode) {
  if (!storage) return;
  const m = parseColorMode(mode);
  if (m === "auto") storage.removeItem(VOX_COLOR_MODE_KEY);
  else storage.setItem(VOX_COLOR_MODE_KEY, m);
}

/** @param {HTMLElement} root @param {"auto"|"light"|"dark"} mode */
export function applyColorModeToRoot(root, mode) {
  const m = parseColorMode(mode);
  if (m === "auto") {
    root.removeAttribute("data-color-mode");
    root.style.removeProperty("color-scheme");
    return;
  }
  root.setAttribute("data-color-mode", m);
  root.style.colorScheme = m;
}

/** @param {"auto"|"light"|"dark"} mode @param {boolean} prefersDark */
export function resolveEffectiveDark(mode, prefersDark) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

/** @param {string} current */
export function cycleColorMode(current) {
  const i = MODES.indexOf(parseColorMode(current));
  return MODES[(i + 1) % MODES.length];
}

/** @param {"auto"|"light"|"dark"} mode */
export function colorModeLabel(mode) {
  const m = parseColorMode(mode);
  if (m === "light") return "Claro";
  if (m === "dark") return "Escuro";
  return "Automático";
}

/** @param {"auto"|"light"|"dark"} mode */
export function colorModeToggleHint(mode) {
  const next = cycleColorMode(mode);
  return `Tema ${colorModeLabel(mode)}. Toque para ${colorModeLabel(next).toLowerCase()}.`;
}

/**
 * @param {Document} [doc]
 * @param {{ onApply?: () => void }} [hooks]
 */
export function initColorMode(doc = document, hooks = {}) {
  const view = doc.defaultView ?? globalThis;
  const storage = view.localStorage;

  const apply = () => {
    applyColorModeToRoot(doc.documentElement, readColorMode(storage));
    hooks.onApply?.();
  };

  apply();

  const mq = view.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq) {
    const onScheme = () => {
      if (readColorMode(storage) === "auto") hooks.onApply?.();
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onScheme);
    else mq.addListener(onScheme);
  }

  return {
    apply,
    getMode: () => readColorMode(storage),
    setMode(mode) {
      writeColorMode(storage, mode);
      apply();
    },
  };
}
