import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../client/js/app/route-parse.js";

function withLocation({ hash = "", search = "" }, fn) {
  const loc = { hash, search };
  const prevWindow = globalThis.window;
  const prevLocation = globalThis.location;
  globalThis.window = { location: loc };
  globalThis.location = loc;
  try {
    fn();
  } finally {
    globalThis.window = prevWindow;
    globalThis.location = prevLocation;
  }
}

describe("route-parse - navegação básica e composição", () => {
  it("home default and feed query", () => {
    withLocation({ hash: "#/" }, () => {
      assert.deepEqual(parseRoute(), { name: "home", feed: "for-you" });
    });
    withLocation({ hash: "#/?feed=following" }, () => {
      assert.deepEqual(parseRoute(), { name: "home", feed: "following" });
    });
  });

  it("compose-topic uses parts[1] topic not typo", () => {
    withLocation({ hash: "#/compose/topic?c=demo-feira-local" }, () => {
      assert.deepEqual(parseRoute(), {
        name: "compose-topic",
        communityId: "demo-feira-local",
      });
    });
  });

  it("#/compose sozinho abre o compositor (não cai na página não encontrada)", () => {
    withLocation({ hash: "#/compose" }, () => {
      assert.deepEqual(parseRoute(), { name: "compose-topic", communityId: "" });
    });
  });

  it("handle via query h=", () => {
    withLocation({ hash: "#/", search: "?h=helena" }, () => {
      assert.deepEqual(parseRoute(), { name: "handle-lookup", slug: "helena" });
    });
  });
});

describe("route-parse - status, labs e wizards", () => {
  it("status and labs frames", () => {
    withLocation({ hash: "#/status" }, () => {
      assert.deepEqual(parseRoute(), { name: "status" });
    });
    withLocation({ hash: "#/labs/frames" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-frames" });
    });
  });

  it("labs m-of-n flag and hash", () => {
    withLocation({ hash: "#/labs/mofn" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-mofn" });
    });
    withLocation({ hash: "#/", search: "?labs=mofn" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-mofn" });
    });
  });

  it("labs ai social dungeon flag and hash", () => {
    withLocation({ hash: "#/labs/dungeon" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-dungeon" });
    });
    withLocation({ hash: "#/", search: "?labs=dungeon" }, () => {
      assert.deepEqual(parseRoute(), { name: "labs-dungeon" });
    });
  });

  it("network steward wizard route", () => {
    withLocation({ hash: "#/settings/network/steward" }, () => {
      assert.deepEqual(parseRoute(), { name: "steward-wizard" });
    });
  });
});

describe("route-parse - download, connect, dm e fallbacks", () => {
  it("download and revolucao routes", () => {
    withLocation({ hash: "#/download" }, () => {
      assert.deepEqual(parseRoute(), { name: "download" });
    });
    withLocation({ hash: "#/revolucao" }, () => {
      assert.deepEqual(parseRoute(), { name: "revolucao" });
    });
    withLocation({ hash: "#/revolução" }, () => {
      assert.deepEqual(parseRoute(), { name: "revolucao" });
    });
  });

  it("connect and dm thread", () => {
    withLocation({ hash: "#/connect/vx_abc" }, () => {
      assert.deepEqual(parseRoute(), { name: "connect", routeId: "vx_abc", invite: "" });
    });
    withLocation({ hash: "#/connect/vx_abc?convite=AAAAAAAAAAAAAAAAAAAAAA" }, () => {
      assert.equal(parseRoute().invite, "AAAAAAAAAAAAAAAAAAAAAA", "PM-82: token do convite");
    });
    withLocation({ hash: "#/dm/vx_peer" }, () => {
      assert.deepEqual(parseRoute(), { name: "dm-thread", address: "vx_peer" });
    });
  });

  it("rota desconhecida vira not-found em vez de cair na Home sem aviso", () => {
    withLocation({ hash: "#/nao-existe/xyz" }, () => {
      assert.deepEqual(parseRoute(), { name: "not-found" });
    });
  });

  it("atalho #/@arroba abre a busca por handle", () => {
    withLocation({ hash: "#/@helena" }, () => {
      assert.deepEqual(parseRoute(), { name: "handle-lookup", slug: "helena" });
    });
    withLocation({ hash: "#/@" }, () => {
      assert.deepEqual(parseRoute(), { name: "not-found" });
    });
  });
});

describe("route-parse ai-social-dungeon", () => {
  it("rotas segregadas AI Social Dungeon (#/dungeon*)", () => {
    withLocation({ hash: "#/dungeon" }, () => {
      assert.deepEqual(parseRoute(), { name: "dungeon", screen: "acampamento" });
    });
    withLocation({ hash: "#/dungeon/mesa/vila-nova" }, () => {
      assert.deepEqual(parseRoute(), { name: "dungeon", screen: "mesa", tableId: "vila-nova" });
    });
    withLocation({ hash: "#/dungeon/ficha/lyra" }, () => {
      assert.deepEqual(parseRoute(), { name: "dungeon", screen: "ficha", charId: "lyra" });
    });
    withLocation({ hash: "#/dungeon/mestre/vila-nova" }, () => {
      assert.deepEqual(parseRoute(), { name: "dungeon", screen: "mestre", tableId: "vila-nova" });
    });
  });
});

describe("route-parse cobertura extra", () => {
  it("rotas cívicas, comunidades, entidades e settings", () => {
    const cases = [
      ["#/c/vila/avisos", "community-avisos"],
      ["#/c/vila/proposal/p1", "proposal"],
      ["#/c/vila/feira?tab=governance", "community"],
      ["#/c/vila/membros", "community"],
      ["#/c/vila/invalida", "community"],
      ["#/compose/community", "compose-community"],
      ["#/compose/listing", "compose-listing"],
      ["#/compose/proposal", "compose-proposal"],
      ["#/compose/aviso", "compose-aviso"],
      ["#/compose/reply?t=t1&c=c1&p=p1", "compose-reply"],
      ["#/u/@ana", "handle-lookup"],
      ["#/u/addr1?tab=bio", "profile"],
      ["#/dm", "dm-list"],
      ["#/t/t1?c=v", "topic"],
      ["#/h/bob", "handle-lookup"],
      ["#/tag/rpg", "tag-feed"],
      ["#/pix/chave", "pix-lookup"],
      ["#/pessoas?q=lu", "people"],
      ["#/sync?p=old&b=z", "sync"],
      ["#/ajuda/voxpedia", "voxpedia"],
      ["#/ajuda/teste", "ajuda-teste"],
      ["#/settings/network", "network-settings"],
      ["#/settings/linked-accounts", "linked-accounts"],
      ["#/settings/network/guia", "network-wizard"],
      ["#/guardioes", "guardians"],
      ["#/voxpedia", "voxpedia"],
      ["#/downloads", "download"],
      ["#/t", "not-found"],
      ["#/labs/desconhecido", "not-found"],
    ];
    for (const [hash, expectedName] of cases) {
      withLocation({ hash }, () => assert.equal(parseRoute().name, expectedName));
    }
    withLocation({ hash: "#/", search: "?outro=1" }, () => assert.equal(parseRoute().name, "home"));
  });
});
