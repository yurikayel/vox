/**
 * PM-04 + PM-02 — o que o Service Worker baixa na instalação.
 * - Todo módulo do precache (SHELL_ASSETS) tem de ser alcançável a partir de um ponto de entrada
 *   (os <script src> das páginas do cliente), seguindo os imports estáticos e dinâmicos.
 * - Todo módulo inalcançável tem de estar em UNPLUGGED_MODULES (fora do precache).
 * - O tamanho total do precache tem teto: peso só cresce de propósito.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

/**
 * PM-02: teto do precache em bytes. Medido em 2026-11-09 depois do PM-04: 2.038.578 bytes em 182 arquivos, + ~2% de folga.
 * Meta do PM-01 (dieta do shell): baixar 20% disto. Subir o teto exige justificar no PR.
 * 2026-11-10 (PM-78): 2.081.292 bytes em 193 arquivos; a folga acabou com os 6 módulos do PM-69 e a caixa de
 * saída das DMs (+4,4 KB). Teto sobe só 0,2% acima do medido; a próxima adição precisa vir com corte (PM-01).
 * 2026-11-10 (PM-80): corte de 18,4 KB (o icon.svg embutia o mesmo PNG duas vezes, em href e xlink:href) pagou o
 * peer-sync.js; medido 2.070.279 bytes em 194 arquivos. O teto desce para 0,2% acima do medido (catraca).
 * 2026-11-10 (PM-87): blob ao lado do GOSSIP pago com a remoção de 4 funções sem uso; medido 2.074.618 bytes em 203 arquivos.
 * 2026-11-10 (PM-88): blob na sincronização ao conectar (+2,4 KB) pago com a remoção de fetchIdentityLinkOnChain e
 * suas 2 consultas, mais 4 exportações sem uso; medido 2.074.738 bytes em 203 arquivos (+120 B). Teto mantido.
 * 2026-11-10 (PM-93 etapa 2): key-lock.js e account-backup.js pagos com a remoção do texto, das fotos e das
 * respostas de demonstração por UF que ninguém lia (profiles-brazil-uf.js, -20,6 KB); medido 2.064.135 bytes em
 * 212 arquivos. O teto desce para 0,2% acima do medido (catraca).
 * 2026-11-11 (aviso, lote D): os 5 módulos do aviso (+31,7 KB) pagos tirando do precache o icon-white-512.png
 * (-42,2 KB), que o app só mostrava em 48 px (agora usa o de 192 px); medido 2.058.234 bytes. Catraca: 0,2% acima.
 * 2026-11-11 (chamada de ação, lote 1): aviso-roles.js e app/aviso-roles-dm.js pagos tirando do precache o
 * profile-vox-official-512.png, cópia exata do icon-512.png (-59,9 KB); medido 2.018.977 bytes. Catraca: 0,2% acima.
 * 2026-11-11 (norma de documentação): o JSDoc dos módulos das últimas 24 h (+27,9 KB, o app não tem build que tire
 * comentários) foi pago trocando cantina-gate.jpg por WebP (-40,5 KB, visualmente igual); medido 2.010.174 bytes.
 * Catraca: 0,2% acima.
 * 2026-11-11 (telas 6–8 do Stitch: tópico, comunidade e pauta, +13,5 KB): pagas removendo de style.css e agora.css
 * 163 regras cujas classes nenhum JS/HTML do cliente gera mais (-18,9 KB; estilo computado idêntico em todas as
 * rotas, antes e depois). A tela da pauta virou módulo próprio (render/proposal.js, com JSDoc). Medido 2.019.269
 * bytes; 0,2% acima passaria do teto atual, então o teto fica onde estava (catraca não sobe).
 * 2026-11-11 (norma de documentação + telas 6–8 juntas, merge da main): medido 2.010.383 bytes; o teto da norma
 * (2.014.194) já está abaixo de 0,2% acima do medido, então fica.
 * 2026-11-11 (gênese e purga das contas de teste): entram genesis.js e data/test-route-ids.js (as 128 chaves das
 * contas de teste, +4,3 KB); medido 2.005.949 bytes. O teto desce para 0,2% acima de 2.005.256 (medido antes das
 * seis contas "Yuri Kayel" do mantenedor e da purga passar pelas APIs do diretório e da agenda, +693 B, que cabem nele).
 * 2026-11-11 (lote UI 1 do Stitch: diretório, guias com cartões de opção, Voxpedia, Saúde do nó, +4,8 KB): pago
 * recomprimindo icons/icon-white-192.png em paleta (≤256 cores; pixels RGBA idênticos, -10,1 KB). Medido
 * 2.005.109 bytes. Catraca: 0,2% acima.
 * 2026-11-11 (merge da main com a gênese, #98): medido junto 1.997.911 bytes. Catraca: 0,2% acima.
 * 2026-11-11 (lote UI 2 do Stitch: compositor bloqueado, nota do "pular" no onboarding, +2,0 KB, já descontados os
 * estilos inline que saíram): medido 1.999.994 bytes, abaixo do teto; 0,2% acima passaria dele, então o teto fica.
 * 2026-11-12 (malha P2P recusa conta de teste e post anterior à gênese, em peers.js, +757 B): medido 2.000.751 bytes,
 * abaixo do teto; 0,2% acima passaria dele, então o teto fica.
 * 2026-11-12 (selo "Malha ativa" da barra do topo para a tela Sua rede, +441 B de JSDoc, junto com a guarda da
 * malha): medido 2.001.666 bytes;
 * teto mantido.
 * 2026-11-12 (diretório: homônimo de outra chave não some dentro de "Você", +96 B de comentário): medido
 * 2.001.762 bytes; teto mantido (sobram 144 B).
 * 2026-11-12 (P1: cartão sem nome e contas do cofre não saem do aparelho, +1,5 KB): pago removendo 13 exportações
 * que nada usava e a regra .gossip-edited-pill (-1,9 KB). Medido 2.001.027 bytes; teto mantido.
 * 2026-11-12 (backup semanal e mensal no e-mail, pedido do mantenedor, +13,4 KB): só o icon-mark-black-128.png em
 * paleta exata (pixels idênticos, -517 B) pagou parte. O teto SOBE 12.190 B, para o medido (2.014.096 bytes), sem folga:
 * a funcionalidade nova é o motivo, e a próxima adição volta a precisar de corte.
 */
