/**
 * @file Fluxo do aviso assinado no app (lote D): aba de avisos, compositor, respostas, envio pelo WhatsApp,
 * link de conferência sob demanda, contagem colada, cancelamento e chamada de ação (papéis e quórum).
 * Atrás da flag de laboratório `vox.lab.aviso`.
 * Spec: docs/specs/aviso-assinado-v0.md.
 */
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";
import * as render from "../render.js";
import * as aviso from "../aviso.js";
import * as roles from "../aviso-roles.js";
import { myRoleFor, mySkills, receivedClaims, saveMySkills, sendRoleClaim } from "./aviso-roles-dm.js";
import { countPastedReplies } from "../aviso-replies.js";
import { isModerator } from "../moderation.js";
import * as avisoView from "../render/aviso.js";
import { bindComposeStepper } from "./compose-stepper.js";
import { renderComposeBlocked } from "../render/compose-steps.js";
import { getActiveUser, makeShellProps } from "./context.js";
import { resolveCommunityMetadata } from "./screens-community.js";

/**
 * Chave em `localStorage` da flag de laboratório dos avisos (valor `"1"` liga).
 *
 * A mesma flag liga o termo de convivência e a chamada de ação.
 *
 * @type {string}
 */
export const AVISO_LAB_KEY = "vox.lab.aviso";

/**
 * Diz se a flag de laboratório dos avisos está ligada neste aparelho.
 *
 * @param {Storage} [storage=globalThis.localStorage] Armazenamento lido (injetável nos testes).
 * @returns {boolean} `false` também quando o armazenamento está bloqueado.
 */
export function avisoLabOn(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(AVISO_LAB_KEY) === "1";
  } catch {
    return false;
  }
}

const lastTs = (items, author, field) =>
  Math.max(0, ...items.filter((m) => (m.author || m.owner) === author).map((m) => Number(m[field] || m.ts || 0)));

/**
 * Calcula quem está no grupo: quem entrou depois da última saída. O dono conta sempre.
 *
 * @param {object[]} [joins=[]] Entradas (`membership`) já verificadas.
 * @param {object[]} [leaves=[]] Saídas (`membership_leave`) já verificadas.
 * @param {string} [owner=""] Rota do dono da comunidade.
 * @returns {Set<string>} Rotas dos membros.
 */
export function memberSet(joins = [], leaves = [], owner = "") {
  const members = new Set(owner ? [owner] : []);
  for (const author of new Set(joins.map((m) => m.author || m.owner).filter(Boolean))) {
    if (lastTs(joins, author, "joinedAt") > lastTs(leaves, author, "leftAt")) members.add(author);
  }
  return members;
}

const localOf = (type, communityId) => cacheNode.getLocalPosts({ type, communityId }).catch(() => []);

async function loadContext(communityId) {
  const meta = await resolveCommunityMetadata(communityId);
  const [topics, responses, counts, roleCounts, joins, leaves] = await Promise.all(
    ["topic", "aviso-resposta", "aviso-contagem", roles.ROLE_COUNT_TYPE, "membership", "membership_leave"].map((t) => localOf(t, communityId)),
  );
  const routeId = await localAccount.getRouteId();
  const members = memberSet(joins, leaves, meta.owner);
  const isMod = isModerator(routeId, meta.owner, meta.moderators);
  return { communityId, meta, topics, responses, counts, roleCounts, members, routeId, isMod };
}

function myChoice(responses, avisoId, routeId) {
  const mine = responses.filter((r) => r.avisoId === avisoId && r.author === routeId);
  mine.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
  return mine[0]?.choice || "";
}

async function buildItems(ctx, now = Date.now()) {
  const classified = aviso.classifyAvisos(ctx.topics, ctx.meta, now);
  return Promise.all(classified.map(async (a) => ({
    aviso: a,
    code: await aviso.avisoCode(a),
    tally: aviso.tallyAvisoResponses(ctx.responses, a.id, ctx.members),
    count: aviso.latestAvisoCount(ctx.counts, a.id, ctx.meta),
    myChoice: myChoice(ctx.responses, a.id, ctx.routeId),
    ...callFields(ctx, a, now),
  })));
}

/** Chamada de ação: vagas e quórum para todos; os nomes, só no aparelho de quem convocou. */
function callFields(ctx, a, now) {
  const call = roles.actionCallState(a, roles.latestRoleCount(ctx.roleCounts, a.id, ctx.meta), now);
  if (!call) return {};
  const mine = a.author === ctx.routeId;
  const received = mine ? [...roles.latestClaims(receivedClaims(a.id), a.id).values()] : null;
  const myRole = myRoleFor(a.id);
  const suggested = myRole ? [] : roles.suggestedRoles(mySkills(), call);
  return { call, myRole, received, suggested };
}

const newId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

async function signAndPublish(payload) {
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  return signed;
}

/**
 * Abre a aba `#/c/<id>/avisos`: carrega avisos, respostas e contagens, desenha e liga as ações.
 *
 * @param {string} communityId Comunidade.
 * @returns {Promise<void>}
 */
