/**
 * @file Cobertura T6: fluxo do aviso assinado (`app/aviso-flow.js`) de ponta a ponta sobre um DOM de mentira,
 * com identidade e cache reais: aba de avisos, respostas, envio, contagem colada, agenda, cancelamento,
 * competências, chamada de ação, compositor e aviso fixado na comunidade.
 */
import "./setup.js";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom, mount, click, captureToasts } from "./helpers/cov-t6-dom.mjs";

const doc = installFakeDom();
const toasts = captureToasts(doc);
mount(doc, '<div id="app-root"></div>');
globalThis.location.href = "https://vox.example/app/#/c/geral/avisos";
localStorage.setItem("vox.lab.aviso", "1");

const flow = await import("../client/js/app/aviso-flow.js");
const aviso = await import("../client/js/aviso.js");
const account = await import("../client/js/identity/index.js");
const cache = await import("../client/js/cache-node.js");
const updates = await import("../client/js/community-updates.js");
const rolesDm = await import("../client/js/app/aviso-roles-dm.js");

const COMM = "geral";
const toastTexts = () => toasts.map((t) => t.text);
const lastToast = () => toasts.at(-1)?.text;
const card = (title) => doc.querySelectorAll(".aviso-card").find((c) => c.querySelector(".aviso-title").textContent === title);
const main = () => doc.getElementById("app-main");
const act = (scope, action, extra = "") => scope.querySelector(`[data-aviso-action="${action}"]${extra}`);

async function until(check, label) {
  for (let i = 0; i < 100; i++) {
    const got = check();
    if (got) return got;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`tempo esgotado: ${label}`);
}

async function publish(draft, id) {
  const signed = await account.signPayload({ ...aviso.buildAviso(draft), id, authorDisplay: "Coordenação" });
  await cache.saveLocalPost(signed);
  return signed;
}

const futureEvent = Date.now() + 5 * 24 * 3600 * 1000;
const me = await account.getRouteId();
const community = await account.signPayload({
  id: updates.canonicalCommunityPostId(COMM), type: "community", communityId: COMM, title: "Vila Geral", ts: Date.now(),
});
await cache.saveLocalPost(community);
await publish({ communityId: COMM, avisoKind: "informe", title: "Reunião de moradores", body: "Sábado na praça" }, "avi_informe");
await publish({
  communityId: COMM, avisoKind: "convocacao", title: "Mutirão de limpeza", body: "Traga luvas", eventAt: futureEvent,
  eventPlace: "Praça central", roleSlots: "jurídico 2, apoio 5", quorumMin: 3,
}, "avi_mutirao");

test("antes de tudo: o aparelho é dono da comunidade semeada e a flag de laboratório está ligada", () => {
  assert.equal(community.author, me);
  assert.equal(flow.avisoLabOn(), true);
});

test("showAvisos: dono vê os dois cartões, ferramentas de moderação, agenda e o atalho Novo aviso", async () => {
  await flow.showAvisos(COMM);
  assert.equal(doc.querySelectorAll(".aviso-card").length, 2);
  const mutirao = card("Mutirão de limpeza");
  assert.match(mutirao.textContent, /Praça central/);
  assert.match(mutirao.textContent, /Vagas: Jurídico 0\/2 · Apoio 0\/5/);
  assert.ok(mutirao.querySelector(".btn-aviso-ics"), "convocação tem botão de agenda");
  assert.ok(act(mutirao, "cancelar") && act(mutirao, "enviar") && act(mutirao, "colar"));
  assert.ok(main().querySelector('a[href="#/compose/aviso?c=geral"]'), "dono vê o botão Novo aviso");
  assert.ok(main().querySelector("#aviso-skills-form"));
  assert.ok(main().querySelector(".sorteios"), "a seção de sorteios é montada para a moderação");
});

