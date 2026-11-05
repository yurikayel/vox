import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderInlineComposer } from "../client/js/render/feed.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const css = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const feedJs = fs.readFileSync(path.join(root, "js/render/feed.js"), "utf8");
const composerJs = fs.readFileSync(path.join(root, "js/inline-composer.js"), "utf8");

test("voice record toggle - renderiza botão toggle integrado e sem barra antiga volumosa", () => {
  const html = renderInlineComposer({ userRouteId: "vx_test_user" });

  assert.ok(html.includes('id="btn-inline-mic"'), "deve conter botão de microfone inline");
  assert.ok(html.includes("btn-mic-icon"), "deve conter ícone do microfone para estado repouso");
  assert.ok(html.includes("btn-mic-recording-content"), "deve conter container de gravação dentro do próprio botão");
  assert.ok(html.includes('id="inline-recording-timer"'), "deve mostrar o tempo de gravação no próprio botão");
  assert.ok(html.includes("00:00 / 01:00"), "deve inicializar com o formato 00:00 / 01:00");
  assert.ok(html.includes('id="btn-inline-cancel-rec"'), "deve conter botão discreto de cancelamento");
  assert.ok(!html.includes('id="inline-recording-indicator"'), "a barra volumosa antiga deve ser removida do formulário");
});

test("voice record toggle - CSS define estados compacto e ativo com animação e isolamento", () => {
  assert.ok(css.includes(".btn-inline-mic.is-recording"), "deve conter classe do estado gravando no botão");
  assert.ok(css.includes(".inline-composer-tools.is-recording-mode"), "deve focar no botão toggle ocultando outras ferramentas");
  assert.ok(css.includes(".recording-pulse"), "deve conter animação de pulso vermelho");
  assert.ok(css.includes(".recording-stop-icon"), "deve conter ícone de stop/concluir no botão");
  assert.ok(css.includes(".btn-rec-cancel"), "deve conter estilização do botão de cancelamento");
});

test("voice record toggle - JS implementa lógica toggle e limite estrito de 1 minuto (60s)", () => {
  // Valida que o toque no botão atua como toggle (se gravando -> para; senão -> inicia)
  assert.ok(composerJs.includes("if (state.isRecording)"), "deve verificar estado isRecording ao tocar");
  assert.ok(composerJs.includes("state.stopVoiceRecording()"), "deve parar gravação ao tocar novamente");
  assert.ok(composerJs.includes("startVoiceRecording(state)"), "deve iniciar gravação no primeiro toque");

  // Valida encerramento automático ao atingir 1 minuto (60 segundos)
  assert.ok(composerJs.includes("state.recordingSeconds >= 60"), "deve encerrar gravação aos 60 segundos");
  assert.ok(composerJs.includes("00:00 / 01:00"), "deve exibir contador relativo ao teto de 1 minuto");
});
