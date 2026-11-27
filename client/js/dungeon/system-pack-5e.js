/**
 * @file Pacote de sistema `5e`: só estrutura, nomes e matemática da regra básica da 5e (SRD 5.2).
 * Nomes dos atributos e das 18 perícias, perícia-atributo e a matemática do modificador e do bônus de proficiência.
 * Nenhuma descrição, tabela de classe, magia ou texto de regra do livro entra aqui.
 *
 * Licença do conteúdo: SRD 5.2 sob Creative Commons Atribuição 4.0 (CC-BY-4.0). A atribuição abaixo é
 * a que a licença exige e também aparece no README do projeto.
 *
 * @module dungeon/system-pack-5e
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §9)
 */

/** Atribuição exigida pela CC-BY-4.0 para o material do SRD 5.2 usado no pacote. @type {string} */
export const ATTRIBUTION_5E =
  'Este trabalho inclui material do System Reference Document 5.2 ("SRD 5.2") da Wizards of the Coast LLC, disponível em https://www.dndbeyond.com/srd. O SRD 5.2 é licenciado sob a Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).';

/** Aviso curto de não afiliação, mostrado no seletor de sistema. @type {string} */
const NOTICE_5E =
  "Este pacote usa só o conteúdo livre do SRD 5.2 (CC-BY-4.0). O Vox não tem vínculo com os titulares da marca e não é endossado por eles.";