export async function showAvisos(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "communities", "Avisos"));
  const ctx = await loadContext(communityId);
  const items = await buildItems(ctx);
  avisoView.renderAvisosScreen(main, {
    communityId,
    title: ctx.meta.title || communityId,
    items,
    isMod: ctx.isMod,
    canRespond: Boolean(ctx.routeId),
    skills: mySkills(),
  });
  bindAvisoActions(main, ctx, items);
  bindSkillsForm(main, communityId);
}

/**
 * Fixa no topo da comunidade o aviso ativo mais recente e o caminho para a aba. Só com a flag.
 *
 * @param {HTMLElement} main Contêiner da tela da comunidade.
 * @param {string} communityId Comunidade aberta.
 * @returns {Promise<void>}
 */
export async function mountCommunityAvisoBanner(main, communityId) {
  if (!main || !avisoLabOn()) return;
  const ctx = await loadContext(communityId);
  const pinned = (await buildItems(ctx)).find((item) => item.aviso.avisoState === "ativo") || null;
  main.insertAdjacentHTML("afterbegin", avisoView.renderPinnedAviso(pinned, communityId));
}

function readDraft(form, communityId) {
  const data = new FormData(form);
  const kind = String(data.get("avisoKind") || "");
  const eventAt = kind === "convocacao" ? new Date(String(data.get("eventAt") || "")).getTime() || 0 : 0;
  return {
    communityId,
    avisoKind: kind,
    title: data.get("title"),
    body: data.get("body"),
    eventAt,
    eventPlace: kind === "convocacao" ? data.get("eventPlace") : "",
    roleSlots: kind === "convocacao" ? data.get("roleSlots") : "",
    quorumMin: kind === "convocacao" ? data.get("quorumMin") : "",
  };
}

const DRAFT_ERRORS = {
  title: "O título precisa ter de 8 a 80 letras.",
  body: "O texto passa de 280 letras.",
  eventAt: "Convocação precisa de data e hora.",
  eventPlace: "O lugar passa de 80 letras.",
  roleSlots: "Papéis: nome e vagas separados por vírgula (ex.: jurídico 2, apoio 5), até 6 papéis e 99 vagas cada.",
  quorumMin: "O quórum vai de 1 até o total de vagas.",
};

const ROLE_SENT = {
  delivered: "Resposta enviada a quem convocou.",
  "queued-relay": "Resposta na fila: chega quando quem convocou ficar online.",
  "pending-retry": "Resposta guardada: o app tenta enviar de novo.",
  "no-key": "Não achei a chave de mensagem de quem convocou. Tente mais tarde.",
};

async function handleComposeSubmit(e, communityId, meta) {
  e.preventDefault();
  const form = e.currentTarget;
  const draft = readDraft(form, communityId);
  const problems = aviso.validateAvisoDraft(draft);
  const error = form.querySelector("[data-aviso-error]");
  if (problems.length) {
    error.textContent = problems.map((p) => DRAFT_ERRORS[p] || p).join(" ");
    error.hidden = false;
    return;
  }
  form.querySelector("#btn-publish-aviso").disabled = true;
  const signed = await signAndPublish({
    ...aviso.buildAviso(draft),
    id: newId("avi"),
    authorDisplay: localAccount.getDisplayName() || "",
  });
  share.showToast("Aviso assinado e publicado. Agora envie pelo WhatsApp.");
  location.hash = `#/c/${encodeURIComponent(meta.id || communityId)}/avisos?enviar=${encodeURIComponent(signed.id)}`;
}

/**
 * Abre o compositor `#/compose/aviso?c=<id>`. Só dono e moderação conseguem publicar.
 *
 * @param {string} communityId Comunidade do aviso.
 * @returns {Promise<void>}
 */
export async function showComposeAviso(communityId) {
  const user = await getActiveUser();
  const main = render.renderShell(makeShellProps(user, "compose", "Novo aviso"));
  const ctx = await loadContext(communityId);
  if (!ctx.isMod) {
    const c = encodeURIComponent(communityId);
    main.innerHTML = renderComposeBlocked({
      title: "Avisos são da moderação",
      body: "Só o dono e a moderação desta comunidade publicam avisos. Para levar um assunto à comunidade, abra um tópico.",
      actions: [
        { href: `#/compose/topic?c=${c}`, label: "Abrir um tópico", primary: true },
        { href: `#/c/${c}`, label: "← Voltar à comunidade" },
      ],
    });
    return;
  }
  avisoView.renderAvisoComposer(main, communityId);
  const form = document.getElementById("form-compose-aviso");
  bindComposeStepper(form);
  const body = form.querySelector("#aviso-body");
  body.addEventListener("input", () => { form.querySelector("[data-aviso-counter]").textContent = String(body.value.length); });
  form.addEventListener("submit", (e) => void handleComposeSubmit(e, communityId, ctx.meta).catch((err) => {
    share.showToast(`Erro: ${err.message}`, "error");
    form.querySelector("#btn-publish-aviso").disabled = false;
  }));
}

