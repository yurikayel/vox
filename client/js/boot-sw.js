/** LAN-16: registra o Service Worker. Script clássico; a CSP não permite script inline. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("[vox boot-sw] service worker não registrou:", err);
    });
  });
}