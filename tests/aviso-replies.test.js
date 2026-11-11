import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";

const { countPastedReplies, replyChoice, splitReplyLine } = await import("../client/js/aviso-replies.js");

test("aviso-replies — os dois formatos de exportação e linha solta", () => {
  assert.deepEqual(splitReplyLine("[10/11/2026, 14:03] Maria: vou"), { sender: "Maria", message: "vou" });
  assert.deepEqual(splitReplyLine("10/11/2026 14:03 - João Silva: Ciente"), { sender: "João Silva", message: "Ciente" });
  assert.deepEqual(splitReplyLine("vou sim"), { sender: "", message: "vou sim" });
});

test("aviso-replies — palavras e emojis, com e sem acento", () => {
  const cases = {
    "Não vou poder": "nao-vou", "nao posso": "nao-vou", "❌": "nao-vou",
    "talvez": "talvez", "🤔": "talvez",
    "Vou!": "vou", "confirmo": "vou", "estarei lá": "vou", "🙋": "vou",
    "ciente": "ciente", "OK": "ciente", "✅": "ciente", "👍": "ciente",
    "bom dia a todos": "", "louvor": "",
  };
  for (const [message, choice] of Object.entries(cases)) assert.equal(replyChoice(message), choice, message);
});

test("aviso-replies — última resposta por nome, linhas ignoradas contadas, sem nomes no resultado", () => {
  const text = [
    "[10/11/2026, 14:03] Maria: talvez",
    "[10/11/2026, 15:10] Maria: vou",
    "10/11/2026 14:05 - João: ✅",
    "10/11/2026 14:06 - Ana: bom dia",
    "🙋",
    "🙋",
  ].join("\n");
  const result = countPastedReplies(text);
  assert.deepEqual(result.counts, { ciente: 1, vou: 3, talvez: 0, "nao-vou": 0 });
  assert.equal(result.counted, 4);
  assert.equal(result.ignored, 1);
  assert.ok(!JSON.stringify(result).includes("Maria"));
});

test("aviso-replies — resposta com código de outro aviso não conta", () => {
  const text = "[10/11/2026, 14:03] Maria: 🙋 Vou — A7F3\n[10/11/2026, 14:04] José: 🙋 Vou — ZZ99\n[10/11/2026, 14:05] Rita: vou";
  const result = countPastedReplies(text, "A7F3");
  assert.equal(result.counts.vou, 2);
  assert.equal(result.ignored, 1);
  assert.equal(countPastedReplies("").counted, 0);
});
