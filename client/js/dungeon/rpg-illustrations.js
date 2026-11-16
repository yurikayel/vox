/**
 * @file Ilustrações SVG offline e ícones arquitetônicos do AI Social Dungeon.
 * Zero dependências externas (CDNs, fontes remotas ou imagens de rede).
 */
import { escapeHtml } from "../shared/html.js";

const ICON_PATHS = {
  flame: `<path d="M12 3c2.5 3.2 5 5.4 5 9a5 5 0 1 1-10 0c0-2.1 1-4.1 2.2-5.6.3 1.4 1.2 2.2 2.1 2.6-.2-2 .1-4 .7-6Z"/>`,
  shield: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>`,
  sword: `<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/>`,
  scroll: `<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>`,
  casino: `<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/>`,
  lock: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  lockOpen: `<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>`,
  bolt: `<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>`,
  backpack: `<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10Z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 14h8"/>`,
  verified: `<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>`,
  beer: `<path d="M6 7h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z"/><path d="M15 9h2.5a2 2 0 0 1 0 4H15"/><path d="M6 7c0-1.5 1.5-2.5 3-2.5.8 0 1.4.3 2 .8.6-.5 1.2-.8 2-.8 1.5 0 2 1 2 2.5"/>`,
  arrowLeft: `<path d="m15 18-6-6 6-6"/>`,
  cpu: `<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>`,
  receipt: `<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>`,
  eye: `<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>`,
};

/**
 * Renderiza um ícone vetorial SVG offline da paleta Sovereign Agora.
 *
 * @param {string} name Identificador do ícone (`flame`, `shield`, `sword`, etc.).
 * @param {number} [size=18] Tamanho quadrado em pixels.
 * @returns {string} HTML `<svg>` acessível (`aria-hidden="true"`).
 */
