export function showToast(message, type = "info") {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return;
  const existing = document.querySelector(".vox-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `vox-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("visible");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export async function shareTopic({ title, topicId, communityId }) {
  const url = `${window.location.origin}${window.location.pathname}#/t/${encodeURIComponent(topicId)}`;
  const text = `"${title}" — Veja e debata no Vox Brasil:`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${title} | Vox`,
        text,
        url,
      });
      showToast("Compartilhado com sucesso!");
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("Link copiado para a área de transferência!");
    return true;
  } catch {
    showToast("Não foi possível copiar o link.", "error");
    return false;
  }
}

export async function shareCommunity({ title, communityId }) {
  const url = `${window.location.origin}${window.location.pathname}#/c/${encodeURIComponent(communityId)}`;
  const text = `Participe da comunidade "${title}" no Vox Brasil:`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${title} | Comunidade Vox`,
        text,
        url,
      });
      showToast("Compartilhado com sucesso!");
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("Link da comunidade copiado!");
    return true;
  } catch {
    showToast("Não foi possível copiar o link.", "error");
    return false;
  }
}

export async function shareConnect({ routeId, displayName = "" }) {
  const url = `${window.location.origin}${window.location.pathname}#/connect/${encodeURIComponent(routeId)}`;
  const who = displayName || routeId.slice(0, 12);
  const text = `Conecte com ${who} no Vox:`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `${who} | Vox`, text, url });
      showToast("Link compartilhado!");
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("Link #/connect copiado!");
    return true;
  } catch {
    showToast("Não foi possível copiar o link.", "error");
    return false;
  }
}

export async function shareListing({ title, communityId, priceLabel = "" }) {
  const commPart = communityId ? `#/c/${encodeURIComponent(communityId)}?tab=listings` : "#/";
  const url = `${window.location.origin}${window.location.pathname}${commPart}`;
  const priceText = priceLabel ? ` por ${priceLabel}` : "";
  const text = `Oferta "${title}"${priceText} na Feira do Vox Brasil:`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${title} | Feira Vox`,
        text,
        url,
      });
      showToast("Oferta compartilhada!");
      return true;
    } catch (e) {
      if (e.name === "AbortError") return false;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast("Link da oferta copiado!");
    return true;
  } catch {
    showToast("Não foi possível copiar o link.", "error");
    return false;
  }
}
