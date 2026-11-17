/**
 * @file Reporter do `node:test` para o vermelho na base (PM-111): uma linha JSON por teste folha, com o desfecho.
 *
 * `assert` = falhou por asserção (`ERR_ASSERTION`), a única falha que prova que o teste pega o defeito; `other` =
 * falhou por outro motivo (import, sintaxe, função que não existe na base, tempo esgotado), que fica inconclusiva;
 * `pass` = passou na base. Suítes e pais que só repetem a falha de um subteste ficam de fora.
 */

/**
 * Classifica uma falha do `node:test` pela causa original.
 * @param {any} error erro de `details.error` do evento `test:fail`.
 * @returns {"assert" | "other" | null} null quando é só o pai repetindo a falha de subtestes.
 */
export function failureOutcome(error) {
  if (error?.failureType === "subtestsFailed") return null;
  const cause = error?.cause ?? error;
  const isAssert = cause?.code === "ERR_ASSERTION" || cause?.name === "AssertionError";
  return isAssert ? "assert" : "other";
}

function firstLine(error) {
  const cause = error?.cause ?? error;
  return String(cause?.message ?? cause ?? "").split("\n")[0].slice(0, 200);
}

function resultLine(type, data) {
  if ((type !== "test:pass" && type !== "test:fail") || data.details?.type === "suite") return null;
  const outcome = type === "test:pass" ? "pass" : failureOutcome(data.details?.error);
  if (!outcome) return null;
  const message = outcome === "pass" ? "" : firstLine(data.details?.error);
  return `${JSON.stringify({ file: data.file ?? "", name: data.name, outcome, message })}\n`;
}

/**
 * Reporter: transforma os eventos `test:pass` / `test:fail` em linhas JSON `{ file, name, outcome, message }`.
 * @param {AsyncIterable<{ type: string, data: any }>} source eventos do `node:test`.
 * @returns {AsyncGenerator<string>} linhas JSON terminadas em quebra de linha.
 */
export default async function* redOnBaseReporter(source) {
  for await (const { type, data } of source) {
    const line = resultLine(type, data);
    if (line) yield line;
  }
}
