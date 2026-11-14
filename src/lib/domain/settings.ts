import type { AppRole } from "./roles";
import { DEFAULT_TEACHER_NAME } from "./roles";
import { isValidPhone, normalizeDigits } from "./validation";

export type SettingKey =
  | "teacher_display_name"
  | "teacher_instagram_url"
  | "teacher_phone"
  | "motivational_quote"
  | "motivational_quote_author"
  | "group_phone"
  | "group_address"
  | "payment_card_number"
  | "payment_card_holder"
  | "payment_bank_name"
  | "payment_iban"
  | "payment_notes";

/** Teachers and managers may edit every site setting; students read only. Mirrors the database policy. */
export function canEditSetting(role: AppRole, _key: SettingKey): boolean {
  return role === "teacher" || role === "manager";
}

export type Settings = Partial<Record<SettingKey, string>>;

export const DEFAULT_QUOTE = "هنر، دیدنِ آن چیزی است که دیگران از کنارش می‌گذرند.";

export function teacherName(settings: Settings): string {
  return settings.teacher_display_name?.trim() || DEFAULT_TEACHER_NAME;
}

/** Accepts "@handle", "handle" or an instagram.com URL. Returns null when not configured/invalid. */
export function instagramHref(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const url = new URL(v);
      const host = url.hostname.replace(/^www\./, "");
      return host === "instagram.com" ? url.toString() : null;
    } catch {
      return null;
    }
  }
  const handle = v.replace(/^@/, "").replace(/^instagram\.com\//i, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://instagram.com/${handle}` : null;
}

export function telHref(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  const digits = normalizeDigits(v);
  return /^\+?\d{6,15}$/.test(digits) ? `tel:${digits}` : null;
}

/** Teacher contact keys edited on the staff settings page. */
export const TEACHER_CONTACT_KEYS = [
  "teacher_display_name",
  "teacher_phone",
  "teacher_instagram_url",
] as const;
export type TeacherContactKey = (typeof TEACHER_CONTACT_KEYS)[number];
export type TeacherContactForm = Record<TeacherContactKey, string>;
export type TeacherContactErrors = Partial<Record<TeacherContactKey, string>>;

export const TEACHER_NAME_MAX = 80;

export function teacherContactFromSettings(settings: Settings): TeacherContactForm {
  return {
    teacher_display_name: settings.teacher_display_name ?? "",
    teacher_phone: settings.teacher_phone ?? "",
    teacher_instagram_url: settings.teacher_instagram_url ?? "",
  };
}

/** Name is required; phone and Instagram are optional but must be valid when filled in. */
export function validateTeacherContact(form: TeacherContactForm): TeacherContactErrors {
  const errors: TeacherContactErrors = {};
  const name = form.teacher_display_name.trim();
  if (!name) errors.teacher_display_name = "نام استاد را وارد کنید.";
  else if (name.length > TEACHER_NAME_MAX)
    errors.teacher_display_name = `نام حداکثر ${TEACHER_NAME_MAX} کاراکتر باشد.`;
  if (form.teacher_phone.trim() && !isValidPhone(form.teacher_phone))
    errors.teacher_phone = "شمارهٔ تماس معتبر نیست؛ مثلاً ۰۹۱۲۱۲۳۴۵۶۷.";
  if (form.teacher_instagram_url.trim() && !instagramHref(form.teacher_instagram_url))
    errors.teacher_instagram_url =
      "نشانی اینستاگرام معتبر نیست؛ مثلاً https://www.instagram.com/نام‌کاربری یا ‎@نام‌کاربری.";
  return errors;
}

/** Values written to the database: trimmed name, Latin-digit phone, full Instagram link. */
export function normalizeTeacherContact(form: TeacherContactForm): TeacherContactForm {
  const ig = form.teacher_instagram_url.trim();
  return {
    teacher_display_name: form.teacher_display_name.trim(),
    teacher_phone: form.teacher_phone.trim() ? normalizeDigits(form.teacher_phone) : "",
    teacher_instagram_url: ig ? (instagramHref(ig) ?? ig) : "",
  };
}

