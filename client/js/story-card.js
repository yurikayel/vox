/** @file Gerador de Card Visual 9:16 para Instagram Stories e TikTok — Zero npm, HTML5 Canvas nativo. */

import { encodeVoxUrl } from "./qr-url.js";
import { buildCanonicalTopicUrl } from "./posse-dispatch.js";

export const STORY_CARD_WIDTH = 540;
export const STORY_CARD_HEIGHT = 960;

export function wrapTextLines(ctx, text, maxWidth, maxLines = 4) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  if (lines.length === maxLines) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, -3)}…` : last;
  }
  return lines;
}

function drawCardBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1c1917");
  grad.addColorStop(0.5, "#0c0a09");
  grad.addColorStop(1, "#18181b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, w - 32, h - 32);

  ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
  ctx.fillRect(16, 16, w - 32, 8);
}

function drawCardHeader(ctx, w) {
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("📢 VOX • PRAÇA CÍVICA SOBERANA", w / 2, 60);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 80);
  ctx.lineTo(w - 40, 80);
  ctx.stroke();
}

function drawQuoteBox(ctx, body, title, w, startY) {
  const cleanBody = (body || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  if (!cleanBody || cleanBody === title) return startY;

  const y = startY + 16;
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(36, y, w - 72, 170);
  ctx.strokeStyle = "rgba(245, 158, 11, 0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, y, w - 72, 170);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "italic 18px serif";
  const bodyLines = wrapTextLines(ctx, `"${cleanBody}"`, w - 110, 4);
  let quoteY = y + 36;
  for (const bline of bodyLines) {
    ctx.fillText(bline, 54, quoteY);
    quoteY += 28;
  }
  return y + 180;
}

function drawCardContent(ctx, title, body, author, w) {
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  const titleLines = wrapTextLines(ctx, title || "Mobilização Cívica no Vox", w - 80, 4);
  let y = 130;
  for (const line of titleLines) {
    ctx.fillText(line, 40, y);
    y += 34;
  }

  y = drawQuoteBox(ctx, body, title, w, y);
  y += 24;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 16px sans-serif";
  const cleanAuthor = String(author || "Cidadão Vox").replace(/^@/, "");
  ctx.fillText(`✍️ Por @${cleanAuthor}`, 40, y);
  return y;
}

function drawQrModules(ctx, modules, startX, startY, pxSize) {
  const modCount = modules.length;
  const qrDim = modCount * pxSize;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(startX - 8, startY - 8, qrDim + 16, qrDim + 16);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (modules[r][c]) {
        ctx.fillRect(startX + c * pxSize, startY + r * pxSize, pxSize, pxSize);
      }
    }
  }
}

function drawQrCodeSection(ctx, url, w, h) {
  try {
    const encoded = encodeVoxUrl(url);
    const pxSize = 4;
    const qrDim = encoded.modules.length * pxSize;
    const startX = 40;
    const startY = h - qrDim - 80;

    drawQrModules(ctx, encoded.modules, startX, startY, pxSize);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Aponte a câmera 📲", startX + qrDim + 24, startY + 36);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px sans-serif";
    ctx.fillText("Participe do debate e vote", startX + qrDim + 24, startY + 64);
    ctx.fillText("na praça pública soberana.", startX + qrDim + 24, startY + 86);
  } catch {}
}

function drawCardFooter(ctx, w, h) {
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = "12px sans-serif";
  ctx.fillText("VOX • 100% Livre de Algoritmos de Ódio e Vigilância", w / 2, h - 30);
}

export function renderStoryCardCanvas(post) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = STORY_CARD_WIDTH;
  canvas.height = STORY_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const url = post?.canonicalUrl || buildCanonicalTopicUrl(post?.id, { communityId: post?.communityId });
  drawCardBackground(ctx, STORY_CARD_WIDTH, STORY_CARD_HEIGHT);
  drawCardHeader(ctx, STORY_CARD_WIDTH);
  drawCardContent(ctx, post?.title, post?.body, post?.author, STORY_CARD_WIDTH);
  drawQrCodeSection(ctx, url, STORY_CARD_WIDTH, STORY_CARD_HEIGHT);
  drawCardFooter(ctx, STORY_CARD_WIDTH, STORY_CARD_HEIGHT);

  return canvas;
}

export function downloadStoryCardPng(canvas, filename = "story-card-vox.png") {
  if (!canvas || typeof document === "undefined") return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function copyStoryCardToClipboard(post) {
  const canvas = renderStoryCardCanvas(post);
  if (!canvas) return { ok: false, reason: "canvas_unavailable" };

  let imageCopied = false;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        imageCopied = true;
      }
    } catch {}
  }

  if (!imageCopied) {
    downloadStoryCardPng(canvas, `story-vox-${post?.id || "post"}.png`);
  }

  return { ok: true, imageCopied, canvas };
}
