/** @file Light / dark / auto — parchment vs carbon; auto = OS prefers-color-scheme + sky clock. */

/** Chave de `localStorage` para preferência de tema (`light`, `dark` ou ausente = `auto`). */
export const VOX_COLOR_MODE_KEY = "vox-color-mode";

const MODES = Object.freeze(["auto", "light", "dark"]);

/**
 * Normaliza o modo de cor para o conjunto aceito.
 * @param {unknown} raw Valor bruto lido do storage ou UI.
 * @returns {"auto"|"light"|"dark"} Modo válido.
 */
export function parseColorMode(raw) {
  if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  return "auto";
}

/**
 * Lê o modo de cor salvo no `Storage` informado.
 * @param {Storage|null|undefined} storage Área de armazenamento.
 * @returns {"auto"|"light"|"dark"} Modo configurado.
 */
export function readColorMode(storage) {
  if (!storage) return "auto";
  return parseColorMode(storage.getItem(VOX_COLOR_MODE_KEY));
}

/**
 * Grava ou limpa (`auto`) a preferência de modo de cor.
 * @param {Storage|null|undefined} storage Área de armazenamento.
 * @param {string} mode Modo escolhido.
 * @returns {void}
 */
export function writeColorMode(storage, mode) {
  if (!storage) return;
  const m = parseColorMode(mode);
  if (m === "auto") storage.removeItem(VOX_COLOR_MODE_KEY);
  else storage.setItem(VOX_COLOR_MODE_KEY, m);
}

/**
 * Aplica `data-color-mode` e `color-scheme` no elemento raiz.
 * @param {HTMLElement} root Elemento raiz (`document.documentElement`).
 * @param {"auto"|"light"|"dark"} mode Modo alvo.
 * @returns {void}
 */
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

/**
 * Resolve se o tema efetivo deve ser escuro dado o modo e a preferência do sistema.
 * @param {"auto"|"light"|"dark"} mode Modo selecionado.
 * @param {boolean} prefersDark Preferência escura do sistema/relógio.
 * @returns {boolean} `true` para tema escuro.
 */
export function resolveEffectiveDark(mode, prefersDark) {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

/**
 * Avança ciclicamente entre `auto` -> `light` -> `dark`.
 * @param {string} current Modo atual.
 * @returns {"auto"|"light"|"dark"} Próximo modo do ciclo.
 */
export function cycleColorMode(current) {
  const i = MODES.indexOf(parseColorMode(current));
  return MODES[(i + 1) % MODES.length];
}

/**
 * Rótulo curto em pt-BR para exibição na interface.
 * @param {"auto"|"light"|"dark"} mode Modo atual.
 * @returns {"Claro"|"Escuro"|"Automático"} Rótulo traduzido.
 */
export function colorModeLabel(mode) {
  const m = parseColorMode(mode);
  if (m === "light") return "Claro";
  if (m === "dark") return "Escuro";
  return "Automático";
}

/**
 * Texto acessível de dica indicando o modo atual e o próximo toque.
 * @param {"auto"|"light"|"dark"} mode Modo atual.
 * @returns {string} Mensagem de dica para `aria-label`/`title`.
 */
export function colorModeToggleHint(mode) {
  const next = cycleColorMode(mode);
  return `Tema ${colorModeLabel(mode)}. Toque para ${colorModeLabel(next).toLowerCase()}.`;
}

/**
 * Inicializa o tema de cor no documento e escuta mudanças de `prefers-color-scheme`.
 * @param {Document} [doc=document] Documento alvo.
 * @param {{ onApply?: () => void }} [hooks={}] Callbacks ao aplicar ou mudar esquema do SO.
 * @returns {{ apply: () => void, getMode: () => "auto"|"light"|"dark", setMode: (mode: string) => void }} Controlador do modo de cor.
 */
export function initColorMode(doc = document, hooks = {}) {
  const view = doc.defaultView ?? globalThis;
  const storage = view.localStorage;

  /**
   * Aplica o modo de cor salvo ao documento e avisa o gancho `onApply`.
   */
  const apply = () => {
    applyColorModeToRoot(doc.documentElement, readColorMode(storage));
    hooks.onApply?.();
  };

  apply();

  const mq = view.matchMedia?.("(prefers-color-scheme: dark)");
  if (mq) {
    /**
     * Reaplica quando o esquema do sistema muda, se o modo for automático.
     */
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
