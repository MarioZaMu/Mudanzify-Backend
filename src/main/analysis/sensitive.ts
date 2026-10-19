import type { SensitiveType } from '../../shared/contract';

/** Share of non-empty values that must match for a column to count as sensitive. */
const MATCH_THRESHOLD = 0.5;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_SHAPE = /^\+?[\d\s().-]{7,20}$/;

const NAME_HINTS: Record<SensitiveType, RegExp> = {
  email: /correo|e-?mail|mail/i,
  phone: /tel[eé]fono|celular|m[oó]vil|phone|whatsapp/i,
  'national-id': /c[eé]dula|dni|documento|identificaci|pasaporte|curp|\bnit\b|\brut\b/i,
  card: /tarjeta|card/i,
};

const digitsOf = (value: string) => value.replace(/\D/g, '');

/** Luhn checksum used by payment cards; avoids flagging random long numbers. */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function matches(type: SensitiveType, value: string): boolean {
  const digits = digitsOf(value);
  switch (type) {
    case 'email':
      return EMAIL.test(value);
    case 'card':
      return digits.length >= 13 && digits.length <= 19 && /^[\d\s-]+$/.test(value) && isLuhnValid(digits);
    case 'phone':
      return PHONE_SHAPE.test(value) && digits.length >= 7 && digits.length <= 15;
    case 'national-id':
      return /^[\d.\s-]+[a-zA-Z]?$/.test(value) && digits.length >= 6 && digits.length <= 12;
  }
}

/** "ana.ruiz@correo.com" → "a***@correo.com"; "3001234567" → "********67". */
export function mask(type: SensitiveType, value: string): string {
  if (type === 'email') {
    const [user, domain] = value.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  const digits = digitsOf(value);
  return `${'•'.repeat(Math.max(0, digits.length - 2))}${digits.slice(-2)}`;
}

export interface SensitiveMatch {
  type: SensitiveType;
  matches: number;
  example: string;
}

/**
 * Classifies a column locally from its name and values. Emails and cards are
 * recognized by shape; phones and IDs look alike, so they also need a name hint.
 */
export function classifyColumn(name: string, values: string[]): SensitiveMatch | null {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return null;

  const order: SensitiveType[] = ['email', 'card', 'national-id', 'phone'];
  for (const type of order) {
    const needsHint = type === 'phone' || type === 'national-id';
    if (needsHint && !NAME_HINTS[type].test(name)) continue;
    const hits = filled.filter((value) => matches(type, value));
    if (hits.length > 0 && hits.length / filled.length >= MATCH_THRESHOLD) {
      return { type, matches: hits.length, example: mask(type, hits[0]) };
    }
  }
  return null;
}
