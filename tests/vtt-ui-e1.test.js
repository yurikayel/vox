import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView, wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { createIdbVttBackend, createMemoryVttBackend, createVttStore } from "../client/js/dungeon/vtt-store.js";
import { waitUntil } from "./helpers/wait-until.js";

function makeStore() {
  return createVttStore(createMemoryVttBackend(), {
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 10 * 1024 * 1024, usage: 512 * 1024, percentage: 5, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
}

function makeInteractiveHost() {
  const listeners = {};
  const inputs = {
    "#dungeon-campaign-name": { value: "" },
    "#dungeon-roll-input": { value: "" },
    "#dungeon-action-input": { value: "", focus: () => {} },
    "#dungeon-backup-passphrase": { value: "" },
  };
  return {
    dataset: {},
    innerHTML: "",
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: (sel) => inputs[sel] || null,
    listeners,
    inputs,
  };
}

function createFakeIdbFactory() {
  const stores = new Map();
  const makeReq = (result) => {
    const req = { result, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const makeStoreApi = (name) => {
    const map = stores.get(name);
    const keyOf = (val) => (name === "ops" ? `${val.campaignId}::${val.opId}` : val.id || val.campaignId || val.sha256);
    return {
      get: (k) => makeReq(map.get(k)),
      put: (v) => { map.set(keyOf(v), structuredClone(v)); return makeReq(keyOf(v)); },
      delete: (k) => { map.delete(k); return makeReq(undefined); },
      getAll: () => makeReq([...map.values()].map((v) => structuredClone(v))),
      index: () => ({
        getAll: (cid) => makeReq([...map.values()].filter((r) => r.campaignId === cid)),
        getAllKeys: (cid) => makeReq([...map.entries()].filter(([, r]) => r.campaignId === cid).map(([k]) => k)),
      }),
    };
  };
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n) => { stores.set(n, new Map()); return { createIndex: () => {} }; },
    transaction: (n) => {
      const tx = { oncomplete: null, onerror: null, onabort: null, objectStore: () => makeStoreApi(n) };
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return tx;
    },
  };
  return {
    stores,
    open: () => {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
}

test("vtt-ui-e1: fluxo completo criar campanha, rolar ficha/chat e restaurar em nova sessão via controller", async () => {
  const store = makeStore();
  const state = createDungeonSessionState();
  const host = makeInteractiveHost();
  wireDungeonView(host, { screen: "acampamento", state, store });
  await waitUntil(() => state.persistenceReady);

  host.inputs["#dungeon-campaign-name"].value = "Crônicas da Pedra";
  await host.listeners.submit({ target: { dataset: { dungeon: "create-campaign-form" }, querySelector: (s) => host.inputs[s] }, preventDefault: () => {} });
  assert.equal(state.tableName, "Crônicas da Pedra");
  assert.match(host.innerHTML, /Ativa neste aparelho/);
  assert.match(host.innerHTML, /Sem nuvem ilimitada/);

  host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "roll-mode", mode: "advantage" } }) } });
  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "roll-ability", ability: "str" } }) } });
  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "roll-action", actionId: "act-ataque" } }) } });
  host.inputs["#dungeon-roll-input"].value = "2d6+3 # Fogo";
  await host.listeners.submit({ target: { dataset: { dungeon: "roll-formula-form" }, querySelector: (s) => host.inputs[s] }, preventDefault: () => {} });
  host.inputs["#dungeon-action-input"].value = "/gmroll 1d20+@des # Furtividade";
  await host.listeners.submit({ target: { dataset: { dungeon: "action-form" }, querySelector: (s) => host.inputs[s] }, preventDefault: () => {} });

  const reloadedState = createDungeonSessionState();
  const host2 = makeInteractiveHost();
  wireDungeonView(host2, { screen: "ficha", state: reloadedState, store });
  await waitUntil(() => reloadedState.persistenceReady && reloadedState.tableName);
  assert.equal(reloadedState.tableName, "Crônicas da Pedra");
  assert.equal(reloadedState.rolls.length, 5);
  assert.match(host2.innerHTML, /data-dungeon="roll-ability" data-ability="str"/);
  assert.match(host2.innerHTML, /Espada Longa/);
});

