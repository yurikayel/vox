/**
 * storage-persistence.js — Gestão de Persistência e Anti-Evicção Safari (Vox)
 *
 * Provê:
 * 1. Solicitação proativa de armazenamento persistente (navigator.storage.persist);
 * 2. Estimativa de quota e uso em disco (navigator.storage.estimate);
 * 3. Detecção de abas normais no Safari/WebKit (sujeitas ao ITP de 7 dias);
 * 4. Banner educativo nativo para instalação na Tela de Início (Home Screen).
 */

export const STORAGE_DISMISSED_KEY = "vox-safari-banner-dismissed-v1";

export async function requestPersistence() {
  if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
    try {
      const persisted = await navigator.storage.persist();
      return { persisted: Boolean(persisted), isSupported: true };
    } catch {
      return { persisted: false, isSupported: true };
    }
  }
  return { persisted: false, isSupported: false };
}

export async function checkPersistence() {
  if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persisted === "function") {
    try {
      return Boolean(await navigator.storage.persisted());
    } catch {
      return false;
    }
  }
  return false;
}

export async function estimateStorage() {
  if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.estimate === "function") {
    try {
      const est = await navigator.storage.estimate();
      const quota = est.quota || 0;
      const usage = est.usage || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;
      return {
        quota,
        usage,
        percentage: Number(percentage.toFixed(2)),
        isSupported: true,
      };
    } catch {
      return { quota: 0, usage: 0, percentage: 0, isSupported: true };
    }
  }
  return { quota: 0, usage: 0, percentage: 0, isSupported: false };
}

export function isStandaloneMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (window.navigator && window.navigator.standalone === true) return true;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

export function isSafariNormalTab(userAgent = "") {
  if (typeof navigator === "undefined" && !userAgent) return false;
  const ua = userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (!ua) return false;

  const isIosOrMac = /iPhone|iPad|iPod|Macintosh/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua);
  const isStandalone = isStandaloneMode();

  return isIosOrMac && isSafari && !isStandalone;
}

export function shouldShowSafariHomePrompt() {
  if (typeof localStorage === "undefined") return false;
  if (!isSafariNormalTab()) return false;
  try {
    return localStorage.getItem(STORAGE_DISMISSED_KEY) !== "true";
  } catch {
    return false;
  }
}

export function dismissSafariHomePrompt() {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(STORAGE_DISMISSED_KEY, "true");
    return true;
  } catch {
    return false;
  }
}

export function renderSafariHomeBannerHtml() {
  return `
    <div class="safari-home-banner" id="safariHomeBanner" role="region" aria-label="Alerta de instalação no Safari">
      <div class="banner-body">
        <span class="banner-badge">iOS / Safari</span>
        <p class="banner-text">
          Para proteger suas chaves e comunidades contra a <strong>limpeza automática de 7 dias do Safari (ITP)</strong>, adicione o Vox à sua <strong>Tela de Início</strong> (toque em <em>Compartilhar</em> &rarr; <em>Adicionar à Tela de Início</em>).
        </p>
      </div>
      <button type="button" class="banner-dismiss" id="btnDismissSafariBanner" aria-label="Entendido">Entendido</button>
    </div>
  `.trim();
}
