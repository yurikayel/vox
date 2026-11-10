/**
 * @file PM-92 — abrir a conta em outro aparelho pelo link ou QR de sincronização.
 * O link leva só o cofre cifrado; a Senha Soberana é digitada aqui. Antes, o link levava a senha junto
 * e bastava sozinho para abrir a conta (print, conversa, histórico do navegador).
 */
import * as render from "../render.js";
import * as share from "../share.js";
import { getActiveUser, makeShellProps } from "./context.js";

/** Tira o cofre (e a senha de links antigos) da barra de endereço e do histórico. */
function scrubSyncHash() {
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#/sync`);
  } catch {
    /* ignore */
  }
}

export function renderSyncFormHtml({ legacyPassphrase = false, hasBundle = true } = {}) {
  const legacy = legacyPassphrase
    ? `<p class="compose-step-lead" role="alert">⚠️ Este link é de uma versão antiga e levava a sua senha junto. Depois de entrar, crie uma Senha Soberana nova e não reaproveite esta.</p>`
    : "";
  const lead = hasBundle
    ? "Digite a Senha Soberana que você criou no outro aparelho."
    : "Digite a Senha Soberana para buscar o seu cofre.";
  return `
    <section class="card guided-card">
      <h2>Entrar com o cofre</h2>
      ${legacy}
      <p class="compose-step-lead">${lead} Ela não vai no link: quem tiver só o link não abre a sua conta.</p>
      <form id="form-sync-vault">
        <input type="password" id="sync-pass" class="form-control agora-inscription" required autocomplete="current-password" placeholder="Senha Soberana" aria-label="Senha Soberana" />
        <button type="submit" class="btn btn-primary" id="btn-sync-vault">Entrar</button>
      </form>
    </section>`;
}

async function restoreWith(pass, bundle) {
  const { restoreFromPassphraseVault, decodeVaultBundleFromUrl } = await import("../oauth-vault.js");
  const directRecord = bundle ? decodeVaultBundleFromUrl(bundle) : null;
  return restoreFromPassphraseVault(pass, null, directRecord);
}

/** Rota `#/sync?b=<cofre>`. O parâmetro `p` de links antigos é ignorado e só gera o aviso. */
export async function showSyncScreen({ bundle = "", legacyPassphrase = false } = {}) {
  scrubSyncHash();
  const main = render.renderShell(makeShellProps(await getActiveUser(), "profile", "Entrar com o cofre"));
  main.innerHTML = renderSyncFormHtml({ legacyPassphrase, hasBundle: Boolean(bundle) });
  main.querySelector("#form-sync-vault")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = main.querySelector("#btn-sync-vault");
    if (btn) btn.disabled = true;
    try {
      const res = await restoreWith(main.querySelector("#sync-pass")?.value || "", bundle);
      if (!res.ok) throw new Error(res.reason);
      share.showToast(`Conta sincronizada. Bem-vindo(a), ${res.displayName || "Cidadão"}!`);
      window.location.hash = "#/";
    } catch (err) {
      share.showToast(`Não foi possível entrar: ${err?.message || "falha desconhecida"}`, "error");
      if (btn) btn.disabled = false;
    }
  });
}
