/**
 * @file Pacote de sistema `gurps4e` (GURPS 4e): só a matemática, no formato do motor de derivados. Quatro atributos
 * (ST, DX, IQ, HT), resolução `3d6_sob_nh`, recursos PV e PF. Os secundários, os níveis de carga e o teste 3d6 estão
 * em `system-gurps-math.js`. Não há lista de perícias, vantagens, desvantagens nem texto de regra: perícias, vantagens
 * e desvantagens entram como estrutura editável ou importadas pelo jogador (decisão SUB-D3).
 *
 * Licença: não há licença aberta para o conteúdo editorial desse sistema; o pacote não embute conteúdo de terceiros
 * além dos nomes curtos dos atributos.
 *
 * @module dungeon/system-pack-gurps4e
 * @see docs/specs/pacote-gurps4e-v0.md
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §9)
 */

/** Aviso de conteúdo do pacote, mostrado em "Sobre este conteúdo". @type {string} */
export const GURPS4E_ATTRIBUTION =
  "Este pacote traz só fórmulas de mecânica de jogo implementadas pelo Vox e nomes curtos de atributos. Nenhum texto do livro (perícias, vantagens, desvantagens, tabelas, descrições) está incluído; esses dados são escritos ou importados por você. GURPS é marca de Steve Jackson Games, sem vínculo com o Vox.";

const ability = (id, label, short) => Object.freeze({ id, label, short });

/** Pacote de sistema GURPS 4e (só matemática; sem texto de regra). @type {object} */
export const GURPS4E_PACK = Object.freeze({
  id: "gurps4e",
  version: 1,
  name: "GURPS 4e (matemática)",
  license: Object.freeze({
    spdx: "LicenseRef-Vox-Estrutura-Propria",
    attribution: GURPS4E_ATTRIBUTION,
    source: "Nomes de mecânica de jogo; fórmulas e matemática do Vox",
    url: "https://github.com/yurikayel/vox/blob/develop/docs/legal/licenca-e-contribuicoes.md",
  }),
  testKind: "3d6_sob_nh",
  abilities: Object.freeze([ability("st", "Força", "ST"), ability("dx", "Destreza", "DX"), ability("iq", "Inteligência", "IQ"), ability("ht", "Vitalidade", "HT")]),
  skills: Object.freeze([]),
  resources: Object.freeze([Object.freeze({ id: "hp", label: "PV", kind: "pool" }), Object.freeze({ id: "fp", label: "PF", kind: "pool" })]),
  labels: Object.freeze({ armorClass: "DX", initiative: "Iniciativa", proficiency: "Proficiência", passivePerception: "Percepção passiva", speed: "Deslocamento", saves: "Salvaguardas", deathSaves: "Testes contra a morte", conditions: "Condições", exhaustion: "Exaustão", hitDice: "Dados de Vida", shortRest: "Descanso curto", longRest: "Descanso longo" }),
  display: Object.freeze({
    derived: Object.freeze([
      Object.freeze({ id: "hp", label: "PV", source: Object.freeze({ computed: "gurps.hp" }) }),
      Object.freeze({ id: "fp", label: "PF", source: Object.freeze({ computed: "gurps.fp" }) }),
      Object.freeze({ id: "dodge", label: "Esquiva", source: Object.freeze({ computed: "gurps.dodge" }) }),
      Object.freeze({ id: "move", label: "Deslocamento", source: Object.freeze({ computed: "gurps.move" }) }),
      Object.freeze({ id: "basicMove", label: "Desloc. Básico", source: Object.freeze({ computed: "gurps.basicMove" }) }),
      Object.freeze({ id: "basicSpeed", label: "Velocidade Básica", source: Object.freeze({ computed: "gurps.basicSpeed" }) }),
      Object.freeze({ id: "load", label: "Carga", source: Object.freeze({ computed: "gurps.load" }) }),
    ]),
    blocks: Object.freeze([]),
  }),
  formulas: Object.freeze({
    /** Valor guardado = 10 + diferença para o padrão (o motor mostra só a diferença). */
    modifier: Object.freeze({ base: 10, step: 1 }),
    /** GURPS evolui por pontos, não por nível: sem bônus de proficiência. */
    proficiency: Object.freeze({ base: 0, every: 20 }),
    armorClass: Object.freeze({ base: 10, ability: "dx" }),
    initiative: Object.freeze({ ability: "dx" }),
    passivePerception: Object.freeze({ base: 10, skill: "nenhuma" }),
  }),
});
