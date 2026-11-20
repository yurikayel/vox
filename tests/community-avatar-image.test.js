/**
 * Foto/avatar de comunidade: compressão, SVG e teto na malha.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as cav from "../client/js/shared/community-avatar-image.js";

const SVG_DATA = "data:image/svg+xml;base64,PHN2Zy8+";
const PNG_DATA = "data:image/png;base64,AAAA";

test("community-avatar - recusa SVG e javascript na entrada", () => {
  assert.equal(cav.acceptCommunityAvatarDataUrl(SVG_DATA), "");
  assert.equal(cav.acceptCommunityAvatarDataUrl("javascript:alert(1)"), "");
  assert.equal(cav.validateCommunityAvatarFile({ type: "image/svg+xml", size: 10 }).ok, false);
});

test("community-avatar - aceita PNG pequeno e rejeita data URL gigante", () => {
  assert.equal(cav.acceptCommunityAvatarDataUrl(PNG_DATA), PNG_DATA);
  const b64Len = Math.ceil((cav.COMMUNITY_AVATAR_MAX_STORED_BYTES * 4) / 3) + 16;
  const huge = `data:image/png;base64,${"A".repeat(b64Len)}`;
  assert.ok(cav.dataUrlPayloadBytes(huge) > cav.COMMUNITY_AVATAR_MAX_STORED_BYTES);
  assert.equal(cav.acceptCommunityAvatarDataUrl(huge), "");
});

test("community-avatar - gossip da malha com SVG é rejeitado", () => {
  const bad = {
    type: "community_update",
    communityId: "c",
    image: SVG_DATA,
    avatar: SVG_DATA,
  };
  assert.equal(cav.communityGossipHasRejectedImages(bad), true);
  const clean = cav.sanitizeCommunityGossipImages(bad);
  assert.equal(clean.image, undefined);
  assert.equal(clean.avatar, undefined);
});

test("community-avatar - render usa sanitize no módulo de comunidade", async () => {
  const render = await import("../client/js/render.js");
  const html = render.renderCommunityAvatarHtml({ image: SVG_DATA, title: "X" }, "x");
  assert.ok(!html.includes("svg+xml"));
});

test("community-avatar - compose preview evita innerHTML dinâmico", () => {
  const composePath = fileURLToPath(new URL("../client/js/app/compose-community.js", import.meta.url));
  const src = readFileSync(composePath, "utf8");
  const fnBody = src.match(/function updateCommunityPhotoPreview[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(fnBody.length > 0, "updateCommunityPhotoPreview ausente");
  assert.ok(!fnBody.includes("innerHTML"), "preview não deve atribuir innerHTML com dados do usuário");
  assert.ok(fnBody.includes("textContent"), "fallback deve usar textContent");
});