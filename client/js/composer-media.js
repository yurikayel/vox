import * as mediaLofi from "./media-lofi.js";
import { isDataUrl } from "./media-blob.js";
/** Limites de mídia do compositor inline (client-side, antes do data URL). */

export const COMPOSER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMPOSER_IMAGE_ALLOWED_MIMES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
/** 0 desliga o teto de pixels; padrão 4096 no lado maior. */
export const COMPOSER_IMAGE_MAX_DIMENSION = 4096;

const MIME_LABEL = "JPEG, PNG, WebP ou GIF";

function maxBytesLabel() {
  const mb = COMPOSER_IMAGE_MAX_BYTES / (1024 * 1024);
  return mb >= 1 ? `${mb} MB` : `${Math.round(COMPOSER_IMAGE_MAX_BYTES / 1024)} KB`;
}

export function validateComposerImageFile(file) {
  if (!file) return { ok: false, message: "Nenhum arquivo selecionado." };
  const mime = String(file.type || "").toLowerCase();
  if (!COMPOSER_IMAGE_ALLOWED_MIMES.includes(mime)) {
    return {
      ok: false,
      message: `Formato não suportado. Use ${MIME_LABEL}.`,
    };
  }
  const size = Number(file.size) || 0;
  if (size > COMPOSER_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: `Imagem muito grande. Máximo: ${maxBytesLabel()}.`,
    };
  }
  if (size <= 0) {
    return { ok: false, message: "Arquivo de imagem vazio ou inválido." };
  }
  return { ok: true };
}

export function validateComposerImageDimensions(width, height) {
  const max = COMPOSER_IMAGE_MAX_DIMENSION;
  if (!max || max <= 0) return { ok: true };
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const longest = Math.max(w, h);
  if (longest <= max) return { ok: true };
  return {
    ok: false,
    message: `Imagem muito grande nas dimensões. Máximo: ${max} px no lado maior.`,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

function measureDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Não foi possível decodificar a imagem."));
    img.src = dataUrl;
  });
}

export async function readComposerImageFromFile(file) {
  const pre = validateComposerImageFile(file);
  if (!pre.ok) return pre;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    if (COMPOSER_IMAGE_MAX_DIMENSION > 0) {
      const dims = await measureDataUrlImage(dataUrl);
      const dimCheck = validateComposerImageDimensions(dims.width, dims.height);
      if (!dimCheck.ok) return dimCheck;
    }
    return { ok: true, dataUrl };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || "Não foi possível processar a imagem.",
    };
  }
}

export async function processComposerLofiImage(fileOrDataUrl, { filter = "normal" } = {}) {
  let dataUrl = "";
  if (typeof fileOrDataUrl === "string") {
    dataUrl = fileOrDataUrl;
  } else if (fileOrDataUrl && typeof fileOrDataUrl.slice === "function") {
    dataUrl = await readFileAsDataUrl(fileOrDataUrl);
  } else {
    return { ok: false, message: "Arquivo inválido para processamento Lo-Fi." };
  }

  if (!isDataUrl(dataUrl)) {
    return { ok: false, message: "Formato de imagem inválido." };
  }

  if (typeof document === "undefined" || !document.createElement) {
    return { ok: true, dataUrl, byteLength: dataUrl.length, filter, isUnder99Kb: true };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const { width, height } = mediaLofi.calculateConstrainedDimensions(
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          mediaLofi.LOFI_LIMITS.PHOTO_MAX_DIMENSION
        );
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        mediaLofi.applyLofiFilter(ctx, width, height, filter);

        const clamped = mediaLofi.compressCanvasWithClamp(canvas, {
          quality: mediaLofi.LOFI_LIMITS.PHOTO_DEFAULT_QUALITY,
          maxBytes: mediaLofi.LOFI_LIMITS.PHOTO_MAX_BYTES,
        });

        resolve({
          ok: true,
          dataUrl: clamped.dataUrl,
          byteLength: clamped.byteLength,
          width,
          height,
          filter,
          isUnder99Kb: clamped.byteLength <= mediaLofi.LOFI_LIMITS.PHOTO_MAX_BYTES,
        });
      } catch (err) {
        resolve({ ok: true, dataUrl, byteLength: dataUrl.length, filter, isUnder99Kb: true });
      }
    };
    img.onerror = () => resolve({ ok: false, message: "Falha ao decodificar imagem para compressão Lo-Fi." });
    img.src = dataUrl;
  });
}