function sheetFor(main, avisoId) {
  return main.querySelector(`[data-aviso-sheet="${CSS.escape(avisoId)}"]`);
}

function conferLink(signed) {
  const base = new URL("aviso.html", location.href.split("#")[0]);
  return `${base.href}#${aviso.encodeAvisoFragment(signed)}`;
}

const ACTIONS = {
  async responder(ctx, item, button) {
    await signAndPublish({ ...aviso.buildAvisoResponse(item.aviso, button.dataset.choice), id: newId("avr") });
    share.showToast("Resposta assinada.");
    await showAvisos(ctx.communityId);
  },
  enviar(ctx, item, _button, main) {
    const text = aviso.buildAvisoShareText({ aviso: item.aviso, communityName: ctx.meta.title, code: item.code });
    avisoView.renderShareSheet(sheetFor(main, item.aviso.id), { avisoId: item.aviso.id, text });
  },
  async link(ctx, item, _button, main) {
    // O link leva a forma assinada: o registro local normalizado tem campos a mais e não confere.
    const signed = await cacheNode.getPostRecord(item.aviso.id);
    if (!signed) throw new Error("Aviso não encontrado neste aparelho.");
    const text = aviso.buildAvisoShareText({ aviso: item.aviso, communityName: ctx.meta.title, code: item.code });
    const linkMessage = aviso.buildAvisoLinkMessage({ code: item.code, link: conferLink(signed) });
    avisoView.renderShareSheet(sheetFor(main, item.aviso.id), { avisoId: item.aviso.id, text, linkMessage });
  },
  colar(_ctx, item, _button, main) {
    avisoView.renderPasteSheet(sheetFor(main, item.aviso.id), item.aviso.id);
  },
  async contar(ctx, item, _button, main) {
    const pasted = sheetFor(main, item.aviso.id).querySelector("[data-aviso-paste]");
    const { counts, counted, ignored } = countPastedReplies(pasted.value, item.code);
    pasted.value = "";
    await signAndPublish({ ...aviso.buildAvisoCount(item.aviso, counts), id: newId("avc") });
    share.showToast(`${counted} respostas contadas, ${ignored} linhas ignoradas.`);
    await showAvisos(ctx.communityId);
  },
  async assumir(ctx, item, button) {
    const user = await getActiveUser();
    const opts = { role: button.dataset.role || "", display: localAccount.getDisplayName() || "", code: item.code };
    share.showToast(ROLE_SENT[await sendRoleClaim(user, item.aviso, opts)] || "Resposta enviada.");
    await showAvisos(ctx.communityId);
  },
  async "publicar-papeis"(ctx, item) {
    const counts = roles.tallyRoles(receivedClaims(item.aviso.id), item.aviso.id);
    await signAndPublish({ ...roles.buildRoleCount(item.aviso, counts), id: newId("avp") });
    share.showToast("Contagem por papel assinada e publicada. Os nomes ficaram só com você.");
    await showAvisos(ctx.communityId);
  },
  async cancelar(ctx, item) {
    if (!confirm("Cancelar este aviso? Para corrigir, publique um novo depois.")) return;
    const draft = { communityId: ctx.communityId, avisoKind: "informe", title: `Cancelado: ${item.aviso.title}`.slice(0, 80), cancels: item.aviso.id };
    await signAndPublish({ ...aviso.buildAviso(draft), id: newId("avi"), authorDisplay: localAccount.getDisplayName() || "" });
    share.showToast("Aviso cancelado. Avise o grupo no WhatsApp.");
    await showAvisos(ctx.communityId);
  },
};

/** Competências: só neste aparelho, para sugerir papel quando chega uma chamada. */
function bindSkillsForm(main, communityId) {
  main.querySelector("#aviso-skills-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const skills = roles.parseSkillsInput(new FormData(e.target).get("skills"));
    if (!skills) {
      share.showToast(`Até ${roles.SKILL_MAX} competências, separadas por vírgula, cada uma com 2 a 24 letras.`, "error");
      return;
    }
    saveMySkills(skills);
    share.showToast("Competências guardadas só neste aparelho.");
    await showAvisos(communityId);
  });
}

function openRequestedShare(main, ctx, items) {
  const wanted = new URLSearchParams(location.hash.split("?")[1] || "").get("enviar");
  const item = wanted && items.find((i) => i.aviso.id === wanted);
  if (item) ACTIONS.enviar(ctx, item, null, main);
}

function bindAvisoActions(main, ctx, items) {
  main.addEventListener("click", (e) => {
    const button = e.target.closest("[data-aviso-action]");
    const item = button && items.find((i) => i.aviso.id === button.dataset.avisoId);
    const action = item && ACTIONS[button.dataset.avisoAction];
    if (!action) return;
    button.disabled = true;
    Promise.resolve(action(ctx, item, button, main))
      .catch((err) => share.showToast(`Erro: ${err.message}`, "error"))
      .finally(() => { button.disabled = false; });
  });
  if (ctx.isMod) openRequestedShare(main, ctx, items);
}
