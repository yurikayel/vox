/**
 * @file Layout de módulos QR (ISO/IEC 18004): grade funcional, máscara e bits de formato.
 *
 * @module qr-url-layout
 */

/** Alignment pattern centres per version (ISO/IEC 18004 Annex E). */
const ALIGNMENT_CENTERS = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  11: [6, 30, 54],
};

/**
 * Cópia profunda da matriz booleana de módulos.
 * @param {boolean[][]} modules Grade de módulos.
 * @returns {boolean[][]}
 */
export function cloneModules(modules) {
  return modules.map((row) => row.slice());
}

/**
 * Diz se a célula (relativa ao canto) faz parte do desenho do localizador.
 * @param {number} dx Deslocamento X
 * @param {number} dy Deslocamento Y
 * @returns {boolean} `true` se a célula é escura.
 */
function inFinder(dx, dy) {
  if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
  return dx === 0 || dx === 6 || dy === 0 || dy === 6
    || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
}

/**
 * Desenha um localizador (e seu separador) na grade.
 * @param {object} grid Grade
 * @param {number} x0 Coluna do canto
 * @param {number} y0 Linha do canto
 */
function placeFinder(grid, x0, y0) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) continue;
      grid.modules[y][x] = inFinder(dx, dy);
      grid.func[y][x] = true;
    }
  }
}

/**
 * Desenha um padrão de alinhamento na grade.
 * @param {object} grid Grade
 * @param {number} cx Coluna do centro
 * @param {number} cy Linha do centro
 */
function placeAlignment(grid, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      grid.modules[cy + dy][cx + dx] = d === 2 || d === 0;
      grid.func[cy + dy][cx + dx] = true;
    }
  }
}

/**
 * Diz se o centro do alinhamento cai sobre um localizador.
 * @param {number} cx Coluna
 * @param {number} cy Linha
 * @param {number} size Tamanho da grade
 * @returns {boolean} `true` se sobrepõe.
 */
function overlapsFinder(cx, cy, size) {
  /**
   * Diz se a coordenada é a do primeiro localizador.
   * @param {number} v Coordenada
   * @returns {boolean} `true` se for.
   */
  const near = (v) => v === 6;
  /**
   * Diz se a coordenada é a do último localizador.
   * @param {number} v Coordenada
   * @returns {boolean} `true` se for.
   */
  const far = (v) => v === size - 7;
  return (near(cx) && near(cy)) || (far(cx) && near(cy)) || (near(cx) && far(cy));
}

/**
 * Desenha todos os padrões de alinhamento da versão.
 * @param {object} grid Grade
 */
function placeAlignments(grid) {
  const centers = ALIGNMENT_CENTERS[grid.version] || [];
  for (const cy of centers) {
    for (const cx of centers) {
      if (!overlapsFinder(cx, cy, grid.size)) placeAlignment(grid, cx, cy);
    }
  }
}

/**
 * 18-bit version information (versions 7+): 6 version bits + BCH(18,6) remainder, generator 0x1f25.
 * @param {number} version
 * @returns {number}
 */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/**
 * Desenha a informação de versão (versões 7 ou mais).
 * @param {object} grid Grade
 */
function placeVersionInfo(grid) {
  if (grid.version < 7) return;
  const bits = versionBits(grid.version);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >>> i) & 1) === 1;
    const a = grid.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    grid.modules[b][a] = on;
    grid.modules[a][b] = on;
    grid.func[b][a] = true;
    grid.func[a][b] = true;
  }
}

/**
 * Desenha as linhas de sincronismo (timing).
 * @param {object} grid Grade
 */
function placeTiming(grid) {
  for (let i = 8; i < grid.size - 8; i++) {
    grid.modules[6][i] = i % 2 === 0;
    grid.modules[i][6] = i % 2 === 0;
    grid.func[6][i] = true;
    grid.func[i][6] = true;
  }
}

/**
 * Reserva as células da informação de formato.
 * @param {object} grid Grade
 */
function reserveFormat(grid) {
  const n = grid.size;
  for (let i = 0; i <= 8; i++) {
    grid.func[8][i] = true;
    grid.func[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    grid.func[8][n - 1 - i] = true;
    grid.func[n - 1 - i][8] = true;
  }
}

/**
 * Monta grade só com padrões funcionais (finders, timing, alinhamento, versão).
 * @param {number} version Versão QR (2–11 suportadas para alinhamento).
 * @returns {{ modules: boolean[][], func: boolean[][], size: number, version: number }}
 */
export function buildFunctionGrid(version) {
  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const func = Array.from({ length: size }, () => new Array(size).fill(false));
  const grid = { modules, func, size, version };
  placeFinder(grid, 0, 0);
  placeFinder(grid, size - 7, 0);
  placeFinder(grid, 0, size - 7);
  placeTiming(grid);
  placeAlignments(grid);
  placeVersionInfo(grid);
  grid.modules[size - 8][8] = true;
  grid.func[size - 8][8] = true;
  reserveFormat(grid);
  return grid;
}

/**
 * Percorre as células livres de um par de colunas, em uma linha.
 * @param {object} grid Grade
 * @param {number} right Coluna da direita do par
 * @param {number} y Linha
 * @param {Function} onCell Chamada para cada célula livre
 */
function visitPair(grid, right, y, onCell) {
  for (let j = 0; j < 2; j++) {
    const x = right - j;
    if (!grid.func[y][x]) onCell(x, y);
  }
}

/**
 * Percorre células de dados em ordem de codificação (zigzag).
 * @param {{ size: number, func: boolean[][] }} grid Grade com máscara funcional.
 * @param {(x: number, y: number) => void} onCell Callback por célula não reservada.
 * @returns {void}
 */
export function walkData(grid, onCell) {
  const n = grid.size;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < n; vert++) {
      visitPair(grid, right, upward ? n - 1 - vert : vert, onCell);
    }
  }
}

