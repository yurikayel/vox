---
name: Sovereign Agora
colors:
  surface: '#111316'
  surface-dim: '#111316'
  surface-bright: '#37393d'
  surface-container-lowest: '#0c0e11'
  surface-container-low: '#1a1c1f'
  surface-container: '#1e2023'
  surface-container-high: '#282a2d'
  surface-container-highest: '#333538'
  on-surface: '#e2e2e6'
  on-surface-variant: '#bdc9c7'
  inverse-surface: '#e2e2e6'
  inverse-on-surface: '#2f3034'
  outline: '#879391'
  outline-variant: '#3e4948'
  surface-tint: '#78d6cf'
  primary: '#78d6cf'
  on-primary: '#003734'
  primary-container: '#4baca5'
  on-primary-container: '#003c38'
  inverse-primary: '#006a65'
  secondary: '#e7c26b'
  on-secondary: '#3e2e00'
  secondary-container: '#6e5301'
  on-secondary-container: '#eec971'
  tertiary: '#69dba9'
  on-tertiary: '#003825'
  tertiary-container: '#39b081'
  on-tertiary-container: '#003d28'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#94f3eb'
  primary-fixed-dim: '#78d6cf'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#00504c'
  secondary-fixed: '#ffdf97'
  secondary-fixed-dim: '#e7c26b'
  on-secondary-fixed: '#251a00'
  on-secondary-fixed-variant: '#5a4300'
  tertiary-fixed: '#86f8c4'
  tertiary-fixed-dim: '#69dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#111316'
  on-background: '#e2e2e6'
  surface-variant: '#333538'
typography:
  display:
    fontFamily: Domine
    fontSize: 3.5rem
    fontWeight: '600'
    lineHeight: 4rem
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Domine
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Domine
    fontSize: 2.5rem
    fontWeight: '500'
    lineHeight: 3rem
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Domine
    fontSize: 1.75rem
    fontWeight: '500'
    lineHeight: 2.25rem
    letterSpacing: 0em
  headline-md:
    fontFamily: Domine
    fontSize: 1.75rem
    fontWeight: '500'
    lineHeight: 2.25rem
    letterSpacing: 0em
  headline-sm:
    fontFamily: Domine
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: 0.02em
  title-monument:
    fontFamily: Domine
    fontSize: 1rem
    fontWeight: '700'
    lineHeight: 1.5rem
    letterSpacing: 0.15em
  body-lg:
    fontFamily: Work Sans
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
    letterSpacing: 0.01em
  body-md:
    fontFamily: Work Sans
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Work Sans
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
    letterSpacing: 0.02em
  label-sovereign:
    fontFamily: Work Sans
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.12em
  code-hash:
    fontFamily: Work Sans
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 2rem
  gutter-mobile: 1rem
  margin: 3rem
  margin-mobile: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
  space-2xl: 4rem
---

> **Origem:** especificação do pacote Stitch *Sovereign Agora* (antes em `stitch_vox_civic_network_interface/sovereign_agora/DESIGN.md`, removido em 2026-11). Implementação: `client/css/agora.css`. Decisão: [ADR-016](../adr/016-design-system-sovereign-agora-e-democracia-direta.md).


## Brand & Style

This design system translates the monumental civic presence of classical Athens—embodied by the Stoa of Attalos, fluted Pentelic marble colonnades, and Doric entablatures—into a peer-to-peer sovereign digital medium. It rejects the disposable, plasticized visual tropes of modern SaaS dashboards, replacing generic gray cards and rounded blobs with architectural permanence, sacred geometry, and deliberate civic gravitas.

Designed for citizens, governors, and cryptographic deliberators, the experience evokes intellectual clarity, timeless authority, and unshakeable consensus. The style operates as **Architectural Monolithicism**: a synthesis of dark noble backgrounds (representing the nocturnal serenity of the philosophical academy), warm marine-teal and antique bronze metalwork, and canonical cryptographic status accents. Interfaces feel excavated from stone rather than assembled from wireframes.

## Colors

The palette grounds the interface in mineral weight and cryptographic certainty:

- **Primary (`#4BACA5` - Marina Teal):** A commanding, sovereign marine teal that evokes classic verdigris and civic permanence. Applied to principal headings, high-order civic decisions, and foundational foreground markers.
- **Secondary (`#D1AE59` - Antique Doric Bronze):** Weathered imperial bronze honoring ancient civic stelae and currency. Used for ornamental borders, structural accents, active tabs, and secondary signifiers.
- **Tertiary (`#4BBF8F` - Sovereign Consensus Emerald):** A vibrant yet dignified emerald signaling network finality, active consensus, cryptographic quorum, and ratified proposals.
- **Neutral Base (`#121417` - Obsidian Basalt):** The deep, mineral foundation of the canvas, layered with surface tiers (`#181B20`, `#22262C`, `#2D323B`) that echo carved limestone blocks under shadow.

