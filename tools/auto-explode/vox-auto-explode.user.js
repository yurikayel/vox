// ==UserScript==
// @name         Vox Auto-Explode (Disparo Automático em 1 Toque)
// @namespace    https://yurikayel.github.io/vox/
// @version      1.0.0
// @description  Confirma automaticamente a publicação nas abas abertas pelo botão EXPLODE! do Vox (#vox-explode=1) usando sua sessão já autenticada.
// @match        https://twitter.com/intent/tweet*
// @match        https://x.com/intent/tweet*
// @match        https://bsky.app/intent/compose*
// @match        https://www.threads.net/intent/post*
// @match        https://www.threads.com/intent/post*
// @run-at       document-idle
// @grant        window.close
// ==/UserScript==

(function () {
  "use strict";

  if (!String(window.location.hash || "").includes("vox-explode=1")) return;

  const SELECTORS = [
    '[data-testid="tweetButton"]:not([aria-disabled="true"])',
    '[data-testid="composerPublishBtn"]:not([disabled])',
    'button[aria-label="Publish"]:not([disabled])',
    'button[aria-label="Publicar"]:not([disabled])',
  ];

  function findThreadsPostButton() {
    const buttons = document.querySelectorAll('div[role="dialog"] div[role="button"], button');
    for (const btn of buttons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      if ((text === "postar" || text === "post" || text === "publicar") && btn.getAttribute("aria-disabled") !== "true") {
        return btn;
      }
    }
    return null;
  }

  function findPublishButton() {
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    if (window.location.hostname.includes("threads.")) {
      return findThreadsPostButton();
    }
    return null;
  }

  let submitted = false;
  let attempts = 0;
  const maxAttempts = 40;

  const timer = setInterval(() => {
    attempts += 1;
    if (submitted || attempts > maxAttempts) {
      clearInterval(timer);
      return;
    }
    const btn = findPublishButton();
    if (btn && typeof btn.click === "function") {
      submitted = true;
      clearInterval(timer);
      setTimeout(() => {
        btn.click();
        setTimeout(() => {
          try { window.close(); } catch {}
        }, 1400);
      }, 350);
    }
  }, 250);
})();
