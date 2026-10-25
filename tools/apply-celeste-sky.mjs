import fs from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "client");

function patchCss() {
  const p = path.join(client, "css/style.css");
  let css = fs.readFileSync(p, "utf8");
  if (css.includes("--brand-navy: var(--brand-chrome)")) return;
  css = css.replace("--brand-navy: #312183;", `--brand-chrome: #0284c7;
  --brand-chrome-hover: #0369a1;
  --brand-navy: var(--brand-chrome);`);
  css = css.replace("--brand-blue: #2b5fb8;", "--brand-blue: #0369a1;");
  css = css.replace("--theme-chrome: var(--brand-navy);", "--theme-chrome: var(--brand-chrome);");
  css = css.replace("--bg: #f5f3ef;", "--bg: #f0f9ff;");
  css = css.replace(
    `  --link: var(--brand-blue);
  --accent: var(--brand-blue);
  --accent-soft: rgba(43, 95, 184, 0.1);
  --accent-hover: #234a94;
  --accent-glow: none;
  --accent-gradient: linear-gradient(135deg, #234a94 0%, var(--brand-green) 100%);`,
    `  --link: var(--brand-blue);
  --accent: #0ea5e9;
  --accent-soft: rgba(14, 165, 233, 0.12);
  --accent-hover: #0284c7;
  --accent-glow: none;
  --accent-gradient: linear-gradient(135deg, #0284c7 0%, var(--brand-green) 100%);`
  );
  css = css.replace(
    `@media (prefers-color-scheme: dark) {
  :root {
    --theme-chrome: #0c0a18;
    --bg: #0c0a18;
    --surface-1: #12101f;
    --surface-2: #181624;
    --surface-3: #222030;
    --outline: #3d3a48;`,
    `@media (prefers-color-scheme: dark) {
  :root {
    --brand-chrome: #38bdf8;
    --brand-chrome-hover: #7dd3fc;
    --theme-chrome: #0a1628;
    --bg: #0a1628;
    --surface-1: #0f1d2e;
    --surface-2: #152536;
    --surface-3: #1a2d42;
    --outline: #2d4a66;`
  );
  css = css.replace(`    --overlay: rgba(8, 6, 20, 0.78);`, `    --overlay: rgba(6, 14, 28, 0.78);`);
  css = css.replace(
    `    --accent-gradient: linear-gradient(135deg, #2b5fb8 0%, var(--success) 100%);`,
    `    --accent-gradient: linear-gradient(135deg, #0ea5e9 0%, var(--success) 100%);`
  );
  css = css.replaceAll("background: #261a6a;", "background: var(--brand-chrome-hover);");
  const skyBlock = `
:root[data-sky-period="madrugada"] {
  --brand-chrome: #1e4976;
  --brand-chrome-hover: #163a5f;
  --theme-chrome: #1e4976;
  --bg: #eef4fb;
  --accent: #3b82f6;
}

:root[data-sky-period="manha"] {
  --brand-chrome: #0284c7;
  --brand-chrome-hover: #0369a1;
  --theme-chrome: #0284c7;
  --bg: #f0f9ff;
  --accent: #0ea5e9;
}

:root[data-sky-period="tarde"] {
  --brand-chrome: #0369a1;
  --brand-chrome-hover: #075985;
  --theme-chrome: #0369a1;
  --bg: #ecfeff;
  --accent: #0891b2;
}

:root[data-sky-period="entardecer"] {
  --brand-chrome: #0e7490;
  --brand-chrome-hover: #155e75;
  --theme-chrome: #0e7490;
  --bg: #f0fdfa;
  --accent: #14b8a6;
}

:root[data-sky-period="noite"] {
  --brand-chrome: #1d4ed8;
  --brand-chrome-hover: #1e40af;
  --theme-chrome: #1e3a8a;
  --bg: #eff6ff;
  --accent: #2563eb;
}

@media (prefers-color-scheme: dark) {
  :root[data-sky-period="madrugada"] {
    --brand-chrome: #67e8f9;
    --brand-chrome-hover: #a5f3fc;
    --theme-chrome: #0c1929;
    --bg: #070d14;
    --surface-1: #0c1826;
    --surface-2: #101f30;
    --surface-3: #152a3d;
  }

  :root[data-sky-period="manha"] {
    --brand-chrome: #7dd3fc;
    --brand-chrome-hover: #bae6fd;
    --theme-chrome: #0a1628;
    --bg: #0a1628;
    --surface-1: #0f1d2e;
  }

  :root[data-sky-period="tarde"] {
    --brand-chrome: #38bdf8;
    --brand-chrome-hover: #7dd3fc;
    --theme-chrome: #0b1a2e;
    --bg: #0b1a2e;
    --surface-1: #102033;
  }

  :root[data-sky-period="entardecer"] {
    --brand-chrome: #22d3ee;
    --brand-chrome-hover: #67e8f9;
    --theme-chrome: #0f2038;
    --bg: #0f2038;
    --surface-1: #142840;
  }

  :root[data-sky-period="noite"] {
    --brand-chrome: #60a5fa;
    --brand-chrome-hover: #93c5fd;
    --theme-chrome: #081422;
    --bg: #081422;
    --surface-1: #0d1a2c;
  }
}
`;
  if (!css.includes("data-sky-period")) {
    css = css.replace(
      `@supports not (backdrop-filter: blur(1px)) {`,
      `${skyBlock}

@supports not (backdrop-filter: blur(1px)) {`
    );
  }
  fs.writeFileSync(p, css, "utf8");
}

function patchApp() {
  const p = path.join(client, "js/app.js");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("sky-theme.js")) {
    s = s.replace(
      `/** @file Vox client entry — boot and route wiring. */
import * as demoSeed from "./demo-seed.js";`,
      `/** @file Vox client entry — boot and route wiring. */
import { initSkyTheme } from "./sky-theme.js";
import * as demoSeed from "./demo-seed.js";`
    );
  }
  if (!s.includes("initSkyTheme();")) {
    s = s.replace("wireRoute();", "initSkyTheme();\nwireRoute();");
  }
  fs.writeFileSync(p, s, "utf8");
}

function patchSw() {
  const p = path.join(client, "sw.js");
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/const CACHE_NAME = "vox-pwa-v[^"]+";/, 'const CACHE_NAME = "vox-pwa-v6.49-celeste-sky-theme";');
  if (!s.includes("./js/sky-theme.js")) {
    s = s.replace(
      `  "./js/share.js",
  "./js/steward-wizard.js",`,
      `  "./js/share.js",
  "./js/sky-theme.js",
  "./js/steward-wizard.js",`
    );
  }
  fs.writeFileSync(p, s, "utf8");
}

function patchHtmlMeta() {
  const index = path.join(client, "index.html");
  let s = fs.readFileSync(index, "utf8");
  s = s.replace(/content="#312183" media="\(prefers-color-scheme: light\)"/, 'content="#0284c7" media="(prefers-color-scheme: light)"');
  s = s.replace(/content="#0c0a18" media="\(prefers-color-scheme: dark\)"/, 'content="#0a1628" media="(prefers-color-scheme: dark)"');
  fs.writeFileSync(index, s, "utf8");
  const manifest = path.join(client, "manifest.webmanifest");
  let m = fs.readFileSync(manifest, "utf8");
  m = m.replace('"theme_color": "#312183"', '"theme_color": "#0284c7"');
  fs.writeFileSync(manifest, m, "utf8");
}

patchCss();
patchApp();
patchSw();
patchHtmlMeta();
console.log("celeste sky patches applied");
