/**
 * @file Pontos de quebra de largura em `em`, não em px (WCAG 1.4.4/1.4.10), com a mesma unidade em todas as folhas.
 * A query em px olha a largura da janela e ignora a fonte padrão do navegador; em `em` ela acompanha (1em = fonte
 * padrão, 16 px por omissão). Se duas folhas aplicam metades do mesmo layout, uma em px e outra em `em`, com a fonte maior
 * as metades deixam de coincidir e o shell quebra. Também não pode sobrar buraco entre o par estreito e o largo: com
 * `max-width: 47.9375em` e `min-width: 48em`, a 959 px (fonte de 20 px) nenhuma das duas casa. O par é
 * `(max-width: 47.99em)` com `(min-width: 48em)` (folga de 0,01em, 0,2 px a 20 px, só para larguras fracionárias). A
 * sintaxe de intervalo (`(width < 48em)`) não entra: antes do Safari 16.4 a query inteira vira `not all` e o celular perde o
 * layout estreito.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import * as css from "./helpers/css-contrato.js";

const FOLHAS = readdirSync(new URL("../client/css/", import.meta.url)).filter((f) => f.endsWith(".css"));

/** Folhas que ainda têm query de largura em px, à espera do item que as migra; cada uma diz o motivo. */
const PENDENTES = new Map([
  ["dungeon-layout.css", "o 1024 do Subversus é um par com o agora.css (1023.98/1024 em px nas duas); as duas folhas migram juntas no F44"],
  ["sv-ficha.css", "uma query de 360 px da ficha; migra no F44 junto com o teste ficha-inventario-320"],
  ["sv-token-tray.css", "uma query min-width de 768 px da bandeja de tokens; migra no F44 junto com o teste subversus-bandeja-tokens"],
]);
/** Condições em px que ficam em folhas já migradas, com o motivo. */
const EXCECOES_PX = new Map([
  ["agora.css", { condicoes: ["max-width: 1023.98px", "min-width: 1024px"], motivo: "família 1023.98/1024 do Subversus, par com o dungeon-layout.css (F44 migra os dois lados juntos)" }],
]);
/** Pontos de quebra (em px) cujo uso em px numa folha pendente é aceito ao lado do `em` nas outras, com o motivo. */
const BUCKETS_MISTOS = new Map([[768, "o 768 da bandeja de tokens (sv-token-tray.css, F44) não faz par de layout com o shell"]]);
/** Pontos de quebra (px) que existiam antes da conversão; todo `em` tem de ser um deles dividido por 16. */
const PX_CONHECIDOS = new Set([360, 480, 520, 600, 640, 680, 768, 820, 1024, 1100]);

const LEGADO = /\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)(px|em|rem)\s*\)/g;
const INTERVALO = /\(\s*width\s*(<=|>=|<|>)\s*([\d.]+)(px|em|rem)\s*\)/g;

