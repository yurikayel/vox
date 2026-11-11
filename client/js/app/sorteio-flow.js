/**
 * @file Sorteio cívico na aba de avisos (lote 4): criar (moderação), ser testemunha, fechar compromissos,
 * revelar, apurar e ver o resultado que todo aparelho recalcula. Lógica pura em `sorteio.js`.
 * O segredo da testemunha fica só no aparelho até a revelação.
 */
import * as cacheNode from "../cache-node.js";
import * as peers from "../peers.js";
import * as localAccount from "../local-account.js";
import * as share from "../share.js";
import * as sorteio from "../sorteio.js";
import { escapeHtml } from "../render/util.js";
import { isModerator } from "../moderation.js";

export const SECRETS_KEY = "vox-sorteio-segredos-v1";

const localOf = (type, communityId) => cacheNode.getLocalPosts({ type, communityId }).catch(() => []);
const short = (route) => `${String(route).slice(0, 12)}…`;

function readSecrets(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage?.getItem(SECRETS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function keepSecret(sorteioId, secret, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SECRETS_KEY, JSON.stringify({ ...readSecrets(storage), [sorteioId]: secret }));
  } catch {}
}

async function publish(payload) {
  const signed = await localAccount.signPayload(payload);
  await cacheNode.saveLocalPost(signed);
  peers.broadcastGossip(signed);
  return signed;
}

const newId = () => `srt_${Math.random().toString(36).slice(2, 10)}`;

async function loadSorteios(ctx) {
  const types = [sorteio.SORTEIO_TYPE, sorteio.COMMIT_TYPE, sorteio.CLOSE_TYPE, sorteio.REVEAL_TYPE, sorteio.TALLY_TYPE];
  const [draws, commits, closes, reveals, tallies] = await Promise.all(types.map((t) => localOf(t, ctx.communityId)));
  const official = draws.filter((d) => d.id && sorteio.decodeRoster(d.roster).length && isMod(d.author, ctx.meta));
  return Promise.all(official.sort((a, b) => Number(b.ts) - Number(a.ts)).map(async (d) => {
    const close = sorteio.firstByModeration(closes, sorteio.CLOSE_TYPE, d, ctx.meta);
    const tally = sorteio.firstByModeration(tallies, sorteio.TALLY_TYPE, d, ctx.meta);
    const mine = reveals.filter((r) => r.sorteioId === d.id);
    const state = await sorteio.sorteioState(d, { close, reveals: mine, tally });
    return { draw: d, close, state, commits: commits.filter((c) => c.sorteioId === d.id), reveals: mine };
  }));
}

const isMod = (author, meta) => isModerator(String(author || ""), meta?.owner, meta?.moderators);

const PHASE = {
  compromissos: "Recebendo testemunhas",
  revelacao: "Testemunhas revelando",
  "sem-testemunhas": "Sem testemunhas suficientes (mínimo 2)",
  sorteado: "Sorteado",
};

function resultHtml(state) {
  if (state.phase !== "sorteado") return "";
  const names = state.winners.map((w) => `<li><code>${escapeHtml(short(w))}</code></li>`).join("");
  return `<ol class="sorteio-winners">${names}</ol><p class="hint">Semente <code>${escapeHtml(state.seed.slice(0, 16))}</code>: qualquer aparelho recalcula o mesmo resultado.</p>`;
}

function warningsHtml(state) {
  const missing = state.missing?.length ? `<p class="hint">Não revelaram: ${state.missing.map((m) => escapeHtml(short(m))).join(", ")}.</p>` : "";
  const ignored = state.ignored?.length
    ? `<p class="banner-info">A apuração deixou de fora revelações válidas de: ${state.ignored.map((m) => escapeHtml(short(m))).join(", ")}.</p>` : "";
  return missing + ignored;
}

function actionButton(action, id, text, primary = false) {
  return `<button type="button" class="btn ${primary ? "btn-primary" : "btn-outline"} btn-sm" data-sorteio-action="${action}" data-sorteio-id="${escapeHtml(id)}">${text}</button>`;
}

/** Botões conforme a fase e quem vê (testemunha com segredo guardado, moderação). */
function actionsHtml(item, { isMod: mod, routeId, secrets }) {
  const { draw, state, close } = item;
  const committed = item.commits.some((c) => c.author === routeId);
  const inClose = sorteio.decodeCommits(close?.commits).some(([a]) => a === routeId);
  const revealed = item.reveals.some((r) => r.author === routeId);
  const out = [];
  if (state.phase === "compromissos" && routeId && !committed) out.push(actionButton("testemunhar", draw.id, "Ser testemunha"));
  if (state.phase === "compromissos" && committed) out.push(`<p class="hint">Você é testemunha. Volte para revelar quando os compromissos fecharem.</p>`);
  if (state.phase === "compromissos" && mod) out.push(actionButton("fechar", draw.id, `Fechar compromissos (${item.commits.length})`));
  if (state.phase === "revelacao" && inClose && !revealed && secrets[draw.id]) out.push(actionButton("revelar", draw.id, "Revelar meu segredo", true));
  if (state.phase === "revelacao" && mod) out.push(actionButton("apurar", draw.id, `Apurar (${state.revealed} de ${state.witnesses} revelaram)`));
  return out.join("");
}

