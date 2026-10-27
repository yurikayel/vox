/** Function patterns, zigzag fill, mask, and format bits (ECC L). */

export function cloneModules(modules) {
  return modules.map((row) => row.slice());
}

function inFinder(dx, dy) {
  if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
  return dx === 0 || dx === 6 || dy === 0 || dy === 6
    || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
}

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

function placeAlignment(grid, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      grid.modules[cy + dy][cx + dx] = d === 2 || d === 0;
      grid.func[cy + dy][cx + dx] = true;
    }
  }
}

function placeTiming(grid) {
  for (let i = 8; i < grid.size - 8; i++) {
    grid.modules[6][i] = i % 2 === 0;
    grid.modules[i][6] = i % 2 === 0;
    grid.func[6][i] = true;
    grid.func[i][6] = true;
  }
}

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

export function buildFunctionGrid(version) {
  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const func = Array.from({ length: size }, () => new Array(size).fill(false));
  const grid = { modules, func, size, version };
  placeFinder(grid, 0, 0);
  placeFinder(grid, size - 7, 0);
  placeFinder(grid, 0, size - 7);
  placeTiming(grid);
  placeAlignment(grid, size - 7, size - 7);
  grid.modules[size - 8][8] = true;
  grid.func[size - 8][8] = true;
  reserveFormat(grid);
  return grid;
}

function visitPair(grid, right, y, onCell) {
  for (let j = 0; j < 2; j++) {
    const x = right - j;
    if (!grid.func[y][x]) onCell(x, y);
  }
}

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

export function placeDataBits(grid, bits) {
  let i = 0;
  walkData(grid, (x, y) => {
    if (i < bits.length) grid.modules[y][x] = bits[i] === 1;
    i += 1;
  });
}

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

export function applyMask(grid, mask) {
  const n = grid.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (grid.func[y][x]) continue;
      if (maskBit(mask, x, y)) grid.modules[y][x] = !grid.modules[y][x];
    }
  }
}

export function formatBits(mask) {
  const data = (1 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function writeFormatCopy(grid, bits) {
  const n = grid.size;
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

export function writeFormat(grid, mask) {
  writeFormatCopy(grid, formatBits(mask));
  grid.mask = mask;
}

export function readFormatMask(modules) {
  const g = (x, y) => (modules[y][x] ? 1 : 0);
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= g(8, i) << i;
  bits |= g(8, 7) << 6;
  bits |= g(8, 8) << 7;
  bits |= g(7, 8) << 8;
  for (let i = 9; i < 15; i++) bits |= g(14 - i, 8) << i;
  return ((bits ^ 0x5412) >> 10) & 7;
}

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

function scoreRuns(modules) {
  let s = 0;
  for (let i = 0; i < modules.length; i++) {
    s += scoreLine(modules[i]);
    s += scoreLine(modules.map((row) => row[i]));
  }
  return s;
}

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

export function scoreGrid(modules) {
  return scoreRuns(modules) + scoreBlocks(modules);
}

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