export function dungeonIcon(name, size = 18) {
  const path = ICON_PATHS[name] || ICON_PATHS.flame;
  return `<svg class="dungeon-svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/**
 * Ilustração principal do Acampamento: Fogueira dos Guardiões em pedra arquitetônica.
 *
 * @returns {string} SVG inline offline sem requisições externas.
 */
export function renderCampfireSceneSvg() {
  return `<svg class="dungeon-hero-svg" viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fogueira dos Guardiões">
    <ellipse cx="120" cy="166" rx="88" ry="18" fill="#1a1c1f"/>
    <circle cx="120" cy="108" r="70" fill="#e7c26b" opacity="0.08"/>
    <circle cx="120" cy="112" r="46" fill="#78d6cf" opacity="0.07"/>
    <rect x="64" y="152" width="112" height="14" rx="4" transform="rotate(-7 120 159)" fill="#3b2f26"/>
    <rect x="66" y="154" width="108" height="14" rx="4" transform="rotate(8 120 161)" fill="#4a392d"/>
    <path d="M120 34C102 68 80 88 80 120c0 22 18 36 40 36s40-14 40-36c0-26-18-48-26-66-4 12-10 18-14-20Z" fill="#d97736"/>
    <path d="M120 56c-12 24-24 38-24 62 0 15 11 26 24 26s24-11 24-26c0-18-10-34-16-46-3 8-6 12-8-16Z" fill="#e7c26b"/>
    <path d="M120 84c-7 14-12 22-12 35 0 9 5 15 12 15s12-6 12-15c0-10-5-19-8-27-2 4-3 6-4-8Z" fill="#fff3c4"/>
    <circle cx="88" cy="70" r="2.5" fill="#e7c26b"/>
    <circle cx="152" cy="64" r="2" fill="#78d6cf"/>
    <circle cx="136" cy="42" r="2" fill="#e7c26b"/>
    <circle cx="102" cy="48" r="1.8" fill="#69dba9"/>
  </svg>`;
}

/**
 * Ilustração da cena atmosférica da Mesa: Arco da Cripta Subterrânea.
 *
 * @returns {string} SVG inline responsivo para o cabeçalho de cena da mesa.
 */
export function renderCavernArchSvg() {
  return `<svg class="dungeon-cavern-svg" viewBox="0 0 640 170" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cripta das Águas Sussurrantes">
    <rect width="640" height="170" fill="#101318"/>
    <path d="M0 170V30h165c12-14 42-22 155-22s143 8 155 22h165v140H0Z" fill="#1a1c1f"/>
    <path d="M180 170V74c0-38 62-58 140-58s140 20 140 58v96H180Z" fill="#0c0e11"/>
    <rect x="200" y="138" width="240" height="24" fill="#132f33"/>
    <ellipse cx="320" cy="144" rx="88" ry="6" fill="#78d6cf" opacity="0.28"/>
    <rect x="292" y="102" width="56" height="36" rx="2" fill="#282a2d"/>
    <circle cx="320" cy="96" r="10" fill="#e7c26b" opacity="0.85"/>
    <path d="M236 62c0-6 10-6 10 0M394 62c0-6 10-6 10 0" stroke="#78d6cf" stroke-width="2" fill="none"/>
  </svg>`;
}

/**
 * Renderiza o icosaedro vetorial D20 da Bandeja de Dados Commit-Reveal².
 *
 * @param {number|string} faceValue Valor atual do dado (`1`–`20` ou `?`).
 * @param {boolean} [committed=true] Indica se o dado tem compromisso criptográfico confirmado.
 * @returns {string} SVG do dado D20 centralizado.
 */
export function renderD20DieSvg(faceValue, committed = true) {
  const stroke = committed ? "#78d6cf" : "#e7c26b";
  const label = escapeHtml(String(faceValue ?? "?"));
  return `<svg class="dungeon-d20-svg" viewBox="0 0 110 110" width="92" height="92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dado D20 mostrando ${label}">
    <polygon points="55,6 98,30 98,80 55,104 12,80 12,30" fill="#1e2023" stroke="${stroke}" stroke-width="2.5"/>
    <polygon points="55,18 85,72 25,72" fill="#282a2d" stroke="#e7c26b" stroke-width="1.6"/>
    <line x1="55" y1="6" x2="55" y2="18" stroke="${stroke}" stroke-width="1.5"/>
    <line x1="12" y1="30" x2="55" y2="18" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <line x1="98" y1="30" x2="55" y2="18" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <line x1="12" y1="80" x2="25" y2="72" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <line x1="98" y1="80" x2="85" y2="72" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <line x1="55" y1="104" x2="25" y2="72" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <line x1="55" y1="104" x2="85" y2="72" stroke="${stroke}" stroke-width="1.2" opacity="0.6"/>
    <text x="55" y="61" text-anchor="middle" fill="#e7c26b" font-family="Georgia, serif" font-size="24" font-weight="700">${label}</text>
  </svg>`;
}

/**
 * Retrato vetorial offline de personagem para o Grimório da Ficha.
 *
 * @param {string} [badgeText="PAL"] Sigla curta do arquétipo do personagem.
 * @returns {string} SVG portrait offline sem URLs externas.
 */
export function renderHeroPortraitSvg(badgeText = "PAL") {
  const sig = escapeHtml(String(badgeText || "PAL").slice(0, 3).toUpperCase());
  return `<svg class="dungeon-portrait-svg" viewBox="0 0 120 120" width="96" height="96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Emblema de ${sig}">
    <rect width="120" height="120" rx="8" fill="#1a1c1f"/>
    <path d="M60 16 96 30v28c0 24-15 39-36 48-21-9-36-24-36-48V30l36-14Z" fill="#282a2d" stroke="#e7c26b" stroke-width="2"/>
    <path d="M60 32c-10 0-18 10-18 24v8h36v-8c0-14-8-24-18-24Z" fill="#1e2023" stroke="#78d6cf" stroke-width="1.5"/>
    <circle cx="60" cy="52" r="9" fill="#e7c26b" opacity="0.85"/>
    <text x="60" y="92" text-anchor="middle" fill="#78d6cf" font-family="monospace" font-size="11" font-weight="700">${sig}</text>
  </svg>`;
}

/**
 * Lacre criptográfico visual (Shamir 3-de-5) trancado ou revelado.
 *
 * @param {boolean} unlocked Indica se o segredo atingiu o quórum 3-de-5.
 * @returns {string} SVG de lacre em cera dourada (trancado) ou runa esmeralda (aberto).
 */
export function renderShamirSealSvg(unlocked) {
  const fill = unlocked ? "#003d28" : "#5c4400";
  const ring = unlocked ? "#69dba9" : "#e7c26b";
  const inner = unlocked
    ? `<polygon points="28,15 37,35 19,35" fill="#69dba9" opacity="0.9"/>`
    : `<rect x="21" y="25" width="14" height="11" rx="2" fill="#e7c26b"/><path d="M24 25v-4a4 4 0 0 1 8 0v4" stroke="#e7c26b" stroke-width="2" fill="none"/>`;
  return `<svg width="52" height="52" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="28" cy="28" r="24" fill="${fill}"/>
    <circle cx="28" cy="28" r="19" fill="none" stroke="${ring}" stroke-width="1.5" stroke-dasharray="3 3"/>
    ${inner}
  </svg>`;
}