/** Cartão de um sorteio. */
export function renderSorteioCard(item, viewer) {
  const { draw, state } = item;
  const total = sorteio.decodeRoster(draw.roster).length;
  const prazo = new Date(draw.commitUntil).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return `<article class="card sorteio-card" data-sorteio-card="${escapeHtml(draw.id)}">
    <p class="aviso-seal">🎲 Sorteio cívico · ${draw.seats} de ${total} membros · lista <code>${escapeHtml(draw.rosterHash.slice(0, 8))}</code></p>
    <h3>${escapeHtml(draw.title)}</h3>
    <p><strong>${PHASE[state.phase] || ""}</strong> · testemunhas: ${state.witnesses || item.commits.length} · prazo dos compromissos: ${escapeHtml(prazo)}</p>
    ${resultHtml(state)}${warningsHtml(state)}
    <div class="aviso-actions">${actionsHtml(item, viewer)}</div>
  </article>`;
}

function formHtml() {
  return `<details class="card sorteio-new"><summary>Novo sorteio</summary>
    <form id="form-sorteio">
      <label for="sorteio-title">Para quê</label>
      <input id="sorteio-title" class="form-control" name="title" maxlength="80" placeholder="Comissão de contas de dezembro" />
      <label for="sorteio-seats">Quantas pessoas</label>
      <input id="sorteio-seats" class="form-control" name="seats" type="number" min="1" value="3" />
      <label for="sorteio-until">Testemunhas até</label>
      <input id="sorteio-until" class="form-control" name="commitUntil" type="datetime-local" />
      <p class="hint">A lista de membros de agora fica congelada no sorteio. Precisa de pelo menos 2 testemunhas.</p>
      <button type="submit" class="btn btn-outline btn-sm">Assinar e publicar o sorteio</button>
    </form>
  </details>`;
}

/** Seção de sorteios da aba de avisos. */
export function renderSorteiosHtml(items, viewer) {
  const cards = items.map((it) => renderSorteioCard(it, viewer)).join("");
  if (!cards && !viewer.isMod) return "";
  return `<section class="sorteios"><h2>🎲 Sorteios</h2>${viewer.isMod ? formHtml() : ""}${cards}</section>`;
}

const ACTIONS = {
  async testemunhar(item) {
    const secret = sorteio.newSecret();
    keepSecret(item.draw.id, secret);
    await publish({ ...(await sorteio.buildCommit(item.draw, secret)), id: newId() });
    return "Compromisso publicado. Seu segredo ficou só neste aparelho.";
  },
  async fechar(item) {
    await publish({ ...sorteio.buildClose(item.draw, item.commits), id: newId() });
    return "Compromissos fechados. As testemunhas já podem revelar.";
  },
  async revelar(item) {
    await publish({ ...sorteio.buildReveal(item.draw, readSecrets()[item.draw.id]), id: newId() });
    return "Segredo revelado.";
  },
  async apurar(item) {
    const { valid } = await sorteio.matchReveals(item.close, item.reveals);
    await publish({ ...sorteio.buildTally(item.draw, valid), id: newId() });
    return "Apuração publicada.";
  },
};

async function createSorteio(form, ctx) {
  const data = new FormData(form);
  const draft = {
    communityId: ctx.communityId, title: data.get("title"), seats: Number(data.get("seats")),
    members: [...ctx.members], commitUntil: new Date(String(data.get("commitUntil") || "")).getTime() || 0,
  };
  await publish({ ...(await sorteio.buildSorteio(draft)), id: newId() });
}

function bindSorteios(section, ctx, items, rerender) {
  section.addEventListener("click", (e) => {
    const button = e.target.closest("[data-sorteio-action]");
    const item = button && items.find((it) => it.draw.id === button.dataset.sorteioId);
    const action = item && ACTIONS[button.dataset.sorteioAction];
    if (!action) return;
    button.disabled = true;
    action(item).then((msg) => { share.showToast(msg); rerender(); })
      .catch((err) => { share.showToast(`Erro: ${err.message}`, "error"); button.disabled = false; });
  });
  section.querySelector("#form-sorteio")?.addEventListener("submit", (e) => {
    e.preventDefault();
    createSorteio(e.target, ctx).then(() => { share.showToast("Sorteio publicado."); rerender(); })
      .catch((err) => share.showToast(err.message, "error"));
  });
}

/** Monta a seção na aba de avisos. `ctx`: `{ communityId, meta, members, routeId, isMod }`. */
export async function mountSorteios(host, ctx) {
  if (!host) return;
  const items = await loadSorteios(ctx);
  const html = renderSorteiosHtml(items, { isMod: ctx.isMod, routeId: ctx.routeId, secrets: readSecrets() });
  host.querySelector(".sorteios")?.remove();
  if (!html) return;
  host.insertAdjacentHTML("beforeend", html);
  bindSorteios(host.querySelector(".sorteios"), ctx, items, () => mountSorteios(host, ctx));
}
