import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as choice from "../client/js/memory-server-choice.js";
import * as centralMemory from "../client/js/central-memory.js";
import * as oauthVault from "../client/js/oauth-vault.js";
import { renderSyncFormHtml } from "../client/js/app/screens-sync.js";

const EVIL = "https://memoria.exemplo.org";

test("PM-91 - par, servidor ou link só sugerem; nada vai para lá sem a pessoa aceitar", () => {
  localStorage.clear();
  assert.equal(centralMemory.registerDiscoveredMemoryUrl(EVIL), EVIL);
  assert.equal(choice.getChosenMemoryServer(), "");
  assert.ok(!centralMemory.getCentralMemoryUrls().includes(EVIL), "a sugestão não entra na lista de envio");
  assert.equal(centralMemory.getDiscoveredPublicMemoryUrl(), "", "nem é anunciada aos pares");
  assert.equal(localStorage.getItem("vox-relay-buddy-http-url"), null, "nem troca o relay das DMs");
  assert.equal(choice.suggestMemoryServer("http://memoria.exemplo.org", "link"), "", "http fora do aparelho é recusado");
  assert.equal(choice.normalizeMemoryServerUrl("http://127.0.0.1:3921/"), "http://127.0.0.1:3921");
});

test("PM-91 - a pergunta mostra o domínio; aceitar escolhe, recusar não pergunta de novo", () => {
  localStorage.clear();
  choice.suggestMemoryServer(EVIL, "link");
  let asked = "";
  assert.equal(choice.askAboutMemorySuggestion({ confirmFn: (q) => { asked = q; return false; } }), "");
  assert.match(asked, /memoria\.exemplo\.org/);
  assert.match(asked, /link que você abriu/);
  assert.equal(choice.suggestMemoryServer(EVIL, "par"), "", "recusado não volta como sugestão");
  localStorage.clear();
  choice.suggestMemoryServer(EVIL, "par");
  assert.equal(choice.askAboutMemorySuggestion({ confirmFn: () => true }), EVIL);
  assert.equal(centralMemory.getCentralMemoryUrls()[0], EVIL);
  assert.equal(localStorage.getItem("vox-relay-buddy-http-url"), EVIL);
});

test("PM-91 - endereço gravado sem perguntar por versão antiga vira sugestão", () => {
  localStorage.clear();
  localStorage.setItem("vox-central-memory-url", EVIL);
  localStorage.setItem("vox-relay-buddy-http-url", EVIL);
  assert.equal(choice.migrateLegacyMemoryServer(), EVIL);
  assert.equal(choice.getChosenMemoryServer(), "");
  assert.equal(localStorage.getItem("vox-relay-buddy-http-url"), null);
  assert.equal(choice.getMemorySuggestion().source, "anterior");
  localStorage.clear();
  localStorage.setItem("vox-central-memory-url", EVIL);
  localStorage.setItem("vox-relay-buddy-http-url", "https://relay.escolhido.org");
  choice.migrateLegacyMemoryServer();
  assert.equal(localStorage.getItem("vox-relay-buddy-http-url"), "https://relay.escolhido.org", "relay escolhido na tela Rede fica");
});

test("PM-92 - senha curta não vira cofre; a tela de entrada pede a senha e avisa link antigo", async () => {
  const short = await oauthVault.savePassphraseVault("curta 123");
  assert.equal(short.ok, false);
  assert.match(short.reason, /12 caracteres/);
  const html = renderSyncFormHtml({ legacyPassphrase: true });
  assert.match(html, /type="password" id="sync-pass"/);
  assert.match(html, /versão antiga e levava a sua senha/);
  assert.ok(!renderSyncFormHtml().includes("versão antiga"));
});
