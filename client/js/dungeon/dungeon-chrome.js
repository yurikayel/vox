/**
 * @file Moldura visual isolada ("Círculo Mágico") do AI Social Dungeon, segregada do feed cívico do Vox.
 */
import { escapeHtml } from "../shared/html.js";
import { dungeonIcon } from "./rpg-illustrations.js";
import {
  chromeVariantForMode,
  resolveSessionMode,
  visibleChromeTabs,
} from "./dungeon-ui-contract.js";

/**
 * Gera os links e rótulos das 4 telas dedicadas do AI Social Dungeon.
 *
 * @param {string} [tableId="vila-nova"] Identificador da mesa atual.
 * @param {string} [charId="lyra"] Identificador da ficha atual.
 * @returns {Array<{id: string, label: string, shortLabel: string, href: string, icon: string}>} Lista de abas.
 */
export function buildDungeonTabs(tableId = "vila-nova", charId = "lyra") {
  const safeTable = encodeURIComponent(tableId || "vila-nova");
  const safeChar = encodeURIComponent(charId || "lyra");
  return [
    { id: "acampamento", label: "Acampamento", shortLabel: "Acampamento", href: "#/dungeon", icon: "flame" },
    { id: "mesa", label: "Mapa", shortLabel: "Mapa", href: `#/dungeon/mesa/${safeTable}`, icon: "sword" },
    { id: "ficha", label: "Grimório", shortLabel: "Grimório", href: `#/dungeon/ficha/${safeChar}`, icon: "scroll" },
    { id: "mestre", label: "Escudo", shortLabel: "Escudo", href: `#/dungeon/mestre/${safeTable}`, icon: "eye" },
  ];
}

function renderTabLink(tab, activeTab, mobile) {
  const isActive = tab.id === activeTab;
  const cls = mobile ? "dungeon-dock-link" : "dungeon-nav-link";
  const activeCls = isActive ? " is-active" : "";
  const currentAttr = isActive ? ` aria-current="page"` : "";
  const label = mobile ? tab.shortLabel : tab.label;
  return `<a class="${cls}${activeCls}" href="${escapeHtml(tab.href)}"${currentAttr}>${dungeonIcon(tab.icon, mobile ? 18 : 16)}<span>${escapeHtml(label)}</span></a>`;
}

function renderSanctumFrame({ activeTab, mode, variantClass, onlineCount, desktopNav, mobileDock, bodyHtml }) {
  return `
    <div class="dungeon-sanctum${variantClass}" data-dungeon-screen="${escapeHtml(activeTab)}" data-dungeon-ui-mode="${escapeHtml(mode)}">
      <div class="dungeon-segregation-strip" role="note">
        <a class="dungeon-exit-link" href="#/">${dungeonIcon("arrowLeft", 15)}<span>Sair do Subversus · Voltar ao Vox</span></a>
        <span class="dungeon-fiction-badge">DEMONSTRAÇÃO · ROTEIRO FIXO, SEM IA E SEM REDE (ISOLADO DO FEED CÍVICO)</span>
        <span class="sr-only">Subversus VTT · Lab AI Social Dungeon</span>
      </div>
      <header class="dungeon-topbar">
        <div class="dungeon-brand-group">
          <a class="dungeon-brand" href="#/dungeon">${dungeonIcon("flame", 20)}<span>SUBVERSUS</span></a>
          <span class="dungeon-guardians-pill" aria-live="polite">${onlineCount} guardiões de exemplo</span>
        </div>
        <nav class="dungeon-topnav" aria-label="Navegação do Subversus">${desktopNav}</nav>
      </header>
      <main class="dungeon-main" id="dungeon-main">
        <p class="dungeon-demo-note" role="note">Laboratório: esta mesa é uma demonstração. A narração é um roteiro fixo (ainda não há IA), os outros jogadores e guardiões são de exemplo e nada sai desta aba.</p>
        ${bodyHtml}</main>
      <footer class="dungeon-footer">
        <p>Demonstração local: tudo acontece só nesta aba, sem rede e sem servidor. Histórias de mesa nunca se misturam às votações cívicas do Vox.</p>
      </footer>
      <nav class="dungeon-mobile-dock" aria-label="Atalhos da Mesa">${mobileDock}</nav>
    </div>`;
}

/**
 * Envolve o conteúdo da tela de RPG na moldura segregada `.dungeon-sanctum`.
 * Garante distinção visual clara entre ficção colaborativa P2P e o feed cívico da Ágora.
 *
 * @param {object} opts Opções da moldura.
 * @param {string} opts.activeTab Identificador da aba ativa (`acampamento`|`mesa`|`ficha`|`mestre`).
 * @param {string} [opts.tableId="vila-nova"] Identificador da mesa em foco.
 * @param {string} [opts.charId="lyra"] Identificador da ficha em foco.
 * @param {number} [opts.guardiansOnline=5] Quantidade de guardiões de exemplo mostrados.
 * @param {string} [opts.viewerRole="player"] Papel local (`player`|`gm`) para cromo de sessão.
 * @param {string} opts.bodyHtml HTML principal renderizado para a sub-tela ativa.
 * @returns {string} Documento completo da rota segregada AI Social Dungeon.
 */
export function renderDungeonChrome({
  activeTab,
  tableId = "vila-nova",
  charId = "lyra",
  guardiansOnline = 5,
  viewerRole = "player",
  bodyHtml,
}) {
  const mode = resolveSessionMode(activeTab, viewerRole);
  const isGm = viewerRole === "gm";
  const allowed = new Set(visibleChromeTabs(mode, isGm));
  const tabs = buildDungeonTabs(tableId, charId).filter((t) => allowed.has(t.id));
  const variant = chromeVariantForMode(mode);
  const variantClass = variant === "default" ? "" : ` is-${variant}`;
  const desktopNav = tabs.map((t) => renderTabLink(t, activeTab, false)).join("");
  const mobileDock = tabs.map((t) => renderTabLink(t, activeTab, true)).join("");
  const onlineCount = Number.isFinite(Number(guardiansOnline)) ? Number(guardiansOnline) : 5;
  return renderSanctumFrame({
    activeTab,
    mode,
    variantClass,
    onlineCount,
    desktopNav,
    mobileDock,
    bodyHtml,
  });
}