test("responder: assina a resposta, avisa e o botão da escolha fica marcado após recarregar", async () => {
  await flow.showAvisos(COMM);
  const informe = card("Reunião de moradores");
  click(act(informe, "responder"));
  await until(() => card("Reunião de moradores")?.querySelector(".is-active"), "botão marcado");
  assert.ok(toastTexts().includes("Resposta assinada."));
  const active = card("Reunião de moradores").querySelector(".is-active");
  assert.equal(active.dataset.choice, "ciente");
  assert.match(card("Reunião de moradores").textContent, /No Vox: ✅ Ciente 1/);
  const saved = await cache.getLocalPosts({ type: "aviso-resposta", communityId: COMM });
  assert.deepEqual(saved.map((r) => [r.avisoId, r.choice, r.author]), [["avi_informe", "ciente", me]]);
});

test("enviar: abre a folha com o texto para o WhatsApp; gerar link traz a mensagem de conferência", async () => {
  await flow.showAvisos(COMM);
  const informe = card("Reunião de moradores");
  click(act(informe, "enviar"));
  const sheet = main().querySelector('[data-aviso-sheet="avi_informe"]');
  assert.equal(sheet.hidden, false);
  assert.match(sheet.querySelector(".aviso-preview").textContent, /Reunião de moradores/);
  assert.match(sheet.querySelector("a.btn-primary").href, /^https:\/\/wa\.me\/\?text=/);
  click(act(sheet, "link"));
  await until(() => !main().querySelector('[data-aviso-sheet="avi_informe"] [data-aviso-action="link"]'), "link gerado");
  const withLink = main().querySelector('[data-aviso-sheet="avi_informe"]');
  assert.match(withLink.textContent, /aviso\.html#/);
  assert.ok([...withLink.querySelectorAll("a")].some((a) => a.textContent === "Enviar o link de conferência"));
});

test("colar e contar: só os números são publicados e o cartão mostra a contagem do WhatsApp", async () => {
  await flow.showAvisos(COMM);
  const informe = card("Reunião de moradores");
  click(act(informe, "colar"));
  const sheet = main().querySelector('[data-aviso-sheet="avi_informe"]');
  const paste = sheet.querySelector("[data-aviso-paste]");
  paste.value = "[22/11/26 10:00] Ana: ok ciente\n[22/11/26 10:01] Beto: ✅\n[22/11/26 10:02] Caio: bom dia";
  click(act(sheet, "contar"));
  await until(() => toastTexts().some((t) => /respostas contadas/.test(t)), "contagem publicada");
  assert.match(lastToast(), /2 respostas contadas, 1 linhas ignoradas\./);
  assert.equal(paste.value, "", "o texto colado é apagado");
  await until(() => /Contado no WhatsApp: ✅ Ciente 2/.test(card("Reunião de moradores")?.textContent || ""), "contagem no cartão");
  const counts = await cache.getLocalPosts({ type: "aviso-contagem", communityId: COMM });
  assert.equal(counts.length, 1);
  assert.equal(counts[0].countCiente, 2);
  assert.ok(!JSON.stringify(counts[0]).includes("Ana"), "nome de quem respondeu não é guardado");
});

test("agenda: o botão .ics baixa o calendário do evento; aviso sem item conhecido é ignorado", async () => {
  await flow.showAvisos(COMM);
  const blobs = [];
  const original = URL.createObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return "blob:fake"; };
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const btn = card("Mutirão de limpeza").querySelector(".btn-aviso-ics");
    click(btn);
    assert.equal(blobs.length, 1);
    assert.equal(blobs[0].type, "text/calendar;charset=utf-8");
    const ics = await blobs[0].text();
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /Mutirão de limpeza/);
    assert.equal(lastToast(), "Evento salvo em .ics para sua agenda!");
    btn.attrs.set("data-id", "inexistente");
    const before = toasts.length;
    click(btn);
    assert.equal(blobs.length, 1);
    assert.equal(toasts.length, before);
  } finally {
    mock.timers.reset();
    URL.createObjectURL = original;
  }
});

