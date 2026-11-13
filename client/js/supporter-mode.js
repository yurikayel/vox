/**
 * @file Compromisso de armazenamento do nó: nó leve (padrão), Apoiador (nó pesado, opt-in) e Guardião.
 *
 * O disco é fixo por modo e a banda diária repassada é proporcional ao disco ({@link BANDWIDTH_PER_DISK}).
 * A pessoa pode repassar menos que o proporcional, nunca mais.
 *
 * @module supporter-mode
 * @see docs/specs/replicacao-por-grau-v0.md
 * @see client/js/seeder-guardian.js
 */

/** Compromisso de banda proporcional ao disco: cada MB guardado rende até 2 MB/dia repassados. */
export const BANDWIDTH_PER_DISK = 2;

/** Nó leve (padrão do Pacto): disco fixo de 100 MB. */
export const LIGHT_LIMITS = Object.freeze({ maxMb: 100, dailyCapMb: 100 * BANDWIDTH_PER_DISK });

/** Nó pesado (Apoiador): disco de 512 a 1024 MB, só no Wi-Fi para não pesar no plano de dados. */
export const SUPPORTER_LIMITS = Object.freeze({ minMb: 512, maxMb: 1024, dailyCapMb: 1024 * BANDWIDTH_PER_DISK });

/** Modo Guardião: cota fixa de 2 GB, só no Wi-Fi e carregando. */
export const GUARDIAN_LIMITS = Object.freeze({ quotaMb: 2048, dailyCapMb: 2048 * BANDWIDTH_PER_DISK });

/**
 * Teto diário de banda para um disco: proporcional ({@link BANDWIDTH_PER_DISK}×).
 *
 * @param {number} maxMb Disco, em MB.
 * @returns {number} Banda diária máxima, em MB.
 */
export function dailyCapForDisk(maxMb) {
  return maxMb * BANDWIDTH_PER_DISK;
}

/**
 * Disco válido para o modo: o nó leve fica fixo em 100 MB; o Apoiador fica entre 512 e 1024 MB.
 *
 * @param {{supporter?: boolean, maxMb?: number}} [settings={}] Configurações de peers.
 * @returns {number} Disco, em MB.
 */
export function clampDiskMb(settings = {}) {
  if (!settings.supporter) return LIGHT_LIMITS.maxMb;
  const mb = Number(settings.maxMb) || SUPPORTER_LIMITS.maxMb;
  return Math.max(SUPPORTER_LIMITS.minMb, Math.min(SUPPORTER_LIMITS.maxMb, mb));
}

/**
 * Ajusta disco e banda ao modo.
 *
 * O teto diário pode ficar abaixo do proporcional (a pessoa escolhe repassar menos), nunca acima;
 * sem valor, vale o proporcional. O mínimo é 1 MB.
 *
 * @param {{supporter?: boolean, maxMb?: number, dailyCapMb?: number}} [settings={}] Configurações de peers.
 * @returns {object} Cópia das configurações com `maxMb` e `dailyCapMb` válidos.
 */
export function normalizeStorageCommitment(settings = {}) {
  const maxMb = clampDiskMb(settings);
  const ceiling = dailyCapForDisk(maxMb);
  const daily = Number(settings.dailyCapMb) || ceiling;
  return { ...settings, maxMb, dailyCapMb: Math.max(1, Math.min(ceiling, daily)) };
}

/**
 * Liga ou desliga o modo Apoiador sem perder as demais preferências.
 *
 * Ligar começa no disco máximo do Apoiador (a pessoa pode baixar até 512 MB), com banda proporcional e
 * só no Wi-Fi. Desligar volta aos limites do nó leve.
 *
 * @param {object} [current={}] Configurações atuais de peers.
 * @param {boolean} [on=true] `true` liga; `false` desliga.
 * @returns {object} Novas configurações (cópia).
 */
export function applySupporterMode(current = {}, on = true) {
  if (!on) {
    return { ...current, supporter: false, dailyCapMb: LIGHT_LIMITS.dailyCapMb, maxMb: LIGHT_LIMITS.maxMb };
  }
  return {
    ...current,
    supporter: true,
    enabled: true,
    wifiOnly: true,
    dailyCapMb: SUPPORTER_LIMITS.dailyCapMb,
    maxMb: SUPPORTER_LIMITS.maxMb,
  };
}
