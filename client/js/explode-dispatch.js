/** @file Fachada de disparo tático EXPLODE! — Fricção zero, ondas de rede e webhooks em lote. */

/** Constante de tags padrão para mobilização. @type {string[]} */
export { DEFAULT_EXPLODE_TAGS } from "./explode-intent.js";

/** Monta texto de mobilização com título, resumo, link e hashtags.
 * @type {Function}
 */
export { buildExplodeText } from "./explode-intent.js";

/** Alias histórico para buildExplodeText.
 * @type {Function}
 */
export { buildJanonesExplodeText } from "./explode-intent.js";

/** Monta URL de compartilhamento no Telegram.
 * @type {Function}
 */
export { buildTelegramShareUrl } from "./explode-intent.js";

/** Monta URL de intenção para o Threads.
 * @type {Function}
 */
export { buildThreadsIntentUrl } from "./explode-intent.js";

/** Monta URL de compartilhamento no Facebook.
 * @type {Function}
 */
export { buildFacebookShareUrl } from "./explode-intent.js";

/** Monta texto conciso para publicação no X (Twitter).
 * @type {Function}
 */
export { buildTwitterExplodeText } from "./explode-intent.js";

/** Monta texto para publicação no Bluesky.
 * @type {Function}
 */
export { buildBlueskyExplodeText } from "./explode-intent.js";

/** Resolve URL de disparo em rajada com hash de auto-submit se suportado.
 * @type {Function}
 */
export { resolveBurstTargetUrl } from "./explode-intent.js";

/** Tenta acionar clique automático do botão de envio de intenção.
 * @type {Function}
 */
export { tryAutoSubmitExplodeIntent } from "./explode-intent.js";

/** Identificador do elemento de folha modal no DOM. @type {string} */
export { EXPLODE_SHEET_ID } from "./explode-ui.js";

/** Caminho da marca visual do Vox. @type {string} */
export { VOX_LOGO_SRC } from "./explode-ui.js";

/** Vetores SVG oficiais dos apps de destino. @type {Record<string, string>} */
export { APP_ICONS } from "./explode-ui.js";

/** Atualiza visualmente o contador de disparos nos botões do DOM.
 * @type {Function}
 */
export { updateExplodeButtonsUi } from "./explode-ui.js";

/** Constrói o HTML completo do painel de disparo EXPLODE!.
 * @type {Function}
 */
export { buildExplodeSheetHtml } from "./explode-ui.js";

/** Abre a folha modal de disparo para uma pauta.
 * @type {Function}
 */
export { openExplodeSheet } from "./explode-ui.js";

/** Fecha o modal de disparo se estiver aberto.
 * @type {Function}
 */
export { closeExplodeSheet } from "./explode-ui.js";

/** Identificador da barra flutuante da esteira sequencial. @type {string} */
export { CASCADE_BAR_ID } from "./explode-crosspost.js";

/** Passos padrão para a esteira sequencial de disparo. @type {Array<{id: string, label: string, icon: string}>} */
export { CASCADE_STEPS } from "./explode-crosspost.js";

/** Remove a barra de esteira sequencial do DOM.
 * @type {Function}
 */
export { removeCascadeBar } from "./explode-crosspost.js";

/** Avança para o próximo passo da esteira sequencial de disparo.
 * @type {Function}
 */
export { advanceCascadeExplode } from "./explode-crosspost.js";

/** Inicia a esteira de disparo em onda sequencial.
 * @type {Function}
 */
export { startCascadeExplode } from "./explode-crosspost.js";

/** Executa disparo simultâneo em rajada para contas conectadas e canais de réplica.
 * @type {Function}
 */
export { executeExplodeBurst } from "./explode-crosspost.js";

/** Disparo rápido tático com cópia imediata e feedback visual.
 * @type {Function}
 */
export { quickExplodePost } from "./explode-crosspost.js";

/** Conecta manipuladores de eventos para disparo tático ao documento.
 * @type {Function}
 */
export { attachExplodeHandlers } from "./explode-events.js";
