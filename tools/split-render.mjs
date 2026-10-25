/** One-off: split render.js into render/ submodules by line ranges (1-indexed, inclusive). */
import fs from "fs";
import path from "path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcPath = path.join(repoRoot, "client/js/render.js");
const outDir = path.join(repoRoot, "client/js/render");
const lines = fs.readFileSync(srcPath, "utf8").split(/\r?\n/);

const chunks = {
  "util.js": {
    fileDoc: "Shared HTML/time/author helpers for Vox render layer.",
    ranges: [[20, 107], [331, 353], [1226, 1272]],
  },
  "shell.js": {
    fileDoc: "App shell, sidebar, feed nav, loading/error banners.",
    ranges: [[109, 330]],
  },
  "feed.js": {
    fileDoc: "Feed, composer, post cards, comments, stories.",
    ranges: [[356, 541], [552, 805]],
  },
  "topic.js": {
    fileDoc: "Single-topic thread view and detail text.",
    ranges: [[542, 550], [1096, 1224]],
  },
  "community.js": {
    fileDoc: "Home, communities, listings, governance proposals UI.",
    ranges: [[807, 1094], [1886, 2087]],
  },
  "profile.js": {
    fileDoc: "Profiles, wallet, Pix, compose screens.",
    ranges: [[1274, 1884]],
  },
  "oauth-modals.js": {
    fileDoc: "OAuth, cantina gate, pact/zap/edit modals, people search.",
    ranges: [[2089, 2412]],
  },
  "network.js": {
    fileDoc: "Network settings, participation layers, steward wizard.",
    ranges: [[2414, 2805]],
  },
  "dm.js": {
    fileDoc: "Direct message inbox and thread UI.",
    ranges: [[2807, 2947]],
  },
  "tag-polis.js": {
    fileDoc: "Hashtag feed and Pol.is-lite report HTML.",
    ranges: [[2949, lines.length]],
  },
};

function extractRanges(ranges) {
  const parts = [];
  for (const [start, end] of ranges) {
    parts.push(...lines.slice(start - 1, end));
  }
  return parts.join("\n");
}

fs.mkdirSync(outDir, { recursive: true });

for (const [name, { fileDoc, ranges }] of Object.entries(chunks)) {
  const body = extractRanges(ranges);
  const header = `/** @file ${fileDoc} */\n`;
  fs.writeFileSync(path.join(outDir, name), `${header}\n${body}\n`, "utf8");
}

console.log("Wrote", Object.keys(chunks).length, "modules to", outDir);
