/** @file Construtor de enquete do compor tópico (extraído de screens-compose.js). */

const POLL_MIN = 2;
const POLL_MAX = 6;

function renumberPollRows(list) {
  [...list.querySelectorAll(".civic-poll-input")].forEach((input, i) => {
    input.placeholder = `Opção ${i + 1}`;
    input.setAttribute("aria-label", `Opção ${i + 1}`);
  });
  const count = list.children.length;
  list.querySelectorAll(".civic-poll-remove").forEach((b) => { b.disabled = count <= POLL_MIN; });
  const add = document.getElementById("btn-civic-poll-add");
  if (add) add.disabled = count >= POLL_MAX;
}

/** Adicionar/remover opções do construtor de enquete. */
export function bindPollBuilder() {
  const list = document.getElementById("civic-poll-options");
  if (!list || list.dataset.bound === "1") return;
  list.dataset.bound = "1";
  document.getElementById("btn-civic-poll-add")?.addEventListener("click", () => {
    if (list.children.length >= POLL_MAX) return;
    const row = list.firstElementChild.cloneNode(true);
    row.querySelector("input").value = "";
    list.appendChild(row);
    renumberPollRows(list);
    row.querySelector("input").focus();
  });
  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".civic-poll-remove");
    if (!btn || list.children.length <= POLL_MIN) return;
    btn.closest(".civic-poll-row")?.remove();
    renumberPollRows(list);
  });
  renumberPollRows(list);
}

export function readPollOptions() {
  return [...document.querySelectorAll("#civic-poll-options .civic-poll-input")].map((i) => i.value.trim()).filter(Boolean);
}
