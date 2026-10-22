import { getStoredJwk } from "./wallet.js";

async function getArweave() {
  const module = await import("https://esm.sh/arweave@1.15.7");
  const Arweave = module.default || module;
  return Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
    timeout: 30000,
  });
}

export function buildTags(type, fields = {}) {
  const tags = [
    { name: "App-Name", value: "vox-brasil" },
    { name: "Type", value: type },
    { name: "Unix-Time", value: String(Date.now()) },
    { name: "Client", value: "vox-web-fase2" },
    { name: "Content-Type", value: "application/json; charset=utf-8" },
  ];

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      tags.push({ name: key, value: String(val).trim() });
    }
  }

  return tags;
}

export async function postData(dataObj, tags = []) {
  const jwk = getStoredJwk();
  if (!jwk) {
    throw new Error("Nenhuma carteira encontrada. Conecte sua carteira em #/wallet antes de publicar.");
  }

  const arweave = await getArweave();
  const payload = JSON.stringify(dataObj || {});

  const tx = await arweave.createTransaction({ data: payload }, jwk);
  for (const t of tags) {
    tx.addTag(t.name, t.value);
  }

  await arweave.transactions.sign(tx, jwk);
  const response = await arweave.transactions.post(tx);

  if (response.status !== 200 && response.status !== 208) {
    throw new Error(`Falha no envio da transação (HTTP ${response.status})`);
  }

  return {
    success: true,
    id: tx.id,
    status: response.status,
  };
}
