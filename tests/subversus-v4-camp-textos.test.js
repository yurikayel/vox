/**
 * @file Textos do Acampamento em linguagem simples (V1c da UI v4): "Senha do backup" no lugar de "Senha Soberana",
 * o texto do herói sem "guardiões virtuais", e o teste de queda de nó (botão e aviso) só sob a flag de laboratório da
 * Mesa em rede, desligada por padrão. Também a mensagem de erro da senha curta do backup.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import fs from "node:fs";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { packEncryptedVoxRpg } from "../client/js/dungeon/vtt-portable.js";

const FLAG = "vox.lab.mesa-rede";
const JARGAO = /guardiões virtuais|Senha Soberana|\bk-1\b|\bGPU\b/i;

const textoLido = (html) => html.replace(/<[^>]+>/g, " ") + (html.match(/(?:aria-label|title|placeholder|alt)="[^"]*"/g) || []).join(" ");
const camp = (opts) => renderCampScreen(createDungeonSessionState({}), opts);

test("o texto do herói descreve a função, sem 'guardiões virtuais'", () => {
  const html = camp({ lab: false });
  assert.match(html, /<p class="dungeon-lead">A mesa roda no seu aparelho, sem servidor guardando a partida e sem mensalidade\.<\/p>/);
  assert.doesNotMatch(textoLido(html), /guardiões virtuais/i);
  // O nó de sinalização da mesa em rede é um servidor: "sem servidor central" não tem prova, e "nos aparelhos" (plural)
  // promete a mesa entre aparelhos, que hoje é só laboratório.
  const lead = html.match(/<p class="dungeon-lead">[^<]*<\/p>/)[0];
  assert.doesNotMatch(lead, /servidor central/i);
  assert.doesNotMatch(lead, /nos aparelhos/i);
});

test("o aviso do convite no Escudo do Mestre usa a frase aprovada, sem 'servidor central' nem 'pares P2P'", () => {
  const html = renderDmScreen(createDungeonSessionState({}));
  const aviso = html.match(/<p class="dungeon-muted">Gere um link de convite[^]*?<\/p>/)?.[0];
  assert.ok(aviso, "o aviso do convite aparece enquanto não há link");
  assert.match(aviso, /sincronizar a sala com outros aparelhos, sem servidor guardando a partida\./);
  assert.match(aviso, /O link já leva a chave da sala; mande só para quem vai jogar\./, "avisa que o link leva a chave, sem jargão de fragmento");
  assert.doesNotMatch(aviso, /servidor central|pares P2P|mesma origem/i);
});

test("nenhuma tela da Mesa afirma 'sem servidor central' (o nó de sinalização é um servidor)", () => {
  const dir = new URL("../client/js/dungeon/", import.meta.url);
  for (const name of fs.readdirSync(dir).filter((n) => n.startsWith("screen-") && n.endsWith(".js"))) {
    assert.doesNotMatch(fs.readFileSync(new URL(name, dir), "utf8"), /servidor central/i, name);
  }
});

test("o campo de senha do backup diz 'Senha do backup' (rótulo e placeholder), sem 'Senha Soberana'", () => {
  const html = camp({ lab: false });
  assert.match(html, /<label class="sr-only" for="dungeon-backup-passphrase">Senha do backup cifrado<\/label>/);
  assert.match(html, /placeholder="Senha do backup \(mín\. 12 caracteres\) para cifrar\/abrir \.voxrpg\.enc"/);
  assert.doesNotMatch(textoLido(html), /Senha Soberana/i);
});

test("sem a flag de laboratório o Acampamento não tem o botão de queda de nó nem o aviso dele", () => {
  assert.equal(globalThis.localStorage.getItem(FLAG), null, "flag desligada por padrão");
  const html = camp();
  assert.doesNotMatch(html, /data-dungeon="failover"/);
  assert.doesNotMatch(textoLido(html), JARGAO);
  assert.doesNotMatch(html, /dungeon-inline-status/, "o aviso do teste de queda também some");
  assert.doesNotMatch(html, /Todos os 5 guardiões/);
});

test("com a flag de laboratório (opts.lab ou vox.lab.mesa-rede) o botão e o aviso aparecem", () => {
  for (const html of [camp({ lab: true })]) {
    assert.match(html, /data-dungeon="failover"/);
    assert.match(html, /Testar Queda de GPU \(k-1\)/);
    assert.match(html, /<p class="dungeon-inline-status" role="status">/);
  }
  globalThis.localStorage.setItem(FLAG, "1");
  try {
    assert.match(camp(), /data-dungeon="failover"/, "a flag no armazenamento liga o teste");
    assert.doesNotMatch(camp({ lab: false }), /data-dungeon="failover"/, "opts.lab=false vence a flag");
  } finally {
    globalThis.localStorage.removeItem(FLAG);
  }
  assert.doesNotMatch(camp(), /data-dungeon="failover"/, "voltou ao padrão desligado");
});

test("a senha curta do backup recusa com 'senha do backup', sem 'Senha Soberana'", async () => {
  const campanha = createCampaign({ id: "mesa-sec", name: "Mesa Secreta" });
  await assert.rejects(
    () => packEncryptedVoxRpg(campanha, "curta"),
    (err) => /senha do backup/i.test(err.message) && /12 caracteres/.test(err.message) && !/Soberana/i.test(err.message),
  );
});
