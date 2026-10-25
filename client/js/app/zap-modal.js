/** @file Pix zap modal UI. */

import * as render from "../render.js";
import * as share from "../share.js";
import * as brcode from "../brcode.js";

export function getOrCreateZapModalContainer() {
  let container = document.getElementById("zap-modal-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "zap-modal-container";
    document.body.appendChild(container);
  }
  return container;
}

export function openZapModal({ pixKey, authorName = "Autor", title = "", defaultAmount = 5 } = {}) {
  if (!pixKey) return;
  const container = getOrCreateZapModalContainer();
  render.renderZapModal(container, { authorName, pixKey, title, defaultAmount });
  bindZapModalEvents(container, { pixKey, authorName });
}

export function bindZapModalEvents(container, { pixKey, authorName }) {
  const overlay = container.querySelector("#zap-modal-overlay");
  const area = container.querySelector("#zap-payload-area");
  const customContainer = container.querySelector(".zap-custom-container");
  const customInput = container.querySelector("#zap-custom-input");

  const update = (amt) => {
    try {
      area.value = brcode.buildPixPayload({ key: pixKey, name: authorName, amount: amt, description: "Apoio Vox" });
    } catch {
      area.value = pixKey;
    }
  };

  container.querySelectorAll(".btn-zap-val").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".btn-zap-val").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-outline");
      });
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");

      const val = btn.dataset.val;
      if (val === "custom") {
        if (customContainer) customContainer.style.display = "block";
        const customAmt = customInput ? brcode.parseNumericAmount(customInput.value) : null;
        update(customAmt);
      } else {
        if (customContainer) customContainer.style.display = "none";
        update(parseFloat(val));
      }
    });
  });

  if (customInput) {
    customInput.addEventListener("input", () => {
      const parsed = brcode.parseNumericAmount(customInput.value);
      update(parsed);
    });
  }

  const copyBtn = container.querySelector("#btn-copy-zap-payload");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const text = area?.value || pixKey;
      try {
        await navigator.clipboard.writeText(text);
        share.showToast("⚡ Pix Copia e Cola copiado! Cole no seu banco.");
      } catch {
        share.showToast(`Pix: ${text}`);
      }
      render.closeZapModal(container);
    });
  }

  const closeBtn = container.querySelector(".btn-close-zap");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => render.closeZapModal(container));
  }
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) render.closeZapModal(container);
    });
  }
}
