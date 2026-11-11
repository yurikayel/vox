/** @file Modo Apoiador (nó pesado): opt-in por botão sobre o nó leve padrão. */

/** Tetos do nó leve (padrão do Pacto). */
export const LIGHT_LIMITS = Object.freeze({ dailyCapMb: 50, maxMb: 38 });

/** Tetos do nó pesado (Apoiador). Só no Wi-Fi para não pesar no plano de dados. */
export const SUPPORTER_LIMITS = Object.freeze({ dailyCapMb: 500, maxMb: 375 });

/**
 * Liga ou desliga o modo Apoiador sem perder as demais preferências.
 * Ligar nunca reduz um teto que o usuário já tenha ampliado à mão.
 * @param {object} current configurações atuais de peers
 * @param {boolean} on
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
    dailyCapMb: Math.max(Number(current.dailyCapMb) || 0, SUPPORTER_LIMITS.dailyCapMb),
    maxMb: Math.max(Number(current.maxMb) || 0, SUPPORTER_LIMITS.maxMb),
  };
}
