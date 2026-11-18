/**
 * @file Proteção contra clickjacking no boot (THREAT-MODEL T33).
 *
 * O GitHub Pages não envia `frame-ancestors` nem `X-Frame-Options`; a meta CSP do
 * `index.html` não bloqueia moldura. Se o app não está no topo, esconde a UI e pede
 * abertura em aba própria antes do restante dos boots e do `app.js`.
 *
 * @see docs/THREAT-MODEL.md (T33)
 */
(function frameGuardBoot(global) {
  const GUARD_ID = "vox-frame-guard";
  const HIDE_IDS = ["app-root", "modal-container", "post-media-lightbox"];

  /**
   * Indica se a página roda embutida (iframe ou acesso cross-origin ao `top` negado).
   *
   * @param {Window} win Janela a inspecionar (normalmente `window`).
   * @returns {boolean} Verdadeiro quando não é a janela de topo.
   */
  function isFramed(win) {
    try {
      return win.top !== win;
    } catch {
      return true;
    }
  }

  /**
   * URL para abrir o Vox fora da moldura (`target="_top"`).
   *
   * @param {Window} win Janela com `location`.
   * @returns {string} Href atual.
   */
  function frameGuardHref(win) {
    return win.location.href;
  }

  /**
   * Esconde o shell do app e mostra aviso com link para abrir em aba própria.
   *
   * @param {Document} doc Documento da página.
   * @param {Window} win Janela da página.
   * @returns {boolean} Verdadeiro quando a proteção foi aplicada.
   */
  function applyFrameGuard(doc, win) {
    if (!doc || !win || !isFramed(win)) return false;

    for (const id of HIDE_IDS) {
      const el = doc.getElementById(id);
      if (el) el.setAttribute("hidden", "");
    }

    let banner = doc.getElementById(GUARD_ID);
    if (!banner) {
      banner = doc.createElement("div");
      banner.id = GUARD_ID;
      banner.setAttribute("role", "alert");
      banner.style.cssText =
        "max-width:28rem;margin:2rem auto;padding:1.25rem 1.5rem;" +
        "font:600 1rem/1.45 system-ui,sans-serif;";
      const msg = doc.createElement("p");
      msg.textContent =
        "Por segurança, o Vox não deve abrir dentro de outra página. Abra em uma aba própria.";
      msg.style.cssText = "margin:0 0 0.75rem";
      const link = doc.createElement("a");
      link.href = frameGuardHref(win);
      link.setAttribute("target", "_top");
      link.setAttribute("rel", "noopener noreferrer");
      link.textContent = "Abrir o Vox";
      banner.append(msg, link);
      if (doc.body) doc.body.prepend(banner);
    }

    if (doc.documentElement) doc.documentElement.setAttribute("data-vox-frame-guard", "");
    return true;
  }

  global.__VOX_FRAME_GUARD__ = { isFramed, frameGuardHref, applyFrameGuard, GUARD_ID, HIDE_IDS };

  if (!global.__VOX_FRAME_GUARD_SKIP_AUTO__ && global.document && global.location) {
    applyFrameGuard(global.document, global);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);