Containers and panels eschew generic flat grays; every surface is tonally tinted with warm mineral earth pigments at low saturation to evoke carved stone slabs.

## Typography

The typographic system builds deliberate tension between epigraphic classical stone-carving and sovereign digital cryptography:

- **Epigraphic Monumentality (`Domine`):** Used for architectural headings, grand civic propositions, and constitutional titles. In uppercase formats (`title-monument`), wide letter-spacing replicates lapidary inscriptions carved into temple architraves.
- **Deliberative Prose (`Work Sans`):** Delivers pristine readability for long-form parliamentary discourse, philosophical debate, and proposal descriptions without modern geometric distractions.
- **Cryptographic Protocol (`Work Sans`):** Provides sharp, structural precision for mathematical consensus, public key signatures, timestamps, block heights, and network tallies.

## Layout & Spacing

Layouts adhere to the columnar cadence of the Stoa of Attalos: a strict, rhythmic, peristyle grid system that mirrors the spacing and perspective of Doric peristyles.

- **Peristyle Rhythm (Colonnades):** Desktop views strictly honor an 8 or 12-column structural grid separated by continuous vertical hairline borders, translating the shadow and light patterns cast by columns into UI boundaries.
- **Proportional Entablatures:** Headers, navigation bars, and section dividers function as architectural entablatures—horizontal bands defined by crisp, subtle divisions rather than floating elevated islands.
- **Breakpoints:**
  - `Mobile` (< 640px): Compresses to a 4-column layout with collapsed vertical stylobates, prioritizing sequential deliberative reading.
  - `Tablet` (640px - 1024px): 8-column colonnade with dual-pane assembly (agenda alongside forum discourse).
  - `Desktop` (> 1024px): Full 12-column monumental colonnade, maintaining strict symmetrical bilateral balance and wide structural margins.

## Elevation & Depth

This design system avoids soft synthetic drop-shadows or generic modern card blurs. Elevation is conveyed strictly through architectural lithic stratification:

1. **Stylobate (Base Floor):** Deep obsidian ground featuring subtle horizontal limestone grain textures.
2. **Orthostates & Metopes (Panels):** Raised panels do not float in mid-air; they rest directly on the architectural grid, defined by hairline fluting lines and inset bronze bevels.
3. **Fluted Shadowplay:** When depth must be signified on interactive modals or flyout tablets, it employs directional, hard-edge chiseled shadows mimicking direct Mediterranean sunlight across fluted columns.
4. **Bronze Filigree Accents:** P2P quorum triggers and active voting tokens receive a micro-halo of amber bronze illumination.

## Shapes

The shape system employs a balanced, rounded architectural geometry (`2` - 0.5rem base radius). 

Classical stone architecture meets modern precision; elements incorporate controlled, moderate curves while maintaining structural integrity. Buttons, inputs, dialogs, badges, and status chips are constructed with clean geometry.

Where decorative geometry occurs, it borrows strictly from classical Greek triglyphs, entablatures, and beveled pediments, maintaining an enduring monumental authority.

## Components

### Buttons & Epigraphic Triggers
- **Primary Sovereign Action:** Squared slab background in marine teal (`#4BACA5`) with deep obsidian typography, set in bold uppercase with expanded tracking. Hover transitions trigger an internal antique bronze border glow (`#D1AE59`) and a tactile 1px downward shift.
- **Secondary Bronze Inscription:** Transparent background encased in a crisp 1px Doric bronze frame (`#D1AE59`), filled with clean text.
- **Consensus & Veto Actions:** Emerald (`#4BBF8F`) for constitutional ratification; oxidized terracotta crimson for dissent, both boxed in sharp, chiseled borders.

### Cards & Deliberative Tablets
- Generic floating gray cards are replaced with **Lithic Tablets**: bordered blocks framed by subtle 1px borders and anchored at top and bottom by micro-entablature stripes.
- Hover states subtly brighten the stone background tone while illuminating the vertical left column border in Doric bronze.

### Inputs & Civic Registries
- Input fields are styled as carved inscriptions into the basalt foundation. A solid bottom baseline (`2px solid rgba(209, 174, 89, 0.4)`) with faint side guides. On focus, the baseline illuminates to vibrant consensus bronze or marine teal.

### Chips, Badges & Quorum Indicators
- Monospaced, rectangular stone stamps. Quorum badges feature a leading solid square pylon indicator (green `#4BBF8F` or teal `#4BACA5`) rather than rounded dots.

### Architectural Divisors & Colonnades
- Replaces generic `<hr>` lines with **Entablature Friezes**: dual hairlines enclosing small central geometric rhombuses or Greek key glyph markers, creating visual rhythm across deliberative chambers.