/**
 * @file Pacote de sistema `t20` (Tormenta20): só estrutura e matemática do projeto. Nomes dos seis atributos e das
 * 29 perícias básicas (termos de jogo), ligação perícia-atributo, os recursos PV e PM e os parâmetros que o motor de
 * derivados lê. Nenhuma descrição, poder, magia, classe, raça, divindade ou texto de regra do livro entra aqui: o que
 * for texto vem do jogador, em campo livre editável (decisão SUB-D2), ou por importação local.
 *
 * Licença: não há licença aberta para o conteúdo editorial desse sistema; o pacote não embute conteúdo de terceiros
 * além dos nomes curtos de atributos e perícias.
 *
 * Rótulos fora de Defesa, Iniciativa e Deslocamento são os genéricos do motor atual (a tela de derivados ainda é
 * a do D&D; adaptá-la ao T20 é trabalho futuro, veja a spec).
 *
 * @module dungeon/system-pack-t20
 *
 * @see docs/specs/pacote-t20-v0.md
 * @see docs/specs/ficha-personagem-brainstorm-v0.md (§4 e §9)
 */

/** Aviso curto de não afiliação, mostrado no seletor de sistema. @type {string} */
const T20_NOTICE =
  "Tormenta20 é publicado pela Jambô Editora. O Vox não tem vínculo com a Jambô Editora nem com os titulares da marca, e não é endossado por eles.";

/** Aviso de conteúdo do pacote, mostrado em "Sobre este conteúdo". @type {string} */
export const T20_ATTRIBUTION =
  "Este pacote traz só estrutura e matemática próprias do Vox e nomes curtos de atributos e perícias como termos de jogo. Nenhum texto do livro (poderes, magias, classes, raças, divindades, descrições) está incluído; descrições são escritas ou importadas por você. " + T20_NOTICE;

const ability = (id, label, short) => Object.freeze({ id, label, short });
const skill = (id, label, abilityId) => Object.freeze({ id, label, ability: abilityId });

/** Pacote de sistema Tormenta20 (estrutura e matemática; sem texto de regra). @type {object} */
export const T20_PACK = Object.freeze({
  id: "t20",
  version: 1,
  name: "Tormenta20 (estrutura)",
  license: Object.freeze({
    spdx: "LicenseRef-Vox-Estrutura-Propria",
    attribution: T20_ATTRIBUTION,
    notice: T20_NOTICE,
    source: "Nomes e ligações de mecânica de jogo; estrutura e matemática do Vox",
    url: "https://github.com/yurikayel/vox/blob/develop/docs/legal/licenca-e-contribuicoes.md",
  }),
  testKind: "d20_vs_cd",
  abilities: Object.freeze([
    ability("str", "Força", "FOR"),
    ability("dex", "Destreza", "DES"),
    ability("con", "Constituição", "CON"),
    ability("int", "Inteligência", "INT"),
    ability("wis", "Sabedoria", "SAB"),
    ability("cha", "Carisma", "CAR"),
  ]),
  skills: Object.freeze([
    skill("acrobacia", "Acrobacia", "dex"),
    skill("adestramento", "Adestramento", "cha"),
    skill("atletismo", "Atletismo", "str"),
    skill("atuacao", "Atuação", "cha"),
    skill("cavalgar", "Cavalgar", "dex"),
    skill("conhecimento", "Conhecimento", "int"),
    skill("cura", "Cura", "wis"),
    skill("diplomacia", "Diplomacia", "cha"),
    skill("enganacao", "Enganação", "cha"),
    skill("fortitude", "Fortitude", "con"),
    skill("furtividade", "Furtividade", "dex"),
    skill("guerra", "Guerra", "int"),
    skill("iniciativa", "Iniciativa", "dex"),
    skill("intimidacao", "Intimidação", "cha"),
    skill("intuicao", "Intuição", "wis"),
    skill("investigacao", "Investigação", "int"),
    skill("jogatina", "Jogatina", "cha"),
    skill("ladinagem", "Ladinagem", "dex"),
    skill("luta", "Luta", "str"),
    skill("misticismo", "Misticismo", "int"),
    skill("nobreza", "Nobreza", "int"),
    skill("oficio", "Ofício", "int"),
    skill("percepcao", "Percepção", "wis"),
    skill("pilotagem", "Pilotagem", "dex"),
    skill("pontaria", "Pontaria", "dex"),
    skill("reflexos", "Reflexos", "dex"),
    skill("religiao", "Religião", "wis"),
    skill("sobrevivencia", "Sobrevivência", "wis"),
    skill("vontade", "Vontade", "wis"),
  ]),
  resources: Object.freeze([
    Object.freeze({ id: "hp", label: "PV", kind: "pool" }),
    Object.freeze({ id: "mp", label: "PM", kind: "pool" }),
  ]),
  labels: Object.freeze({ armorClass: "Defesa", initiative: "Iniciativa", proficiency: "Proficiência", passivePerception: "Percepção passiva", speed: "Deslocamento", saves: "Salvaguardas", deathSaves: "Testes contra a morte", conditions: "Condições", exhaustion: "Exaustão", hitDice: "Dados de Vida", shortRest: "Descanso curto", longRest: "Descanso longo" }),
  display: Object.freeze({
    derived: Object.freeze([
      Object.freeze({ id: "armorClass", label: "Defesa", source: Object.freeze({ formula: "armorClass" }) }),
      Object.freeze({ id: "initiative", label: "Iniciativa", source: Object.freeze({ formula: "initiative" }) }),
      Object.freeze({ id: "speed", label: "Deslocamento", source: Object.freeze({ formula: "speed" }) }),
      Object.freeze({ id: "hp", label: "PV", source: Object.freeze({ resource: "hp" }) }),
      Object.freeze({ id: "mp", label: "PM", source: Object.freeze({ resource: "mp" }) }),
    ]),
    blocks: Object.freeze([]),
    hud: Object.freeze({ defense: "armorClass", secondary: "mp" }),
  }),
  formulas: Object.freeze({
    /** Valor guardado = 10 + modificador (o cartão mostra só o modificador). */
    modifier: Object.freeze({ base: 10, step: 1 }),
    /** Treino (meio nível mais treino por perícia) ainda não é calculado pelo motor: o bônus fica em zero. */
    proficiency: Object.freeze({ base: 0, every: 20 }),
    armorClass: Object.freeze({ base: 10, ability: "dex" }),
    /** Iniciativa é a perícia `iniciativa`; o atributo é reserva. */
    initiative: Object.freeze({ skill: "iniciativa", ability: "dex" }),
    passivePerception: Object.freeze({ base: 10, skill: "percepcao" }),
  }),
});
