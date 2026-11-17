/**
 * Arnês dos testes de guardiões (partes 3b e 3d): dona e guardiões são contas reais neste mesmo navegador, e cada
 * guardião tem a própria guarda de pedaços (`onDevice`). As dependências de rede de `app/guardians-flow.js` viram
 * uma caixa de saída em memória.
 */
import * as guardians from "../client/js/guardians.js";
import * as flow from "../client/js/app/guardians-flow.js";
import * as localAccount from "../client/js/local-account.js";
import * as keyLock from "../client/js/key-lock.js";
import { openRecoverySecret } from "../client/js/account-phrase.js";

const heldByDevice = new Map();

/** Troca a guarda de pedaços para a do aparelho `who` enquanto `fn` roda. */
export async function onDevice(who, fn) {
  const saved = localStorage.getItem(guardians.HELD_STORAGE);
  if (heldByDevice.has(who)) localStorage.setItem(guardians.HELD_STORAGE, heldByDevice.get(who));
  else localStorage.removeItem(guardians.HELD_STORAGE);
  try {
    return await fn();
  } finally {
    heldByDevice.set(who, localStorage.getItem(guardians.HELD_STORAGE) || "{}");
    if (saved == null) localStorage.removeItem(guardians.HELD_STORAGE);
    else localStorage.setItem(guardians.HELD_STORAGE, saved);
  }
}

export function makeDeps(me, outbox, overrides = {}) {
  return {
    getMe: () => me,
    getOwnerName: () => "Ana",
    getDmPub: async () => ({ kty: "EC" }),
    sign: (body) => localAccount.signPayload(body),
    verify: (signed) => localAccount.verifyPayload(signed),
    seal: async (_pub, text, meta) => ({ ...meta, text }),
    dispatch: async (to, env) => {
      outbox.push(env);
      return "delivered";
    },
    openSecret: (pass) => openRecoverySecret(pass),
    follows: () => true,
    addedMe: () => true,
    alert: () => {},
    ...overrides,
  };
}

export async function setup(count = 3) {
  await localAccount.wipeLocalAccount();
  localStorage.clear();
  heldByDevice.clear();
  keyLock.__resetKeyLockForTests();
  const owner = (await localAccount.ensureLocalAccount()).routeId;
  const ids = [];
  for (let i = 0; i < count; i++) ids.push((await localAccount.createAdditionalAccount({ displayName: `G${i}` })).routeId);
  await localAccount.switchActiveAccount(owner);
  return { owner, ids };
}

/** Entrega no aparelho de cada guardião as mensagens para ele; devolve o que eles mandaram de volta. */
export async function deliverToGuardians(owner, messages, overrides = {}) {
  const replies = [];
  for (const env of messages) {
    await localAccount.switchActiveAccount(env.to);
    await onDevice(env.to, () => flow.receiveGuardianDm({ from: env.from }, env.text, makeDeps(env.to, replies, overrides)));
  }
  await localAccount.switchActiveAccount(owner);
  return replies;
}

export async function deliverToOwner(owner, replies) {
  for (const env of replies) await flow.receiveGuardianDm({ from: env.from }, env.text, makeDeps(owner, []));
}
