import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractCacheName,
  parseMirrorsTable,
  compareMirrorState,
  verifyMirrors,
  verifyOffline,
  parseArgs,
  formatMarkdownSummary,
  formatOfflineSummary,
} from "../scripts/verify-mirrors.mjs";

test("PM-19: extractCacheName extrai com aspas duplas, simples ou retorna null", () => {
  assert.equal(extractCacheName('const CACHE_NAME = "vox-v7.1";'), "vox-v7.1");
  assert.equal(extractCacheName("const CACHE_NAME = 'vox-v7.2';"), "vox-v7.2");
  assert.equal(extractCacheName("const OUTRO = 123;"), null);
  assert.equal(extractCacheName(null), null);
});

test("PM-19: parseMirrorsTable extrai apenas linhas live ignorando planned e cabeçalhos", () => {
  const sample = `
### Tabela de espelhos

| mirror_id | role | base_url | git_sha | CACHE_NAME | operator | read_only | status | DoD ✓ |
|-----------|------|----------|---------|------------|----------|-----------|--------|-------|
| \`shell-a\` | A | https://example.com/a/ | \`abc\` | \`vox-v1\` | opA | true | **live** | ok |
| \`shell-b\` | B | https://example.com/b | \`abc\` | \`vox-v1\` | opB | true | **live** | ok |
| \`shell-c\` | C | https://example.com/c | \`abc\` | \`vox-v1\` | opC | true | planned | pendente |
`;
  const parsed = parseMirrorsTable(sample);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].mirrorId, "shell-a");
  assert.equal(parsed[0].baseUrl, "https://example.com/a/");
  assert.equal(parsed[0].status, "live");
  assert.equal(parsed[1].mirrorId, "shell-b");
  assert.equal(parseMirrorsTable("sem tabela").length, 0);
});

test("PM-19: compareMirrorState valida correspondência e rejeita divergências e erros HTTP", () => {
  const mirror = { mirrorId: "test-m", baseUrl: "https://test.local/" };

  const okResult = compareMirrorState({
    expectedCacheName: "vox-100",
    mirror,
    remoteSwText: 'const CACHE_NAME = "vox-100";',
    httpStatus: 200,
  });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.remoteCacheName, "vox-100");

  const diffResult = compareMirrorState({
    expectedCacheName: "vox-100",
    mirror,
    remoteSwText: 'const CACHE_NAME = "vox-99";',
    httpStatus: 200,
  });
  assert.equal(diffResult.ok, false);
  assert.match(diffResult.reason, /divergente/);

  const missingResult = compareMirrorState({
    expectedCacheName: "vox-100",
    mirror,
    remoteSwText: "console.log('nada');",
    httpStatus: 200,
  });
  assert.equal(missingResult.ok, false);

  const errResult = compareMirrorState({
    expectedCacheName: "vox-100",
    mirror,
    httpStatus: 500,
  });
  assert.equal(errResult.ok, false);
  assert.equal(errResult.httpStatus, 500);
});

test("PM-19: verifyMirrors busca sw.js de cada espelho com mock sem rede", async () => {
  const mirrors = [
    { mirrorId: "m1", baseUrl: "https://host1.local/" },
    { mirrorId: "m2", baseUrl: "https://host2.local" },
  ];
  const requestedUrls = [];
  const mockFetch = async (url) => {
    requestedUrls.push(url);
    return {
      status: 200,
      text: async () => 'const CACHE_NAME = "vox-test-ok";',
    };
  };

  const res = await verifyMirrors({
    mirrors,
    expectedCacheName: "vox-test-ok",
    fetchImpl: mockFetch,
    timeoutMs: 1000,
  });

  assert.equal(res.ok, true);
  assert.equal(requestedUrls[0], "https://host1.local/sw.js");
  assert.equal(requestedUrls[1], "https://host2.local/sw.js");
  assert.equal(res.results.length, 2);
});

test("PM-19: verifyMirrors sinaliza falha geral quando algum espelho falha ou lança", async () => {
  const mirrors = [{ mirrorId: "m1", baseUrl: "https://host1.local" }];
  const mockFetchFail = async () => {
    throw new Error("Conexão recusada");
  };

  const res = await verifyMirrors({
    mirrors,
    expectedCacheName: "vox-test-ok",
    fetchImpl: mockFetchFail,
  });

  assert.equal(res.ok, false);
  assert.equal(res.results[0].ok, false);
  assert.match(res.results[0].reason, /recusada/);
});

test("PM-19: verifyOffline compara arquivos locais sem requisição de rede", () => {
  const rep = verifyOffline();
  assert.equal(typeof rep.swCacheName, "string");
  assert.equal(rep.swMatchesMeta, true);
  assert.ok(rep.mirrors.length >= 2);
  assert.equal(rep.ok, true);
});

test("PM-19: parseArgs interpreta flags do CLI", () => {
  const args = parseArgs(["--offline", "--strict", "--json", "out.json", "--timeout", "5000"]);
  assert.equal(args.offline, true);
  assert.equal(args.strict, true);
  assert.equal(args.json, "out.json");
  assert.equal(args.timeout, 5000);
});

test("PM-19: formatMarkdownSummary e formatOfflineSummary geram relatórios legíveis", () => {
  const summary = {
    ok: true,
    expectedCacheName: "vox-rel",
    results: [{ mirrorId: "m1", baseUrl: "https://a.local", ok: true, remoteCacheName: "vox-rel", reason: "ok" }],
  };
  const md = formatMarkdownSummary(summary);
  assert.match(md, /### Verificação de espelhos/);
  assert.match(md, /vox-rel/);

  const offReport = {
    swCacheName: "vox-rel",
    metaCacheName: "vox-rel",
    swMatchesMeta: true,
    mirrors: [{ mirrorId: "m1" }],
    tableInSync: true,
  };
  const offMd = formatOfflineSummary(offReport);
  assert.match(offMd, /### Verificação offline de espelhos/);
  assert.match(offMd, /OK/);
});
