/**
 * @file PM-83 lotes B e C: a denúncia também vai, por mensagem cifrada, ao moderador natural de cada lado.
 * - N1 (lado do denunciado) vê o post e o motivo, nunca quem denunciou. Com vínculo de padrinho e poder firme
 *   (lote D: até 30 afilhados, menos de 3 reversões), arquiva para todos com a prova do vínculo.
 * - N2 (lado de quem denunciou), ou N1 sem poder firme, manda a concordância à moderação: o post fica em revisão.
 * - Qualquer um pode recusar sem custo: o caso segue com a moderação da comunidade na hora.
 * - Motivo grave (imagem íntima, abuso infantil, violência) não vai ao moderador natural: segue pela moderação
 *   e pelos canais oficiais, sem expor o conteúdo a mais gente.
 */
import * as natural from "../natural-mod.js";
import { escapeHtml } from "../render/util.js";
import { REPORT_REASONS, isGraveReason } from "../report.js";

export const CASES_KEY = "vox-casos-naturais-v1";
const CASES_MAX = 200;

function readCases(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(CASES_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCases(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CASES_KEY, JSON.stringify(list.slice(-CASES_MAX)));
  } catch {}
}

export const listCases = (storage) => readCases(storage);

function updateCase(caseId, side, patch, storage) {
  writeCases(readCases(storage).map((c) => (c.caseId === caseId && c.side === side ? { ...c, ...patch } : c)), storage);
}

async function dmDeps() {
  const [gql, peers, cryptoDm, cacheNode, wire] = await Promise.all([
    import("../graphql.js"), import("../peers.js"), import("../crypto-dm.js"), import("../cache-node.js"), import("./dm-wire.js"),
  ]);
  return {
    getDmPub: async (addr) => gql.getCachedUserDmPub(addr) || peers.getPeerDmPub(addr) || (await gql.fetchUserDmPub(addr)),
    seal: (pub, text, meta) => cryptoDm.seal(pub, text, meta),
    dispatch: (addr, envelope) => wire.dispatchSealedEnvelope(addr, envelope),
    saveDm: (msg) => cacheNode.saveDmMessage(msg),
  };
}

/** Manda uma DM cifrada e guarda no fio. Devolve o estado da entrega ou "no-key". */
export async function sendDm(self, to, { payload, text, card = null }, d) {
  const pub = await d.getDmPub(to).catch(() => null);
  if (!pub) return "no-key";
  const envelope = await d.seal(pub, payload, { from: self, to });
  const status = await d.dispatch(to, envelope);
  await d.saveDm({ id: envelope.id, peerAddress: to, from: self, to, text, contextCard: card, ts: envelope.ts, status });
  return status;
}

const NOTICE_TEXT = {
  target: "Denúncia sobre um post de alguém pelo qual você responde no Vox. Você vê o post e o motivo; quem denunciou fica em sigilo. Decida na tela Pessoas → Meus vínculos.",
  reporter: "Alguém pelo qual você responde no Vox denunciou este post. Decida na tela Pessoas → Meus vínculos.",
};

/** Quem denunciou: avisa N1 e N2. `rec`: a denúncia (`report.js`); `target`: autor do post. */
export async function sendCaseNotices(self, rec, { target, members = null }, deps = null) {
  if (isGraveReason(rec.reason)) return [];
  const d = deps || { ...(await dmDeps()), loadLinks: async () => (await import("./natural-mod-flow.js")).loadLinks() };
  const { n1, n2 } = natural.caseModerators(await d.loadLinks(), { target, reporter: self, members });
  const plan = [n1 && { to: n1.route, side: "target" }, n2 && n2.route !== n1?.route && { to: n2.route, side: "reporter" }].filter(Boolean);
  const out = [];
  for (const { to, side } of plan) {
    const notice = natural.buildCaseNotice({ caseId: rec.id, postId: rec.postId, communityId: rec.communityId, target, reason: rec.reason, side, reporter: self });
    const card = { type: "topic", id: rec.postId, title: "Denúncia para você decidir" };
    out.push({ to, side, status: await sendDm(self, to, { payload: natural.serializeCaseDm(notice, NOTICE_TEXT[side]), text: NOTICE_TEXT[side], card }, d) });
  }
  return out;
}

