/**
 * Validação, normalização e mascaramento de chaves Pix (DICT - Banco Central).
 * Operação 100% client-side: formato sintático e privacidade visual sem consulta a PSPs.
 */

const CPF_REGEX = /^\d{11}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanCpf(val) {
  return String(val || "").replace(/\D/g, "");
}

function validateCpfDigits(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(cpf.charAt(10), 10);
}

export function detectPixType(raw) {
  const trimmed = String(raw || "").trim();
  if (EMAIL_REGEX.test(trimmed)) return "email";
  if (UUID_REGEX.test(trimmed)) return "random";

  // Se contiver pontuação típica de CPF (pontos e traço)
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(trimmed)) {
    return "cpf";
  }

  // Telefone com prefixo +55 explícito ou formatação com DDD e hífen
  if (trimmed.startsWith("+55") || /^\(?\d{2}\)?\s*9?\d{4}-\d{4}$/.test(trimmed)) {
    return "phone";
  }

  const digits = cleanCpf(trimmed);
  if (digits.length === 11) {
    // Celular brasileiro com DDD precisa ter 9 como terceiro dígito
    if (!trimmed.includes(".") && /^[1-9]{2}9\d{8}$/.test(digits) && !validateCpfDigits(digits)) {
      return "phone";
    }
    return "cpf";
  }

  if (digits.length === 10 && /^[1-9]{2}[2-9]\d{7}$/.test(digits)) {
    return "phone";
  }

  return "unknown";
}

export function normalizePixKey(raw, typeHint = null) {
  const trimmed = String(raw || "").trim();
  const type = typeHint || detectPixType(trimmed);

  if (type === "cpf") {
    return cleanCpf(trimmed);
  }
  if (type === "email") {
    return trimmed.toLowerCase();
  }
  if (type === "phone") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.startsWith("55") && digits.length >= 12) return "+" + digits;
    return "+55" + digits;
  }
  if (type === "random") {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

const PIX_VALIDATORS = {
  cpf: (norm) => (!CPF_REGEX.test(norm) || !validateCpfDigits(norm) ? "CPF inválido." : ""),
  email: (norm) => (!EMAIL_REGEX.test(norm) || norm.length > 77 ? "E-mail inválido." : ""),
  phone: (norm) => (!/^\+55\d{10,11}$/.test(norm) ? "Telefone inválido (use DDD + número com 8 ou 9 dígitos)." : ""),
  random: (norm) => (!UUID_REGEX.test(norm) ? "Chave aleatória inválida (formato UUID esperado)." : ""),
};

export function validatePixKey(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { ok: false, type: "unknown", normalized: "", errorPt: "Chave Pix não informada." };
  }
  const type = detectPixType(trimmed);
  const normalized = normalizePixKey(trimmed, type);
  const validator = PIX_VALIDATORS[type];
  if (!validator) {
    return { ok: false, type: "unknown", normalized, errorPt: "Formato de chave Pix não reconhecido (use CPF, e-mail, celular com DDD ou chave aleatória)." };
  }
  const errorPt = validator(normalized);
  return { ok: !errorPt, type, normalized, errorPt };
}

function maskCpf(str) {
  const d = cleanCpf(str);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***.***.***-**";
}

function maskEmail(str) {
  const [user, domain] = str.split("@");
  if (!domain) return "***@***";
  const maskedUser = user.length <= 2 ? user.slice(0, 1) + "***" : user.slice(0, 2) + "***" + user.slice(-1);
  return `${maskedUser}@${domain}`;
}

function maskPhone(str) {
  const d = str.replace(/\D/g, "");
  const ddd = d.length >= 12 ? d.slice(2, 4) : d.slice(0, 2);
  return `+55 (${ddd}) *****-${d.slice(-4)}`;
}

function maskRandom(str) {
  return str.length >= 16 ? `${str.slice(0, 4)}••••-••••-••••-${str.slice(-4)}` : "••••-••••-••••";
}

const PIX_MASKERS = {
  cpf: maskCpf,
  email: maskEmail,
  phone: maskPhone,
  random: maskRandom,
};

export function maskForDisplay(key, type = null) {
  if (!key) return "";
  const keyType = type || detectPixType(key);
  const masker = PIX_MASKERS[keyType];
  return masker ? masker(String(key)) : "••••••••";
}
