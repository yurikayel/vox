import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as profileCard from "../client/js/profile-card.js";
import * as profileDirectory from "../client/js/profile-directory.js";
import * as gql from "../client/js/graphql.js";

test("profile-onchain - buildProfileCardArweaveTags formata tags de perfil", () => {
  const card = {
    routeId: "vx_test_route_123",
    displayName: "Maria Silva",
    bio: "Militante democrática e tecnóloga",
    avatarUrl: "https://turbo-gateway.com/raw/tx_avatar_456",
    discoverable: true,
    editedAt: 1730217600000,
  };

  const tags = profileCard.buildProfileCardArweaveTags(card);
  assert.equal(tags.find((t) => t.name === "App-Name")?.value, "vox-brasil");
  assert.equal(tags.find((t) => t.name === "Type")?.value, "profile-card");
  assert.equal(tags.find((t) => t.name === "Route-Id")?.value, "vx_test_route_123");
  assert.equal(tags.find((t) => t.name === "Display-Name")?.value, "Maria Silva");
  assert.equal(tags.find((t) => t.name === "Bio")?.value, "Militante democrática e tecnóloga");
  assert.equal(tags.find((t) => t.name === "Avatar-Url")?.value, "https://turbo-gateway.com/raw/tx_avatar_456");
  assert.equal(tags.find((t) => t.name === "Discoverable")?.value, "true");
  assert.equal(tags.find((t) => t.name === "Timestamp")?.value, "1730217600000");
});

test("profile-onchain - publishProfileCardOnChain envia payload via uploadFn", async () => {
  let postedData = null;
  let postedTags = null;
  let postedOpts = null;

  const mockUploadFn = async (data, tags, opts) => {
    postedData = data;
    postedTags = tags;
    postedOpts = opts;
    return { id: "tx_mock_profile_card_789", via: "turbo" };
  };

  const card = {
    routeId: "vx_author_xyz",
    displayName: "João Povo",
    bio: "Comunicação popular",
  };
  const res = await profileCard.publishProfileCardOnChain(card, { uploadFn: mockUploadFn });
  assert.equal(res.ok, true);
  assert.equal(res.id, "tx_mock_profile_card_789");
  assert.equal(res.via, "turbo");
  assert.equal(postedOpts?.autoCreate, true);
  assert.ok(postedData.includes("João Povo"));
  assert.equal(postedTags.find((t) => t.name === "Route-Id")?.value, "vx_author_xyz");
});

test("profile-onchain - fetchProfileCardOnChain e fetchAndCacheOnChainProfile", async () => {
  const originalFetch = globalThis.fetch;
  localStorage.clear();
  profileDirectory.__resetProfileCardsForTests();
  gql.__resetGatewayConfigForTests();

  globalThis.fetch = async (url, opts) => {
    const s = String(url);
    if (s.includes("gateways.json")) {
      return {
        ok: true,
        json: async () => ({
          gateways: [
            {
              id: "mock",
              label: "mock",
              graphql: "https://mock.example/graphql",
              raw: "https://mock.example/raw/{txId}",
            },
          ],
        }),
      };
    }
    const body = opts?.body ? JSON.parse(opts.body) : {};
    if (body.query && (body.query.includes("GetProfileCardByRoute") || body.query.includes("GetProfileCardByAddress"))) {
      return {
        ok: true,
        json: async () => ({
          data: {
            transactions: {
              edges: [
                {
                  node: {
                    id: "tx_card_onchain_111",
                    owner: { address: "arweave_address_alice_999" },
                    tags: [
                      { name: "App-Name", value: "vox-brasil" },
                      { name: "Type", value: "profile-card" },
                      { name: "Route-Id", value: "vx_alice_online" },
                      { name: "Display-Name", value: "Alice do Povo" },
                      { name: "Bio", value: "Soberania e Software Livre" },
                      { name: "Avatar-Url", value: "https://turbo-gateway.com/raw/tx_pic_222" },
                      { name: "Discoverable", value: "true" },
                      { name: "Timestamp", value: "1730219900000" },
                    ],
                  },
                },
              ],
            },
          },
        }),
      };
    }
    return originalFetch(url, opts);
  };

  try {
    const card = await gql.fetchProfileCardOnChain({ routeId: "vx_alice_online" });
    assert.ok(card);
    assert.equal(card.displayName, "Alice do Povo");
    assert.equal(card.bio, "Soberania e Software Livre");
    assert.equal(card.owner, "arweave_address_alice_999");

    const cached = await profileDirectory.fetchAndCacheOnChainProfile("vx_alice_online");
    assert.ok(cached);
    assert.equal(cached.name, "Alice do Povo");

    const inMemory = profileDirectory.getProfileCard("vx_alice_online");
    assert.equal(inMemory?.name, "Alice do Povo");
    assert.equal(inMemory?.arweaveAddress, "arweave_address_alice_999");
  } finally {
    globalThis.fetch = originalFetch;
    gql.__resetGatewayConfigForTests();
  }
});