/** Condições de largura/altura de cada `@media` de uma folha. */
function condicoes(folha) {
  const texto = css.readCss(folha).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  for (const m of texto.matchAll(/@media([^{]*)\{/g)) {
    for (const c of m[1].matchAll(LEGADO)) out.push({ folha, texto: `${c[1]}-${c[2]}: ${c[3]}${c[4]}`, kind: c[1], value: Number(c[3]), unit: c[4] });
    for (const c of m[1].matchAll(INTERVALO)) out.push({ folha, texto: `width ${c[1]} ${c[2]}${c[3]}`, kind: c[1].startsWith("<") ? "max" : "min", value: Number(c[2]), unit: c[3], range: true });
  }
  return out.map((c) => ({ ...c, px: c.value * (c.unit === "px" ? 1 : 16) }));
}

const TODAS = FOLHAS.flatMap(condicoes);

test("nenhuma query de largura em px fora das folhas pendentes e das exceções listadas", () => {
  const sobra = TODAS.filter((c) => c.unit === "px" && !PENDENTES.has(c.folha) && !EXCECOES_PX.get(c.folha)?.condicoes.includes(c.texto));
  assert.deepEqual(sobra.map((c) => `${c.folha}: ${c.texto}`), [], "cada ponto de quebra em px vira em (px/16)");
});

test("as folhas pendentes e as exceções ainda têm px (senão a lista envelheceu)", () => {
  for (const [folha, motivo] of PENDENTES) {
    assert.ok(motivo.length > 20, `${folha} diz o motivo`);
    assert.ok(TODAS.some((c) => c.folha === folha && c.unit === "px"), `${folha} já não tem px: tire-a de PENDENTES`);
  }
  for (const [folha, { condicoes: lista, motivo }] of EXCECOES_PX) {
    assert.ok(motivo.length > 20, `${folha} diz o motivo`);
    for (const texto of lista) assert.ok(TODAS.some((c) => c.folha === folha && c.texto === texto), `${folha}: ${texto} já não existe; tire-a das exceções`);
  }
});

test("cada ponto de quebra tem uma unidade só em todas as folhas (o par px/em não volta)", () => {
  const porPonto = new Map();
  for (const c of TODAS) {
    const ponto = Math.ceil(c.px / 8) * 8; // 767, 768 e 1099, 1100 são o mesmo ponto; 1023.98 e 1024 também
    porPonto.set(ponto, new Map(porPonto.get(ponto)).set(c.unit === "px" ? "px" : "em", [...(porPonto.get(ponto)?.get(c.unit === "px" ? "px" : "em") ?? []), c.folha]));
  }
  const mistos = [...porPonto].filter(([ponto, unidades]) => unidades.size > 1 && !BUCKETS_MISTOS.has(ponto)).map(([ponto, u]) => `${ponto}px: px em ${[...new Set(u.get("px"))]} e em em ${[...new Set(u.get("em"))]}`);
  assert.deepEqual(mistos, [], "px e em no mesmo ponto de quebra fazem cada folha aplicar metade do layout");
  for (const [ponto, motivo] of BUCKETS_MISTOS) assert.equal(porPonto.get(ponto)?.size, 2, `${ponto}px já não mistura: ${motivo}`);
});

test("não sobra buraco entre o par estreito e o largo: o max-width em em fica a 0,01em do min-width, no máximo", () => {
  const em = TODAS.filter((c) => c.unit === "em");
  const mins = new Set(em.filter((c) => c.kind === "min").map((c) => c.value));
  const folgaMaior = (c) => [...mins].some((m) => m > c.value && m - c.value > 0.0101 && m - c.value < 0.5);
  const buracos = em.filter((c) => c.kind === "max" && folgaMaior(c));
  assert.deepEqual(buracos.map((c) => `${c.folha}: ${c.texto}`), [], "o par é max-width: (N − 0.01)em com min-width: Nem");
});

test("nenhuma folha usa sintaxe de intervalo de mídia (width < Nem, width >= Nem, Npx <= width)", () => {
  const usos = FOLHAS.flatMap((folha) => {
    const texto = css.readCss(folha).replace(/\/\*[\s\S]*?\*\//g, "");
    return [...texto.matchAll(/@media([^{]*)\{/g)].filter((m) => /[<>]/.test(m[1])).map((m) => `${folha}: @media${m[1].trimEnd()}`);
  });
  assert.deepEqual(usos, [], "antes do Safari 16.4 o intervalo vira not all e o celular perde o layout estreito");
  assert.ok(TODAS.some((c) => c.unit === "em" && c.kind === "max" && c.value === 47.99), "o par estreito do shell é max-width: 47.99em");
});

test("toda query em em vale um ponto de quebra que já existia (px/16, ou menos 0,01em no lado estreito), nenhuma conta errada", () => {
  const legado = (c) => PX_CONHECIDOS.has(c.px) || (c.kind === "max" && PX_CONHECIDOS.has(Math.round((c.value + 0.01) * 16)));
  const errados = TODAS.filter((c) => c.unit === "em" && !legado(c)).map((c) => `${c.folha}: ${c.texto} = ${c.px}px`);
  assert.deepEqual(errados, [], "o em vale px/16 de um ponto de quebra da base");
});
