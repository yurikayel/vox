/**
 * Módulo de Geração de BR Code / Pix Copia e Cola (Fase v6.0 Pix Zaps).
 * Implementa a especificação EMV® QR Code do Banco Central do Brasil (BCB) 100% offline.
 * Gera payloads estáticos com TLV (Tag-Length-Value) e checksum CRC16-CCITT.
 *
 * NOTA REGULATÓRIA: O Vox NÃO é Instituição de Pagamento (IP) nem Provedor de Serviços
 * de Pagamento (PSP). Nenhuma custódia, split ou liquidação financeira ocorre no app.
 */

/**
 * Remove acentos, caracteres diacríticos e caracteres não compatíveis com o padrão EMV.
 */
export function sanitizeAscii(str, maxLen = 25) {
  if (!str) return "";
  const cleaned = String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s.\-_*]/g, "")
    .trim();
  return maxLen > 0 ? cleaned.slice(0, maxLen) : cleaned;
}

/**
 * Formata um elemento TLV (Tag-Length-Value) conforme o padrão EMV.
 */
export function formatTlv(tag, value) {
  if (value === null || value === undefined) return "";
  const strVal = String(value);
  if (!strVal.length) return "";
  const tagStr = String(tag).padStart(2, "0");
  const lenStr = String(strVal.length).padStart(2, "0");
  return `${tagStr}${lenStr}${strVal}`;
}

/**
 * Converte entradas numéricas ou em texto (ex: 5, "5.00", "R$ 28", "28,50") em formato monetário decimal.
 */
export function parseNumericAmount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return raw > 0 && Number.isFinite(raw) ? raw.toFixed(2) : null;
  }
  let str = String(raw).replace(/^R\$\s*/i, "").trim();
  if (!str) return null;

  if (str.includes(".") && str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",")) {
    str = str.replace(",", ".");
  }

  const num = parseFloat(str);
  return !Number.isNaN(num) && num > 0 ? num.toFixed(2) : null;
}

/**
 * Calcula o checksum CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF).
 * Padrão exigido no campo ID 63 do BR Code do Banco Central.
 */
export function calculateCrc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Monta o campo 26 (Merchant Account Information) específico do Pix.
 */
function buildMerchantAccount(key, description = "") {
  const gui = formatTlv(0, "br.gov.bcb.pix");
  const pixKey = formatTlv(1, String(key).trim());
  const descClean = sanitizeAscii(description, 40);
  const desc = descClean ? formatTlv(2, descClean) : "";
  return formatTlv(26, `${gui}${pixKey}${desc}`);
}

/**
 * Monta o campo 62 (Additional Data Field Template) contendo o txid.
 */
function buildAdditionalData(txid = "***") {
  const cleanTxid = sanitizeAscii(txid, 25) || "***";
  const ref = formatTlv(5, cleanTxid);
  return formatTlv(62, ref);
}

/**
 * Constrói o payload completo BR Code Pix Copia e Cola.
 *
 * @param {Object} params
 * @param {string} params.key - Chave Pix válida (e-mail, CPF, celular ou UUID)
 * @param {string} [params.name="VOX MEMBRO"] - Nome do recebedor (max 25 caracteres)
 * @param {string} [params.city="BRASIL"] - Cidade do recebedor (max 15 caracteres)
 * @param {number|string} [params.amount] - Valor em reais (opcional)
 * @param {string} [params.txid="***"] - Identificador da transação (padrão ***)
 * @param {string} [params.description] - Mensagem/descrição curta opcional (max 40 caracteres)
 * @returns {string} String do Pix Copia e Cola pronta para pagamento no app bancário
 */
export function buildPixPayload({ key, name = "VOX MEMBRO", city = "BRASIL", amount = null, txid = "***", description = "" }) {
  if (!key || typeof key !== "string" || !key.trim()) {
    throw new Error("Chave Pix é obrigatória para gerar o BR Code");
  }

  const pFormat = formatTlv(0, "01");
  const pInitiation = formatTlv(1, "11");
  const merchantAccount = buildMerchantAccount(key, description);
  const mcc = formatTlv(52, "0000");
  const currency = formatTlv(53, "986");

  const formattedAmount = parseNumericAmount(amount);
  const amountField = formattedAmount ? formatTlv(54, formattedAmount) : "";

  const country = formatTlv(58, "BR");
  const cleanName = sanitizeAscii(name, 25).toUpperCase() || "VOX MEMBRO";
  const merchantName = formatTlv(59, cleanName);

  const cleanCity = sanitizeAscii(city, 15).toUpperCase() || "BRASIL";
  const merchantCity = formatTlv(60, cleanCity);

  const additionalData = buildAdditionalData(txid);
  const incompletePayload = `${pFormat}${pInitiation}${merchantAccount}${mcc}${currency}${amountField}${country}${merchantName}${merchantCity}${additionalData}6304`;

  const crc = calculateCrc16(incompletePayload);
  return `${incompletePayload}${crc}`;
}
