/**
 * @file A escuta de `submit` do formulário de oferta devolve a promessa do envio: quem dispara o submit e espera o
 * retorno já encontra a oferta gravada, sem depender de relógio ou de rodadas extras do laço de eventos.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { FakeEl, installFakeDocument, captureToasts } from "./helpers/cov-t4-dom.mjs";

globalThis.fetch = async () => { throw new Error("offline"); };

const listing = await import("../client/js/app/compose-listing.js");
const cacheNode = await import("../client/js/cache-node.js");
const localAccount = await import("../client/js/identity/local-account.js");

const FIELDS = {
  "form-compose-listing": "", "listing-title": "Bicicleta", "listing-price": "R$ 200", "listing-location": "Centro",
  "listing-pix": "pessoa@exemplo.com", "listing-image": "", "listing-body": "Aro 26, em bom estado", "btn-submit-listing": "",
};

/** Shell falso com os campos da oferta (mesmo cenário dos testes de cobertura dos formulários). */
function mountForm() {
  const dom = installFakeDocument();
  const main = new FakeEl("app-main");
  dom.add(new FakeEl("app-root"), main);
  const els = {};
  for (const [id, value] of Object.entries(FIELDS)) {
    els[id] = new FakeEl(id, { value });
    dom.add(els[id]);
  }
  return { dom, els, toasts: captureToasts(dom) };
}

test("submit da oferta: a escuta devolve a promessa e, ao esperar, a oferta já está gravada", async () => {
  await cacheNode.clearLocalPosts();
  await cacheNode.saveLocalPost({ id: "feira_viva", type: "community", title: "Feira Viva", commercialEnabled: true });
  await localAccount.ensureLocalAccount();
  const { dom, els, toasts } = mountForm();
  try {
    await listing.showComposeListing("feira_viva");
    const returns = els["form-compose-listing"].listeners.get("submit").map((fn) => fn({ preventDefault() {} }));
    const pending = returns.filter((r) => r && typeof r.then === "function");
    assert.equal(pending.length, 1, "uma escuta devolve a promessa do envio");
    await Promise.all(pending);
    const saved = await cacheNode.getLocalPosts({ type: "listing" });
    assert.equal(saved.length, 1, "a oferta já está gravada quando o retorno resolve");
    assert.equal(saved[0].title, "Bicicleta");
    assert.equal(toasts.list().at(-1).text, "Oferta publicada na feira!");
  } finally {
    toasts.stop();
    dom.restore();
    await localAccount.wipeLocalAccount();
  }
});
