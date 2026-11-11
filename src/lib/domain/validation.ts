import { toLatinDigits } from "./persian";

export function normalizeDigits(input: string): string {
  return toLatinDigits(input).replace(/[\s\-_.]/g, "");
}

/** Iranian national code (کد ملی): 10 digits with the standard check digit. */
export function isValidNationalId(input: string): boolean {
  const code = normalizeDigits(input);
  if (!/^\d{10}$/.test(code)) return false;
  if (/^(\d)\1{9}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits[9];
  const sum = digits.slice(0, 9).reduce((acc, d, i) => acc + d * (10 - i), 0);
  const r = sum % 11;
  return r < 2 ? check === r : check === 11 - r;
}

/** Iranian mobile or landline numbers, Persian or Latin digits, optional +98. */
export function isValidPhone(input: string): boolean {
  const p = normalizeDigits(input).replace(/^\+/, "");
  return /^(98|0098|0)?9\d{9}$/.test(p) || /^0\d{9,10}$/.test(p) || /^98\d{9,10}$/.test(p);
}

export function normalizePhone(input: string): string {
  return normalizeDigits(input);
}
