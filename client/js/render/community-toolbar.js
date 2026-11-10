/** @file Barra de ações do topo da comunidade (extraída de render/community.js). */

import { escapeHtml } from "./util.js";

/** Barra de ações do topo da comunidade. `canCompose` falso esconde "Novo post" (canal, para quem não modera; PM-81). */
export function renderCommunityHeaderToolbar(communityId, commTitle, isMember, canCompose = true) {
  return `
    <div class="community-vox-toolbar" role="toolbar" aria-label="Ações da comunidade">
      <button id="btn-join-comm" type="button" class="community-vox-join-pill${isMember ? " is-member" : ""}" data-id="${escapeHtml(communityId)}" aria-pressed="${isMember ? "true" : "false"}">
        ${isMember ? "✓ Membro" : "Entrar"}
      </button>
      <button id="btn-share-comm" type="button" class="btn btn-sm btn-outline community-vox-btn-share" data-id="${escapeHtml(communityId)}" data-title="${escapeHtml(commTitle)}">Compartilhar</button>
      <button id="btn-export-comm-genesis" type="button" class="btn btn-sm btn-outline community-vox-btn-export" data-id="${escapeHtml(communityId)}" title="Exportar Gênesis e dados offline desta comunidade">💾 Gênesis</button>
      ${canCompose ? `<a class="btn btn-sm btn-primary community-vox-btn-compose" href="#/compose/topic?c=${encodeURIComponent(communityId)}">Novo post</a>` : ""}
    </div>`;
}