/**
 * Grava bits de dados nas células livres da grade.
 * @param {{ modules: boolean[][], func: boolean[][] }} grid Grade alvo.
 * @param {number[]} bits Bits 0/1.
 * @returns {void}
 */
export function placeDataBits(grid, bits) {
  let i = 0;
  walkData(grid, (x, y) => {
    if (i < bits.length) grid.modules[y][x] = bits[i] === 1;
    i += 1;
  });
}

/**
 * Bit de máscara ISO para coordenadas e índice de máscara 0–7.
 * @param {number} mask Índice da máscara.
 * @param {number} x Coluna.
 * @param {number} y Linha.
 * @returns {boolean}
 */
export function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    default: return false;
  }
}

/**
 * Aplica máscara invertendo módulos de dados não funcionais.
 * @param {{ modules: boolean[][], func: boolean[][], size: number }} grid Grade.
 * @param {number} mask Índice da máscara.
 * @returns {void}
 */
export function applyMask(grid, mask) {
  const n = grid.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid.func[y][x]) continue;
      if (maskBit(mask, x, y)) grid.modules[y][x] = !grid.modules[y][x];
    }
  }
}

/**
 * 15 bits de formato (ECC nível L + máscara) com BCH.
 * @param {number} mask Índice da máscara aplicada.
 * @returns {number}
 */
export function formatBits(mask) {
  const data = (1 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/**
 * Escreve uma cópia da informação de formato.
 * @param {object} grid Grade
 * @param {number} bits Bits de formato
 */
function writeFormatCopy(grid, bits) {
  const n = grid.size;
  /**
   * Escreve um bit de formato na célula.
   * @param {number} x Coluna
   * @param {number} y Linha
   * @param {number} i Posição do bit
   */
  const put = (x, y, i) => {
    grid.modules[y][x] = ((bits >>> i) & 1) === 1;
  };
  for (let i = 0; i <= 5; i++) put(8, i, i);
  put(8, 7, 6);
  put(8, 8, 7);
  put(7, 8, 8);
  for (let i = 9; i < 15; i++) put(14 - i, 8, i);
  for (let i = 0; i < 8; i++) put(n - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) put(8, n - 15 + i, i);
}

/**
 * Escreve bits de formato nas duas cópias reservadas e registra `grid.mask`.
 * @param {object} grid Grade QR.
 * @param {number} mask Índice da máscara.
 * @returns {void}
 */
export function writeFormat(grid, mask) {
  writeFormatCopy(grid, formatBits(mask));
  grid.mask = mask;
}

/**
 * Lê índice de máscara a partir da grade final.
 * @param {boolean[][]} modules Módulos com formato gravado.
 * @returns {number}
 */
export function readFormatMask(modules) {
  /**
   * Lê o módulo como 0 ou 1.
   * @param {number} x Coluna
   * @param {number} y Linha
   * @returns {number} 1 se escuro, 0 se claro.
   */
  const g = (x, y) => (modules[y][x] ? 1 : 0);
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= g(8, i) << i;
  bits |= g(8, 7) << 6;
  bits |= g(8, 8) << 7;
  bits |= g(7, 8) << 8;
  for (let i = 9; i < 15; i++) bits |= g(14 - i, 8) << i;
  return ((bits ^ 0x5412) >> 10) & 7;
}

/**
 * Pontua as sequências repetidas de uma linha.
 * @param {boolean[]} line Módulos da linha
 * @returns {number} Pontuação.
 */
function scoreLine(line) {
  let score = 0;
  let run = 1;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) run += 1;
    else {
      if (run >= 5) score += run - 2;
      run = 1;
    }
  }
  if (run >= 5) score += run - 2;
  return score;
}

/**
 * Pontua as sequências repetidas nas linhas e colunas.
 * @param {boolean[][]} modules Módulos
 * @returns {number} Pontuação.
 */
function scoreRuns(modules) {
  let s = 0;
  for (let i = 0; i < modules.length; i++) {
    s += scoreLine(modules[i]);
    s += scoreLine(modules.map((row) => row[i]));
  }
  return s;
}

/**
 * Pontua os blocos 2x2 de mesma cor.
 * @param {boolean[][]} modules Módulos
 * @returns {number} Pontuação.
 */
function scoreBlocks(modules) {
  const n = modules.length;
  let s = 0;
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const v = modules[y][x];
      if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) s += 3;
    }
  }
  return s;
}

/**
 * Penalidade ISO (runs + blocos 2×2) para escolha de máscara.
 * @param {boolean[][]} modules Grade completa.
 * @returns {number}
 */
export function scoreGrid(modules) {
  return scoreRuns(modules) + scoreBlocks(modules);
}

/**
 * Testa máscaras 0–7 e devolve a grade com menor penalidade.
 * @param {{ modules: boolean[][], func: boolean[][], size: number, version: number }} base Grade funcional.
 * @param {number[]} bits Bits de dados codificados.
 * @returns {{ modules: boolean[][], mask: number, size: number }}
 */
export function pickMaskedGrid(base, bits) {
  placeDataBits(base, bits);
  let best = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask++) {
    const trial = { modules: cloneModules(base.modules), func: base.func, size: base.size };
    applyMask(trial, mask);
    writeFormat(trial, mask);
    const s = scoreGrid(trial.modules);
    if (s < bestScore) {
      bestScore = s;
      best = trial.modules;
      bestMask = mask;
    }
  }
  return { modules: best, mask: bestMask, size: base.size };
}
