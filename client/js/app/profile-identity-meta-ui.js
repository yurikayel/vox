/** @file Bind de formulário e chips de pronomes, gênero e orientação sexual no perfil. */
import * as share from "../share.js";
import {
  clearLocalIdentityMeta,
  setLocalIdentityMeta,
} from "../profile-identity-meta.js";

function syncChipPressedState(val) {
  const norm = String(val || "").trim().toLowerCase();
  document.querySelectorAll("[data-pronoun-preset]").forEach((btn) => {
    const match = Boolean(norm) && norm === String(btn.dataset.pronounPreset || "").toLowerCase();
    btn.classList.toggle("is-active", match);
    btn.setAttribute("aria-pressed", match ? "true" : "false");
  });
}

function bindPronounPresetChips(inputEl) {
  document.querySelectorAll("[data-pronoun-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.dataset.pronounPreset || "";
      if (inputEl) {
        inputEl.value = preset;
        inputEl.focus();
      }
      syncChipPressedState(preset);
    });
  });
  inputEl?.addEventListener("input", () => syncChipPressedState(inputEl.value));
}

function readFormMetaValues() {
  return {
    pronouns: document.getElementById("input-profile-pronouns")?.value || "",
    gender: document.getElementById("input-profile-gender")?.value || "",
    orientation: document.getElementById("input-profile-orientation")?.value || "",
  };
}

/**
 * Conecta chips, salvamento e limpeza dos campos opcionais de identidade na aba Sobre.
 * @param {{ address: string, activeTab: string, isSelf: boolean, onAfterSave: Function }} opts Contexto.
 */
export function bindIdentityMetaForm({ address, activeTab, isSelf, onAfterSave }) {
  if (!isSelf) return;
  const form = document.getElementById("form-identity-meta");
  if (!form) return;

  bindPronounPresetChips(document.getElementById("input-profile-pronouns"));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setLocalIdentityMeta(address, readFormMetaValues());
    share.showToast("Pronomes e identidade atualizados!");
    onAfterSave(address, activeTab);
  });

  document.getElementById("btn-clear-identity-meta")?.addEventListener("click", () => {
    clearLocalIdentityMeta(address);
    share.showToast("Campos opcionais removidos.");
    onAfterSave(address, activeTab);
  });
}
