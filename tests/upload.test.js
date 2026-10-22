import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as upload from "../client/js/upload.js";

test("upload - buildTags gera tags mandatárias do Vox", () => {
  const tags = upload.buildTags("community", {
    "Community-Id": "brasil-livre",
    Title: "Brasil Livre",
  });

  const appName = tags.find((t) => t.name === "App-Name");
  const typeTag = tags.find((t) => t.name === "Type");
  const commId = tags.find((t) => t.name === "Community-Id");
  const title = tags.find((t) => t.name === "Title");

  assert.ok(appName, "Tag App-Name deve existir");
  assert.equal(appName.value, "vox-brasil");
  assert.equal(typeTag.value, "community");
  assert.equal(commId.value, "brasil-livre");
  assert.equal(title.value, "Brasil Livre");
});

test("upload - buildTags ignora campos vazios e nulos", () => {
  const tags = upload.buildTags("topic", {
    "Topic-Title": "Titulo Valido",
    Vazio: "",
    Nulo: null,
    Indefinido: undefined,
  });

  assert.equal(tags.some((t) => t.name === "Vazio"), false);
  assert.equal(tags.some((t) => t.name === "Nulo"), false);
  assert.equal(tags.some((t) => t.name === "Indefinido"), false);
  assert.equal(tags.find((t) => t.name === "Topic-Title")?.value, "Titulo Valido");
});

test("upload - postData exige carteira conectada", async () => {
  localStorage.clear();
  await assert.rejects(
    () => upload.postData({ test: 123 }, []),
    /Nenhuma carteira encontrada/
  );
});
