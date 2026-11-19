/**
 * @file Comprime arquivo raster para JPEG data URL (DM, avatar de comunidade).
 * @module shared/raster-file-to-jpeg
 */

const RASTER_MIMES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Indica se o MIME é raster suportado (não SVG).
 * @param {string} mime
 * @returns {boolean}
 */
export function isRasterImageMime(mime) {
  return RASTER_MIMES.includes(String(mime || "").toLowerCase());
}

/**
 * Comprime `File` para JPEG em data URL via canvas.
 * @param {File|Blob} file Arquivo de imagem raster.
 * @param {{ maxEdge?: number, quality?: number }} [options]
 * @returns {Promise<string>}
 */
export function compressRasterFileToJpegDataUrl(file, { maxEdge = 380, quality = 0.56 } = {}) {
  const mime = String(file?.type || "").toLowerCase();
  if (!isRasterImageMime(mime)) {
    return Promise.reject(new Error("Formato não suportado. Use JPEG, PNG, WebP ou GIF."));
  }
  if (typeof document === "undefined" || !document.createElement) {
    return Promise.reject(new Error("Compressão indisponível neste ambiente."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}