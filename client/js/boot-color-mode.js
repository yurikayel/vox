/** LAN-16: aplica o modo de cor salvo antes do primeiro paint (script clássico síncrono no head; a CSP não permite script inline). */
(function () {
  try {
    var m = localStorage.getItem("vox-color-mode");
    if (m === "light" || m === "dark") {
      document.documentElement.setAttribute("data-color-mode", m);
      document.documentElement.style.colorScheme = m;
    }
  } catch {
    /* modo de cor é só conveniência */
  }
})();