test("competências: guardar mostra confirmação e o campo volta preenchido; lista inválida avisa", async () => {
  await flow.showAvisos(COMM);
  const form = main().querySelector("#aviso-skills-form");
  form.fields = { skills: "Jurídico, Comunicação" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => lastToast() === "Competências guardadas só neste aparelho.", "competências guardadas");
  assert.deepEqual(rolesDm.mySkills().map((s) => s.toLowerCase()), ["jurídico", "comunicação"]);
  await until(() => /Jurídico/i.test(main().querySelector("#aviso-skills")?.getAttribute("value") || ""), "campo preenchido");
  const again = main().querySelector("#aviso-skills-form");
  again.fields = { skills: "x" };
  again.dispatchEvent({ type: "submit", target: again });
  await until(() => /Até \d+ competências/.test(lastToast()), "erro de competência");
  assert.equal(toasts.at(-1).type, "error");
});

test("chamada de ação: assumir papel sem chave da coordenação avisa; publicar contagem por papel assina", async () => {
  await flow.showAvisos(COMM);
  const mutirao = card("Mutirão de limpeza");
  assert.match(mutirao.textContent, /Você marcou .*assumir uma vaga\?/, "competências do aparelho viram sugestão");
  click(act(mutirao, "assumir", '[data-role="jurídico"]'));
  await until(() => toastTexts().some((t) => /Não achei a chave de mensagem/.test(t)), "aviso de sem chave");
  assert.equal(rolesDm.myRoleFor("avi_mutirao"), "", "sem entrega, nenhum papel é lembrado");
  await flow.showAvisos(COMM);
  click(act(card("Mutirão de limpeza"), "publicar-papeis"));
  await until(() => toastTexts().some((t) => /Contagem por papel assinada e publicada/.test(t)), "contagem por papel");
  const counts = await cache.getLocalPosts({ type: "aviso-papeis", communityId: COMM });
  assert.ok(counts.length >= 1);
  await until(() => /a coordenação ainda não publicou/.test(card("Mutirão de limpeza")?.textContent || "") === false, "contagem refletida");
});

test("cancelar: recusar no confirm não publica; confirmar publica o cancelamento e o cartão fecha", async () => {
  await flow.showAvisos(COMM);
  globalThis.confirm = () => false;
  const before = (await cache.getLocalPosts({ type: "topic", communityId: COMM })).length;
  click(act(card("Reunião de moradores"), "cancelar"));
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal((await cache.getLocalPosts({ type: "topic", communityId: COMM })).length, before);
  globalThis.confirm = () => true;
  click(act(card("Reunião de moradores"), "cancelar"));
  await until(() => toastTexts().includes("Aviso cancelado. Avise o grupo no WhatsApp."), "cancelamento");
  await until(() => card("Reunião de moradores")?.classList.contains("is-closed"), "cartão cancelado");
  assert.match(card("Reunião de moradores").textContent, /Cancelado/);
  assert.match(card("Cancelado: Reunião de moradores").textContent, /Informe/);
});

test("ação que falha mostra o erro em vez de calar; botão volta a habilitar", async () => {
  await flow.showAvisos(COMM);
  const colar = act(card("Mutirão de limpeza"), "contar", "");
  assert.equal(colar, null, "folha de colar ainda não aberta");
  click(act(card("Mutirão de limpeza"), "colar"));
  const sheet = main().querySelector('[data-aviso-sheet="avi_mutirao"]');
  sheet.querySelector("[data-aviso-paste]").remove();
  const button = act(sheet, "contar");
  click(button);
  await until(() => /^Erro: /.test(lastToast()), "toast de erro");
  assert.equal(toasts.at(-1).type, "error");
  assert.equal(button.disabled, false);
});

test("compositor: quem não modera vê o bloqueio com os caminhos alternativos", async () => {
  await flow.showComposeAviso("comunidade-alheia");
  assert.match(main().textContent, /Avisos são da moderação/);
  assert.ok(main().querySelector('a[href="#/compose/topic?c=comunidade-alheia"]'));
});

const visibleStep = (form) => form.querySelectorAll(".compose-step").find((s) => !s.hidden).dataset.stepKey;