test("vtt-ui-e1: export/import .voxrpg.zip, .voxrpg.enc e .md via controller + proteção XSS nas telas", async () => {
  const store = makeStore();
  const state = createDungeonSessionState();
  const downloads = [];
  const host = makeInteractiveHost();
  wireDungeonView(host, { screen: "acampamento", state, store, onDownload: (art) => downloads.push(art) });
  await waitUntil(() => state.persistenceReady);

  host.inputs["#dungeon-campaign-name"].value = "<img src=x onerror=alert(1)>";
  await host.listeners.submit({ target: { dataset: { dungeon: "create-campaign-form" }, querySelector: (s) => host.inputs[s] }, preventDefault: () => {} });
  assert.ok(!host.innerHTML.includes("<img src=x"));
  assert.ok(host.innerHTML.includes("&lt;img src=x"));

  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "export-voxrpg" } }) } });
  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "export-chronicle-md" } }) } });
  host.inputs["#dungeon-backup-passphrase"].value = "curta";
  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "export-voxrpg-enc" } }) } });
  assert.match(state.campaignNotice, /pelo menos 12/);

  host.inputs["#dungeon-backup-passphrase"].value = "senha-soberana-e1-segura";
  await host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "export-voxrpg-enc" } }) } });
  assert.equal(downloads.length, 3);

  const dstStore = makeStore();
  const dstState = createDungeonSessionState();
  const dstHost = makeInteractiveHost();
  wireDungeonView(dstHost, { screen: "acampamento", state: dstState, store: dstStore });
  await waitUntil(() => dstState.persistenceReady);
  dstHost.inputs["#dungeon-backup-passphrase"].value = "senha-soberana-e1-segura";
  await dstHost.listeners.change({ target: { dataset: { dungeon: "import-file" }, files: [{ name: downloads[2].filename, bytes: downloads[2].bytes }] } });
  assert.equal(dstState.tableName, "<img src=x onerror=alert(1)>");
  const tableHtml = renderDungeonView({ screen: "mesa", state: dstState });
  assert.ok(!tableHtml.includes("<img src=x"));
});

test("vtt-store: backend IndexedDB cria os 4 object stores e executa CRUD completo", async () => {
  const fakeIdb = createFakeIdbFactory();
  const backend = createIdbVttBackend(fakeIdb);
  const store = createVttStore(backend, {
    snapshotInterval: 2,
    requestPersistenceFn: async () => ({ persisted: true, isSupported: true }),
    estimateStorageFn: async () => ({ quota: 100, usage: 10, percentage: 10, isSupported: true }),
    checkPersistenceFn: async () => true,
  });
  const saved = await store.saveCampaign({
    schemaVersion: "1.0.0",
    id: "idb-camp",
    name: "Mesa IDB",
    system: "d20-livre",
    activeSheetId: "lyra",
    sheetsById: {},
    notesById: {},
    chronicle: [],
    rolls: [],
  });
  assert.equal(saved.id, "idb-camp");
  assert.deepEqual([...fakeIdb.stores.keys()].sort(), ["blobs", "campaigns", "ops", "snapshots"]);
  await store.appendOp("idb-camp", { opId: "o1", type: "CHRONICLE_APPEND", lamport: 1, ts: 1, payload: { text: "Oi" } });
  await store.appendOp("idb-camp", { opId: "o2", type: "CHRONICLE_APPEND", lamport: 2, ts: 2, payload: { text: "Tchau" } });
  const loaded = await store.loadCampaign("idb-camp");
  assert.equal(loaded.chronicle.length, 2);
  await store.deleteCampaign("idb-camp");
  assert.equal(await store.loadCampaign("idb-camp"), null);
});