const SHELL_BUDGET_BYTES = 2_014_096;

function listFrom(name) {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} precisa existir no sw.js`);
  return m[1].split("\n").map((s) => s.trim().replace(/^['"]|['"],?$/g, "")).filter((s) => s && !s.startsWith("//"));
}

const toRel = (abs) => "./" + path.relative(root, abs).split(path.sep).join("/");

function entryPoints() {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => path.join(root, f));
  for (const extra of ["download/index.html", "embed/demo.html", "embed/frame-demo.html"]) {
    if (fs.existsSync(path.join(root, extra))) pages.push(path.join(root, extra));
  }
  const entries = [];
  for (const page of pages) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
      if (!/^https?:/.test(m[1])) entries.push(path.resolve(path.dirname(page), m[1]));
    }
  }
  return entries;
}

const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

function reachable() {
  const seen = new Set();
  const stack = entryPoints();
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map(toRel));
}

test("PM-04: todo módulo do precache é alcançável; todo inalcançável está em UNPLUGGED_MODULES", () => {
  const shell = new Set(listFrom("SHELL_ASSETS").filter((a) => a.endsWith(".js") && a.startsWith("./js/")));
  const unplugged = new Set(listFrom("UNPLUGGED_MODULES"));
  const live = reachable();
  const deadInShell = [...shell].filter((a) => !live.has(a));
  assert.deepEqual(deadInShell, [], "módulo sem importador no precache: mova para UNPLUGGED_MODULES (ou plugue)");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
  const unlisted = walk(path.join(root, "js")).map(toRel).filter((r) => !live.has(r) && !unplugged.has(r));
  assert.deepEqual(unlisted, [], "módulo inalcançável fora da lista UNPLUGGED_MODULES");
  const pluggedButListed = [...unplugged].filter((r) => live.has(r));
  assert.deepEqual(pluggedButListed, [], "módulo já plugado: tire de UNPLUGGED_MODULES e ponha no SHELL_ASSETS");
});

test("PM-02: o precache cabe no orçamento de peso", () => {
  let total = 0;
  for (const asset of listFrom("SHELL_ASSETS")) {
    if (asset === "./") continue;
    total += fs.statSync(path.join(root, asset)).size;
  }
  assert.ok(total <= SHELL_BUDGET_BYTES, `precache com ${total} bytes passou do teto de ${SHELL_BUDGET_BYTES} (PM-02)`);
});
