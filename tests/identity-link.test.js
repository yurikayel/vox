import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as localAccount from "../client/js/local-account.js";
import * as wallet from "../client/js/wallet.js";
import * as ans104 from "../client/js/ans104.js";
import * as identityLink from "../client/js/identity-link.js";
import * as gql from "../client/js/graphql.js";

test("ans104 - jwkToAddress deriva endereço de 43 caracteres", async () => {
  const jwk = await wallet.ensureWallet();
  const addr = await ans104.jwkToAddress(jwk);
  assert.equal(typeof addr, "string");
  assert.equal(addr.length, 43);
});

test("identity-link - createIdentityLink gera vinculo bidirecional valido", async () => {
  localStorage.clear();
  identityLink.__resetIdentityLinksForTests();

  const acc = await localAccount.ensureLocalAccount();
  const jwk = await wallet.ensureWallet();
  const expectedAddr = await ans104.jwkToAddress(jwk);

  const link = await identityLink.createIdentityLink();
  assert.equal(link.statement.type, identityLink.IDENTITY_LINK_TYPE);
  assert.equal(link.statement.routeId, acc.routeId);
  assert.equal(link.statement.arweaveAddress, expectedAddr);
  assert.ok(link.vxSig);
  assert.ok(link.arSig);

  const isValid = await identityLink.verifyIdentityLink(link);
  assert.equal(isValid, true);

  // Mapeamento local em memória
  assert.equal(identityLink.getLinkedArweaveAddress(acc.routeId), expectedAddr);
  assert.equal(identityLink.getLinkedRouteId(expectedAddr), acc.routeId);
});

test("identity-link - verifyIdentityLink rejeita adulteração de routeId ou chaves", async () => {
  localStorage.clear();
  identityLink.__resetIdentityLinksForTests();

  const link = await identityLink.createIdentityLink();

  // 1. Adulteração do routeId
  const tamperedRoute = {
    ...link,
    statement: { ...link.statement, routeId: "vx_imposter_route_999" },
  };
  assert.equal(await identityLink.verifyIdentityLink(tamperedRoute), false);

  // 2. Adulteração do endereço Arweave
  const tamperedAddr = {
    ...link,
    statement: { ...link.statement, arweaveAddress: "arweave_fake_address_1234567890123456789012" },
  };
  assert.equal(await identityLink.verifyIdentityLink(tamperedAddr), false);

  // 3. Adulteração da assinatura RSA
  const tamperedArSig = {
    ...link,
    arSig: link.arSig.slice(0, -4) + "AAAA",
  };
  assert.equal(await identityLink.verifyIdentityLink(tamperedArSig), false);

  // 4. Adulteração da assinatura P-256
  const tamperedVxSig = {
    ...link,
    vxSig: link.vxSig.slice(0, -4) + "BBBB",
  };
  assert.equal(await identityLink.verifyIdentityLink(tamperedVxSig), false);
});

test("identity-link - buildIdentityLinkArweaveTags formata tags de vínculo on-chain", async () => {
  const link = await identityLink.createIdentityLink();
  const tags = identityLink.buildIdentityLinkArweaveTags(link);

  assert.equal(tags.find((t) => t.name === "App-Name")?.value, "vox-brasil");
  assert.equal(tags.find((t) => t.name === "Type")?.value, "identity-link");
  assert.equal(tags.find((t) => t.name === "Route-Id")?.value, link.statement.routeId);
  assert.equal(tags.find((t) => t.name === "Arweave-Address")?.value, link.statement.arweaveAddress);
  assert.ok(tags.find((t) => t.name === "Issued-At")?.value);
});