/** Pacote de sistema 5e, SRD 5.2 (estrutura e matemática; sem texto de regra). @type {object} */
export const PACK_5E = Object.freeze({
  id: "5e",
  version: 1,
  name: "5e (SRD 5.2)",
  license: Object.freeze({
    spdx: "CC-BY-4.0",
    attribution: ATTRIBUTION_5E,
    notice: NOTICE_5E,
    source: "System Reference Document 5.2",
    url: "https://creativecommons.org/licenses/by/4.0/legalcode",
  }),
  testKind: "d20_vs_cd",
  abilities: Object.freeze([
    { id: "str", label: "Força", short: "FOR" },
    { id: "dex", label: "Destreza", short: "DES" },
    { id: "con", label: "Constituição", short: "CON" },
    { id: "int", label: "Inteligência", short: "INT" },
    { id: "wis", label: "Sabedoria", short: "SAB" },
    { id: "cha", label: "Carisma", short: "CAR" },
  ]),
  skills: Object.freeze([
    { id: "acrobatics", label: "Acrobacia", ability: "dex" },
    { id: "animal-handling", label: "Adestrar Animais", ability: "wis" },
    { id: "arcana", label: "Arcanismo", ability: "int" },
    { id: "athletics", label: "Atletismo", ability: "str" },
    { id: "deception", label: "Enganação", ability: "cha" },
    { id: "history", label: "História", ability: "int" },
    { id: "insight", label: "Intuição", ability: "wis" },
    { id: "intimidation", label: "Intimidação", ability: "cha" },
    { id: "investigation", label: "Investigação", ability: "int" },
    { id: "medicine", label: "Medicina", ability: "wis" },
    { id: "nature", label: "Natureza", ability: "int" },
    { id: "perception", label: "Percepção", ability: "wis" },
    { id: "performance", label: "Atuação", ability: "cha" },
    { id: "persuasion", label: "Persuasão", ability: "cha" },
    { id: "religion", label: "Religião", ability: "int" },
    { id: "sleight-of-hand", label: "Prestidigitação", ability: "dex" },
    { id: "stealth", label: "Furtividade", ability: "dex" },
    { id: "survival", label: "Sobrevivência", ability: "wis" },
  ]),
  resources: Object.freeze([
    { id: "hp", label: "PV", kind: "pool" },
    { id: "hit-dice", label: "Dados de Vida", kind: "uses" },
    { id: "spell-slots", label: "Espaços de magia", kind: "slots" },
    { id: "heroic-inspiration", label: "Inspiração Heroica", kind: "flag" },
    { id: "death-saves", label: "Testes contra a morte", kind: "uses" },
  ]),
  conditions: Object.freeze([
    { id: "blinded", label: "Cego" },
    { id: "charmed", label: "Enfeitiçado" },
    { id: "deafened", label: "Surdo" },
    { id: "frightened", label: "Amedrontado" },
    { id: "grappled", label: "Agarrado" },
    { id: "incapacitated", label: "Incapacitado" },
    { id: "invisible", label: "Invisível" },
    { id: "paralyzed", label: "Paralisado" },
    { id: "petrified", label: "Petrificado" },
    { id: "poisoned", label: "Envenenado" },
    { id: "prone", label: "Caído" },
    { id: "restrained", label: "Contido" },
    { id: "stunned", label: "Atordoado" },
    { id: "unconscious", label: "Inconsciente" },
  ]),
  labels: Object.freeze({ armorClass: "CA", initiative: "Iniciativa", proficiency: "Proficiência", passivePerception: "Percepção passiva", speed: "Deslocamento", saves: "Salvaguardas", deathSaves: "Testes contra a morte", conditions: "Condições", exhaustion: "Exaustão", hitDice: "Dados de Vida", shortRest: "Descanso curto", longRest: "Descanso longo" }),
  display: Object.freeze({
    derived: Object.freeze([
      Object.freeze({ id: "proficiency", label: "Proficiência", source: Object.freeze({ formula: "proficiency" }) }),
      Object.freeze({ id: "armorClass", label: "CA", source: Object.freeze({ formula: "armorClass" }) }),
      Object.freeze({ id: "initiative", label: "Iniciativa", source: Object.freeze({ formula: "initiative" }) }),
      Object.freeze({ id: "passivePerception", label: "Percepção passiva", source: Object.freeze({ formula: "passivePerception" }) }),
      Object.freeze({ id: "speed", label: "Deslocamento", source: Object.freeze({ formula: "speed" }) }),
    ]),
    hud: Object.freeze({ defense: "armorClass" }),
  }),
  /** Ações semeadas numa ficha nova (ataque e perícias comuns); o `@atributo` e o `@prof` seguem as fórmulas deste pacote. */
  seedActions: Object.freeze([
    Object.freeze({ id: "act-ataque", label: "Espada Longa", roll: "1d20+@for+@prof", damage: "1d8+@for", tag: "ataque" }),
    Object.freeze({ id: "act-investigacao", label: "Investigação", roll: "1d20+@int+@prof", damage: "", tag: "pericia" }),
    Object.freeze({ id: "act-percepcao", label: "Percepção", roll: "1d20+@sab+@prof", damage: "", tag: "pericia" }),
    Object.freeze({ id: "act-furtividade", label: "Furtividade", roll: "1d20+@des", damage: "", tag: "pericia" }),
  ]),
  formulas: Object.freeze({
    modifier: Object.freeze({ base: 10, step: 2 }),
    proficiency: Object.freeze({ base: 2, every: 4 }),
    armorClass: Object.freeze({ base: 10, ability: "dex" }),
    initiative: Object.freeze({ ability: "dex" }),
    passivePerception: Object.freeze({ base: 10, skill: "perception" }),
    deathSaves: Object.freeze({ needed: 3 }),
    exhaustion: Object.freeze({ max: 6, d20PenaltyPerLevel: 2, speedPenaltyFtPerLevel: 5 }),
    hitDice: Object.freeze({ healAbility: "con" }),
    speed: Object.freeze({ maxFt: 200, metersPerFt: 0.3 }),
    armor: Object.freeze({
      maxAc: 30,
      kinds: Object.freeze({
        leve: Object.freeze({ label: "Armadura leve", slot: "body", dexCap: null }),
        media: Object.freeze({ label: "Armadura média", slot: "body", dexCap: 2 }),
        pesada: Object.freeze({ label: "Armadura pesada", slot: "body", dexCap: 0 }),
        escudo: Object.freeze({ label: "Escudo", slot: "shield", dexCap: 0 }),
      }),
    }),
  }),
});