/** Aparelho do moderador natural: guarda o caso (sem repetir). Devolve true se guardou. */
export function receiveCase(notice, { from = "", now = Date.now(), storage } = {}) {
  const list = readCases(storage);
  if (list.some((c) => c.caseId === notice.caseId && c.side === notice.side)) return false;
  writeCases([...list, { ...notice, from, receivedAt: now, status: "aberto" }], storage);
  return true;
}

const reasonLabel = (id) => REPORT_REASONS.find((r) => r.id === id)?.label || "não informado";
const STATUS = { arquivado: "Você arquivou para todos.", revisao: "Mandado para a moderação revisar.", recusado: "Você não quis decidir; seguiu para a moderação." };

function caseButtons(c, firm) {
  const id = escapeHtml(c.caseId);
  const btn = (action, text, cls = "btn-outline") =>
    `<button type="button" class="btn ${cls} btn-sm" data-case-action="${action}" data-case-id="${id}" data-case-side="${c.side}">${text}</button>`;
  const agree = firm ? btn("arquivar", "Arquivar para todos", "btn-primary") : btn("revisao", "Concordo: mandar para revisão", "btn-primary");
  return `<div class="aviso-actions">${agree}${btn("recusar", "Não quero decidir")}</div>`;
}

/** Lista de casos para quem é moderador natural. `firmFor(target)`: tenho poder firme sobre esta pessoa? */
export function renderCasesHtml(cases = [], firmFor = () => false) {
  if (!cases.length) return "";
  const items = cases.map((c) => {
    const who = c.side === "target" ? "Post de alguém pelo qual você responde" : "Denúncia feita por alguém pelo qual você responde";
    const done = c.status !== "aberto" ? `<p class="hint">${STATUS[c.status] || ""}</p>` : caseButtons(c, c.side === "target" && firmFor(c.target));
    return `<li class="natural-case"><p>${who} · motivo: <strong>${escapeHtml(reasonLabel(c.reason))}</strong> ·
      <a href="#/t/${encodeURIComponent(c.postId)}">ver o post</a></p>${done}</li>`;
  }).join("");
  return `<div class="natural-cases"><h3>Casos para você decidir</h3><ul>${items}</ul>
    <p class="hint">Arquivar esconde o post para todos até a moderação da comunidade rever. Se a moderação desfizer 3 vezes em 90 dias, você perde esse poder nesta comunidade.</p></div>`;
}

async function moderatorOf(c) {
  const { resolveModeratorRoute } = await import("./report-flow.js");
  return (await resolveModeratorRoute(c.postId, c.communityId)).moderator;
}

const MOD_TEXT = {
  revisao: "O moderador natural concorda com a denúncia deste post. O caso segue em revisão com você.",
  recusado: "O moderador natural não quis decidir sobre este post. O caso segue com você.",
};

async function tellModerator(self, c, kind, d) {
  const mod = await moderatorOf(c);
  if (!mod || mod === self) return "sem-moderacao";
  const card = { type: "topic", id: c.postId, title: "Caso do moderador natural" };
  return sendDm(self, mod, { payload: JSON.stringify({ __vox_dm_v2: 1, kind: "message", text: MOD_TEXT[kind], contextCard: card }), text: MOD_TEXT[kind], card }, d);
}

async function archiveFirm(self, c) {
  const [cacheNode, localAccount, peers] = await Promise.all([import("../cache-node.js"), import("../local-account.js"), import("../peers.js")]);
  const proof = (await cacheNode.getWirePosts()).find((r) => r.type === "vox-link" && r.kind === "confirm" && r.author === self && r.to === c.target && r.sponsor === true);
  if (!proof) throw new Error("Não achei o vínculo de padrinho neste aparelho.");
  const signed = await localAccount.signPayload({ ...natural.buildNaturalHide({ communityId: c.communityId, postId: c.postId, target: c.target, proofRecord: proof }), id: `nat_${c.caseId}` });
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
}

/** Decide um caso: "arquivar" (N1 com poder firme), "revisao" ou "recusar". */
export async function decideCase(self, c, action, deps = null) {
  if (action === "arquivar") {
    await archiveFirm(self, c);
    updateCase(c.caseId, c.side, { status: "arquivado" });
    return "Arquivado para todos. A moderação da comunidade pode desfazer.";
  }
  const d = deps || (await dmDeps());
  const kind = action === "revisao" ? "revisao" : "recusado";
  await tellModerator(self, c, kind, d);
  updateCase(c.caseId, c.side, { status: kind });
  return kind === "revisao" ? "Mandado para a moderação revisar." : "Caso devolvido à moderação da comunidade.";
}
