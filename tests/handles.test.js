import test from "node:test";
import assert from "node:assert/strict";
import "./setup.js";
import * as handles from "../client/js/handles.js";

test("handles - validação e normalização de slug", () => {
  assert.equal(handles.normalizeSlug("@maria"), "maria");
  assert.equal(handles.normalizeSlug("  @Joao-Silva  "), "joao-silva");

  // Válidos
  assert.equal(handles.validateSlug("maria").valid, true);
  assert.equal(handles.validateSlug("@maria-silva").valid, true);
  assert.equal(handles.validateSlug("vox123").valid, true);

  // Inválidos por tamanho
  assert.equal(handles.validateSlug("ab").valid, false);
  assert.equal(handles.validateSlug("a".repeat(25)).valid, false);

  // Inválidos por caracteres ou formato
  assert.equal(handles.validateSlug("maria_silva").valid, false);
  assert.equal(handles.validateSlug("-maria").valid, false);
  assert.equal(handles.validateSlug("maria-").valid, false);
  assert.equal(handles.validateSlug("maria--silva").valid, false);

  // Reservados
  assert.equal(handles.validateSlug("admin").valid, false);
  assert.equal(handles.validateSlug("vox").valid, false);
  assert.equal(handles.validateSlug("www").valid, false);
});

test("handles - resolução de conflitos e lista de reivindicantes", () => {
  // Cenário 1: Um único reivindicante
  const singleClaimant = [
    { node: { id: "tx_1", owner: { address: "addr_maria" } } },
    { node: { id: "tx_0", owner: { address: "addr_maria" } } },
  ];
  const res1 = handles.resolveHandleClaimants(singleClaimant);
  assert.equal(res1.isConflict, false);
  assert.equal(res1.primaryOwner, "addr_maria");
  assert.equal(res1.claimants.length, 1);

  // Cenário 2: Múltiplos reivindicantes (conflito)
  const conflictClaimants = [
    { node: { id: "tx_2", owner: { address: "addr_maria_recente" } } },
    { node: { id: "tx_1", owner: { address: "addr_maria_antiga" } } },
  ];
  const res2 = handles.resolveHandleClaimants(conflictClaimants);
  assert.equal(res2.isConflict, true);
  assert.equal(res2.primaryOwner, "addr_maria_recente");
  assert.equal(res2.claimants.length, 2);
  assert.equal(res2.claimants[0].owner, "addr_maria_recente");
  assert.equal(res2.claimants[1].owner, "addr_maria_antiga");

  // Cenário 3: Vazio
  assert.equal(handles.resolveHandleClaimants([]), null);
});

test("handles - persistência e cache bidirecional", () => {
  localStorage.clear();
  assert.equal(handles.getCachedHandleMapping("maria"), null);
  assert.equal(handles.getCachedAddressHandle("addr_maria"), null);

  handles.cacheHandleMapping("maria", "addr_maria");
  assert.equal(handles.getCachedHandleMapping("maria"), "addr_maria");
  assert.equal(handles.getCachedAddressHandle("addr_maria"), "maria");
});
