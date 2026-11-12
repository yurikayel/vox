/** @file Seção "Backup no seu e-mail" em Sua rede e aviso de backup vencido; cada envio sai de um toque. */

import * as backup from "../inbox-backup.js";
import * as share from "../share.js";
import { escapeHtml } from "../render/util.js";

const LABEL = { semana: "da semana", mes: "do mês", completo: "completo" };
const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString("pt-BR") : "nunca");

/**
 * Seção "Backup no seu e-mail" das configurações.
 * @returns {string} HTML da seção.
 */
export function renderInboxBackupSection() {
  const s = backup.getInboxBackupSettings();
  const intro = `<p class="desc">Toda semana e todo mês o Vox prepara um backup cifrado das suas chaves, contatos, mensagens e
    posts. Você manda para o seu próprio e-mail; o Vox não guarda nem vê o endereço. Para voltar em outro aparelho:
    Perfil → Restaurar Backup e a sua Senha Soberana.</p>`;
  const body = s.ready
    ? `<label><input type="checkbox" id="inbox-backup-weekly" ${s.weekly ? "checked" : ""} /> Semanal: o que mudou na semana</label>
      <label><input type="checkbox" id="inbox-backup-monthly" ${s.monthly ? "checked" : ""} /> Mensal: o mês inteiro, repetido de propósito</label>
      <p class="meta">Último semanal: ${escapeHtml(fmt(s.lastWeekly))} · último mensal: ${escapeHtml(fmt(s.lastMonthly))}</p>
      <button type="button" class="agora-btn agora-btn--secondary" data-inbox-send="completo">Enviar backup completo agora</button>`
    : `<input type="password" id="inbox-backup-pass" class="form-control" autocomplete="current-password" placeholder="Senha Soberana (12 ou mais caracteres)" />
      <button type="button" class="agora-btn agora-btn--primary" id="btn-inbox-backup-enable">Ligar backups</button>`;
  return `<div class="card inbox-backup-settings" style="margin-top:1rem;"><h3>Backup no seu e-mail</h3>${intro}${body}</div>`;
}

async function sendFile({ name, text }) {
  const file = new File([text], name, { type: "text/plain" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: "Backup do Vox", text: "Guarde este e-mail. Só a sua Senha Soberana abre o arquivo." });
    return;
  }
  share.downloadBlob(file, name);
}

/**
 * Envia um backup já montado antes do toque (o compartilhar só aceita a chamada logo depois do gesto).
 * @param {"semana"|"mes"|"completo"} period Período.
 * @param {{name: string, text: string, to: number}} built Arquivo de `buildInboxBackup`.
 * @returns {Promise<boolean>} True se saiu.
 */
export async function sendInboxBackup(period, built) {
  try {
    await sendFile(built);
    backup.markInboxBackupSent(period, built.to);
    share.showToast(`Backup ${LABEL[period]} pronto. Confira se chegou no seu e-mail.`);
    return true;
  } catch (err) {
    if (err?.name !== "AbortError") share.showToast(`Backup não saiu: ${err.message}`, "error");
    return false;
  }
}

/**
 * Liga os eventos da seção depois que ela foi desenhada.
 * @param {() => void} rerender Redesenha a tela.
 */
export function bindInboxBackupSection(rerender) {
  document.getElementById("btn-inbox-backup-enable")?.addEventListener("click", async () => {
    try {
      await backup.enableInboxBackup(document.getElementById("inbox-backup-pass")?.value);
      share.showToast("Backups ligados. Mande o primeiro, completo, agora.");
      rerender();
    } catch (err) {
      share.showToast(err.message, "error");
    }
  });
  for (const [id, key] of [["inbox-backup-weekly", "weekly"], ["inbox-backup-monthly", "monthly"]]) {
    document.getElementById(id)?.addEventListener("change", (e) => backup.setInboxBackupCadence({ [key]: e.target.checked }));
  }
  const btn = document.querySelector("[data-inbox-send]");
  if (!btn) return;
  btn.disabled = true;
  void backup.buildInboxBackup("completo").then((built) => {
    btn.disabled = false;
    btn.addEventListener("click", () => void sendInboxBackup("completo", built));
  });
}

/** Mostra, ao abrir o app, o aviso do backup vencido (o mensal antes do semanal), já montado, um por toque. */
export async function showDueInboxBackup() {
  const period = backup.dueInboxBackups()[0];
  if (!period || document.querySelector(".inbox-backup-due")) return;
  const built = await backup.buildInboxBackup(period).catch(() => null);
  if (!built || document.querySelector(".inbox-backup-due")) return;
  const bar = document.createElement("div");
  bar.className = "card inbox-backup-due";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<p>Seu backup ${LABEL[period]} está pronto. Mande para o seu e-mail.</p>
    <button type="button" class="agora-btn agora-btn--primary" data-act="send">Enviar para meu e-mail</button>
    <button type="button" class="agora-btn agora-btn--secondary" data-act="later">Depois</button>`;
  bar.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    bar.remove();
    if (act === "send" && (await sendInboxBackup(period, built))) void showDueInboxBackup();
  });
  document.body.appendChild(bar);
}
