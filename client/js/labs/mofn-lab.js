/**
 * UI lab T02 — não liga ao #/perfil; estado só na sessão da página.
 */
import * as mofn from "./collective-mofn.js";

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const state = {
  n: 3,
  m: 2,
  name: "Coletivo lab",
  statement: "Manifesto local de laboratório — não é a conta deste aparelho.",
  members: [],
  manifesto: null,
  last: "",
};

function readForm(root) {
  const n = Number(root.querySelector("#mofn-n")?.value) || 3;
  const m = Number(root.querySelector("#mofn-m")?.value) || 2;
  const name = root.querySelector("#mofn-name")?.value || "Coletivo lab";
  const statement = root.querySelector("#mofn-text")?.value || "";
  state.n = Math.min(8, Math.max(2, n));
  state.m = Math.min(state.n, Math.max(1, m));
  state.name = name;
  state.statement = statement;
}

function memberLines() {
  if (!state.members.length) return "<p class=\"desc\">Nenhum membro lab gerado nesta sessão.</p>";
  const items = state.members
    .map((mem) => `<li><code>${escapeHtml(mem.routeId)}</code></li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function resultBlock() {
  const json = state.manifesto ? JSON.stringify(state.manifesto, null, 2) : "";
  return `<p class="desc" aria-live="polite">${escapeHtml(state.last)}</p>
    <pre class="mofn-json">${escapeHtml(json)}</pre>`;
}

export function renderMofnLab() {
  return `<div id="mofn-lab">
    <a class="back-link" href="#/">← Início</a>
    <div class="card">
      <h2>Lab M-de-N (tese T02)</h2>
      <p><strong>${escapeHtml(mofn.LAB_SENTENCE)}</strong></p>
      <p class="desc">Chaves efémeras só nesta página. Sem IndexedDB, sem cofre, sem ligar ao <a href="#/perfil">#/perfil</a>.</p>
      <p>
        <label>N <input id="mofn-n" type="number" min="2" max="8" value="${state.n}"></label>
        <label>M <input id="mofn-m" type="number" min="1" max="8" value="${state.m}"></label>
      </p>
      <p><label>Nome <input id="mofn-name" type="text" value="${escapeHtml(state.name)}"></label></p>
      <p><label>Manifesto<br><textarea id="mofn-text" rows="3">${escapeHtml(state.statement)}</textarea></label></p>
      <p>
        <button type="button" class="btn" data-mofn="gen">Gerar N membros lab</button>
        <button type="button" class="btn" data-mofn="sign-m">Assinar com M</button>
        <button type="button" class="btn" data-mofn="sign-m1">Assinar com M−1</button>
        <button type="button" class="btn" data-mofn="tamper">Adulterar texto</button>
        <button type="button" class="btn" data-mofn="verify">Verificar</button>
      </p>
      ${memberLines()}
      ${resultBlock()}
    </div>
  </div>`;
}

function paint(root) {
  const el = root.querySelector("#mofn-lab");
  if (el) el.outerHTML = renderMofnLab();
}

async function generateLab(root) {
  readForm(root);
  const members = [];
  for (let i = 0; i < state.n; i++) members.push(await mofn.generateMember());
  state.members = members;
  state.manifesto = mofn.createDraft({
    name: state.name,
    members,
    threshold: state.m,
    statement: state.statement,
  });
  state.last = `Gerados ${members.length} membros lab (P-256). Rascunho sem assinaturas.`;
  paint(root);
}

async function signLab(root, k) {
  readForm(root);
  if (!state.manifesto || !state.members.length) {
    state.last = "Gere membros lab primeiro.";
    paint(root);
    return;
  }
  const draft = mofn.createDraft({
    name: state.name,
    members: state.members,
    threshold: state.m,
    statement: state.statement,
    issuedAt: state.manifesto.issuedAt,
  });
  const count = Math.max(0, Math.min(k, state.members.length));
  state.manifesto = await mofn.signWithMembers(draft, state.members, count);
  state.last = `Assinado por ${count} membro(s). Limiar M=${state.m}.`;
  paint(root);
}

function tamperLab(root) {
  if (!state.manifesto) {
    state.last = "Nada para adulterar.";
    paint(root);
    return;
  }
  state.manifesto = { ...state.manifesto, statement: state.manifesto.statement + " [adulterado]" };
  state.last = "Texto do manifesto adulterado; assinaturas devem falhar.";
  paint(root);
}

async function verifyLab(root) {
  const result = await mofn.verifyManifest(state.manifesto);
  state.last = result.ok
    ? `Válido: ${result.validCount}/${result.required}.`
    : `Inválido (${result.reason}): ${result.validCount}/${result.required}.`;
  paint(root);
}

async function handleMofnClick(root, action) {
  if (action === "gen") return generateLab(root);
  if (action === "sign-m") return signLab(root, state.m);
  if (action === "sign-m1") return signLab(root, state.m - 1);
  if (action === "tamper") return tamperLab(root);
  if (action === "verify") return verifyLab(root);
}

export function wireMofnLab(root) {
  root.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-mofn]");
    if (!btn) return;
    void handleMofnClick(root, btn.dataset.mofn);
  });
}