/** Group contact and payment keys edited on the staff settings page. */
export const GROUP_PAYMENT_KEYS = [
  "group_phone",
  "group_address",
  "payment_card_number",
  "payment_card_holder",
  "payment_bank_name",
  "payment_iban",
  "payment_notes",
] as const;
export type GroupPaymentKey = (typeof GROUP_PAYMENT_KEYS)[number];
export type GroupPaymentForm = Record<GroupPaymentKey, string>;
export type GroupPaymentErrors = Partial<Record<GroupPaymentKey, string>>;

export const GROUP_PAYMENT_MAX: Record<GroupPaymentKey, number> = {
  group_phone: 20,
  group_address: 300,
  payment_card_number: 30,
  payment_card_holder: 80,
  payment_bank_name: 60,
  payment_iban: 40,
  payment_notes: 500,
};

export function groupPaymentFromSettings(settings: Settings): GroupPaymentForm {
  const out = {} as GroupPaymentForm;
  for (const k of GROUP_PAYMENT_KEYS) out[k] = settings[k] ?? "";
  return out;
}

/** Strip spaces/dashes and Persian digits from a card number. */
export function cardDigits(value: string): string {
  return normalizeDigits(value);
}

/** Bank card: 16 digits passing the Luhn check (used by Iranian Shetab cards). */
export function isValidCardNumber(value: string): boolean {
  const d = cardDigits(value);
  if (!/^\d{16}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let n = Number(d[15 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** "IR" + 24 digits; a bare 24-digit value gets the IR prefix. */
export function ibanCanonical(value: string): string {
  const v = normalizeDigits(value).toUpperCase();
  return /^\d{24}$/.test(v) ? `IR${v}` : v;
}

/** Iranian IBAN (شبا): IR + 24 digits with a valid ISO 13616 mod-97 checksum. */
export function isValidIban(value: string): boolean {
  const v = ibanCanonical(value);
  if (!/^IR\d{24}$/.test(v)) return false;
  const rearranged = `${v.slice(4)}1827${v.slice(2, 4)}`; // I=18, R=27
  let rem = 0;
  for (const ch of rearranged) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

/** Display helpers: groups of four, left-to-right. */
export function formatCardNumber(value: string): string {
  const d = cardDigits(value);
  return /^\d{16}$/.test(d) ? (d.match(/.{4}/g) ?? [d]).join("-") : value.trim();
}

export function formatIban(value: string): string {
  const v = ibanCanonical(value);
  return /^IR\d{24}$/.test(v) ? (v.match(/.{1,4}/g) ?? [v]).join(" ") : value.trim();
}

/** Every field is optional; filled fields must be valid. */
export function validateGroupPayment(form: GroupPaymentForm): GroupPaymentErrors {
  const errors: GroupPaymentErrors = {};
  for (const k of GROUP_PAYMENT_KEYS) {
    if (form[k].trim().length > GROUP_PAYMENT_MAX[k])
      errors[k] = `حداکثر ${GROUP_PAYMENT_MAX[k]} کاراکتر مجاز است.`;
  }
  if (!errors.group_phone && form.group_phone.trim() && !isValidPhone(form.group_phone))
    errors.group_phone = "شمارهٔ تماس معتبر نیست؛ مثلاً ۰۲۱۱۲۳۴۵۶۷۸ یا ۰۹۱۲۱۲۳۴۵۶۷.";
  if (form.payment_card_number.trim() && !isValidCardNumber(form.payment_card_number))
    errors.payment_card_number = "شمارهٔ کارت باید ۱۶ رقم و معتبر باشد.";
  if (form.payment_iban.trim() && !isValidIban(form.payment_iban))
    errors.payment_iban = "شمارهٔ شبا معتبر نیست؛ IR و ۲۴ رقم.";
  return errors;
}

/** Values written to the database: trimmed text, Latin digits, bare card digits, canonical IBAN. */
export function normalizeGroupPayment(form: GroupPaymentForm): GroupPaymentForm {
  const t = (k: GroupPaymentKey) => form[k].trim();
  return {
    group_phone: t("group_phone") ? normalizeDigits(t("group_phone")) : "",
    group_address: t("group_address"),
    payment_card_number: t("payment_card_number") ? cardDigits(t("payment_card_number")) : "",
    payment_card_holder: t("payment_card_holder"),
    payment_bank_name: t("payment_bank_name"),
    payment_iban: t("payment_iban") ? ibanCanonical(t("payment_iban")) : "",
    payment_notes: t("payment_notes"),
  };
}
