import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as mock from "../client/js/mock.js";
import * as welcomeProfile from "../client/js/vox-welcome-profile.js";
import * as cacheNode from "../client/js/cache-node.js";

test("community-vox-default - mockCommunities traz comunidade 'vox' como fórum oficial", () => {
  const comms = mock.mockCommunities();
  const voxComm = comms.items.find((c) => c.id === "vox");
  assert.ok(voxComm, "Comunidade 'vox' deve existir no mock");
  assert.equal(voxComm.title, "Vox");
  assert.equal(voxComm.isOfficial, true);
  assert.equal(voxComm.visibility, "open");
});

test("community-vox-default - runWelcomeOnboarding inscreve usuário na comunidade 'vox' por padrão", async () => {
  await cacheNode.clearLocalPosts();
  const user = "vx_test_user_onboarding";

  const res = await welcomeProfile.runWelcomeOnboarding(user);
  assert.ok(res);

  const mems = await cacheNode.getLocalPosts({ type: "membership", communityId: "vox" });
  const userMem = mems.find((m) => (m.author || m.owner) === user);
  assert.ok(userMem, "Usuário deve ser inscrito na comunidade 'vox' durante onboarding");
  assert.equal(userMem.isDefaultAutoJoin, true);
});

test("community-vox-default - não força reinscrição se o usuário saiu soberanamente (membership_leave)", async () => {
  await cacheNode.clearLocalPosts();
  const user = "vx_test_user_leave";

  // Usuário sai da comunidade vox
  await cacheNode.saveLocalPost({
    id: "leave_1",
    type: "membership_leave",
    communityId: "vox",
    author: user,
    owner: user,
    leftAt: Date.now(),
    ts: Date.now(),
  });

  // Roda onboarding ou verificação
  await welcomeProfile.ensureDefaultCommunityMembership(user);

  // Deve respeitar a saída e NÃO criar membership
  const mems = await cacheNode.getLocalPosts({ type: "membership", communityId: "vox" });
  assert.equal(mems.filter((m) => (m.author || m.owner) === user).length, 0);
});
