/** LAN-16: URLs curtas (?h=slug ou subdomínio) viram #/h/slug. Script clássico; a CSP não permite script inline. */
// Suporte a URLs curtas: query ?h=slug ou subdomínio wildcard (*.comunidade.tld)
(function () {
  const q = new URLSearchParams(window.location.search);
  const qHandle = q.get("h") || q.get("handle");
  if (qHandle && (!window.location.hash || window.location.hash === "#/")) {
    window.location.hash = "#/h/" + encodeURIComponent(qHandle.replace(/^@/, "").toLowerCase());
  } else if (!window.location.hash || window.location.hash === "#/") {
    const host = window.location.hostname.toLowerCase();
    const isHostingPlatform = /pages\.dev$|github\.io$|workers\.dev$|vercel\.app$|netlify\.app$|localhost$|127\.0\.0\.1$/i.test(host);
    const parts = host.split(".");
    if (!isHostingPlatform && parts.length >= 3 && parts[0] !== "www" && !parts[0].startsWith("vox")) {
      window.location.hash = "#/h/" + encodeURIComponent(parts[0].toLowerCase());
    }
  }
})();
