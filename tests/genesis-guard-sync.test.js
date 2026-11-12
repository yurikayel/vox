/**
 * As cópias da regra da gênese nos servidores (`relay/genesis_data.py` e `GenesisData.cs`) batem com a fonte
 * do cliente (`client/js/genesis.js` e `client/js/data/test-route-ids.js`). Se falhar: `node scripts/gen-genesis-guard.mjs`.
 */
import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { syncGenesisGuard } from "../scripts/gen-genesis-guard.mjs";

test("gênese: cópias do servidor em dia com a lista e a data do cliente", async () => {
  assert.deepEqual(await syncGenesisGuard({ check: true }), []);
});