test("compositor: etapas só avançam com título; a contagem de letras acompanha o texto", async () => {
  await flow.showComposeAviso(COMM);
  const form = doc.getElementById("form-compose-aviso");
  assert.equal(visibleStep(form), "kind");
  click(form.querySelector("[data-step-next]"));
  assert.equal(visibleStep(form), "text");
  const textStep = form.querySelector('[data-step-key="text"]');
  click(textStep.querySelector("[data-step-next]"));
  assert.equal(visibleStep(form), "text", "sem título não avança");
  assert.equal(textStep.querySelector("[data-step-error]").hidden, false);
  const body = form.querySelector("#aviso-body");
  body.value = "123456";
  body.dispatchEvent({ type: "input", target: body });
  assert.equal(form.querySelector("[data-aviso-counter]").textContent, "6");
  form.querySelector("#aviso-title").value = "curto";
  click(textStep.querySelector("[data-step-next]"));
  assert.equal(visibleStep(form), "when");
  click(form.querySelector('[data-step-key="when"] [data-step-prev]'));
  assert.equal(visibleStep(form), "text");
  click(textStep.querySelector("[data-step-next]"));
});

test("compositor: título curto é recusado com a mensagem e o botão segue habilitado", async () => {
  const form = doc.getElementById("form-compose-aviso");
  form.fields = { avisoKind: "informe", title: "curto", body: "" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => !form.querySelector("[data-aviso-error]").hidden, "erro mostrado");
  assert.equal(form.querySelector("[data-aviso-error]").textContent, "O título precisa ter de 8 a 80 letras.");
  assert.equal(form.querySelector("#btn-publish-aviso").disabled, false);
});

test("compositor: convocação sem data lista o erro; aviso válido é publicado e leva ao envio", async () => {
  const form = doc.getElementById("form-compose-aviso");
  form.fields = { avisoKind: "convocacao", title: "Assembleia geral", body: "", eventAt: "" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => /Convocação precisa de data e hora\./.test(form.querySelector("[data-aviso-error]").textContent), "erro de data");
  form.fields = { avisoKind: "alerta", title: "Falta de água amanhã", body: "Das 8h às 14h" };
  form.dispatchEvent({ type: "submit", target: form });
  await until(() => toastTexts().includes("Aviso assinado e publicado. Agora envie pelo WhatsApp."), "aviso publicado");
  assert.match(globalThis.location.hash, /^#\/c\/geral\/avisos\?enviar=avi_/);
  const saved = (await cache.getLocalPosts({ type: "topic", communityId: COMM })).find((t) => t.title === "Falta de água amanhã");
  assert.equal(saved.avisoKind, "alerta");
  assert.equal(saved.author, me);
});

test("rota com ?enviar=: a moderação abre direto a folha de envio daquele aviso", async () => {
  const saved = (await cache.getLocalPosts({ type: "topic", communityId: COMM })).find((t) => t.title === "Falta de água amanhã");
  globalThis.location.hash = `#/c/geral/avisos?enviar=${saved.id}`;
  await flow.showAvisos(COMM);
  const sheet = main().querySelector(`[data-aviso-sheet="${saved.id}"]`);
  assert.equal(sheet.hidden, false);
  assert.match(sheet.textContent, /Falta de água amanhã/);
  globalThis.location.hash = "#/";
});

test("aviso fixado: só com a flag, só com main e mostra o aviso ativo mais recente com o atalho", async () => {
  const host = mount(doc, `<div id="comm-main"></div>`);
  await flow.mountCommunityAvisoBanner(null, COMM);
  localStorage.removeItem("vox.lab.aviso");
  await flow.mountCommunityAvisoBanner(host, COMM);
  assert.equal(host.querySelector(".aviso-pinned"), null, "sem a flag nada é fixado");
  localStorage.setItem("vox.lab.aviso", "1");
  await flow.mountCommunityAvisoBanner(host, COMM);
  const pinned = host.querySelector(".aviso-pinned");
  assert.ok(pinned);
  assert.match(pinned.textContent, /Falta de água amanhã/, "o mais recente ativo");
  assert.ok(pinned.querySelector('a[href="#/c/geral/avisos"]'));
});
