/**
 * Validação, normalização e mascaramento de chaves Pix (DICT - Banco Central).
 * Operação 100% client-side: formato sintático e privacidade visual sem consulta a PSPs.
 */

const CPF_REGEX = /^\d{11}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CLEAN_REGEX = /^\+?55\d{10,11}$/;
const PHONE_LOCAL_REGEX = /^\d{10,11}$/;
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

export function validatePixKey(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return { ok: false, type: "unknown", normalized: "", errorPt: "Chave Pix não informada." };
  }

  const type = detectPixType(trimmed);
  const normalized = normalizePixKey(trimmed, type);

  if (type === "cpf") {
    if (!CPF_REGEX.test(normalized) || !validateCpfDigits(normalized)) {
      return { ok: false, type, normalized, errorPt: "CPF inválido." };
    }
    return { ok: true, type, normalized, errorPt: "" };
  }

  if (type === "email") {
    if (!EMAIL_REGEX.test(normalized) || normalized.length > 77) {
      return { ok: false, type, normalized, errorPt: "E-mail inválido." };
    }
    return { ok: true, type, normalized, errorPt: "" };
  }

  if (type === "phone") {
    if (!/^\+55\d{10,11}$/.test(normalized)) {
      return { ok: false, type, normalized, errorPt: "Telefone inválido (use DDD + número com 8 ou 9 dígitos)." };
    }
    return { ok: true, type, normalized, errorPt: "" };
  }

  if (type === "random") {
    if (!UUID_REGEX.test(normalized)) {
      return { ok: false, type, normalized, errorPt: "Chave aleatória inválida (formato UUID esperado)." };
    }
    return { ok: true, type, normalized, errorPt: "" };
  }

  return { ok: false, type: "unknown", normalized, errorPt: "Formato de chave Pix não reconhecido (use CPF, e-mail, celular com DDD ou chave aleatória)." };
}

export function maskForDisplay(key, type = null) {
  if (!key) return "";
  const keyType = type || detectPixType(key);
  const str = String(key);

  if (keyType === "cpf") {
    const d = cleanCpf(str);
    if (d.length === 11) {
      return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
    }
    return "***.***.***-**";
  }

  if (keyType === "email") {
    const [user, domain] = str.split("@");
    if (!domain) return "***@***";
    const maskedUser = user.length <= 2 ? user.slice(0, 1) + "***" : user.slice(0, 2) + "***" + user.slice(-1);
    return `${maskedUser}@${domain}`;
  }

  if (keyType === "phone") {
    const d = str.replace(/\D/g, "");
    const ddd = d.length >= 12 ? d.slice(2, 4) : d.slice(0, 2);
    const last4 = d.slice(-4);
    return `+55 (${ddd}) *****-${last4}`;
  }

  if (keyType === "random") {
    if (str.length >= 16) {
      return `${str.slice(0, 4)}••••-••••-••••-${str.slice(-4)}`;
    }
    return "••••-••••-••••";
  }

  return "••••••••";
}
