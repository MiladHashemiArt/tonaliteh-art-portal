import type { AppRole } from "./roles";
import { DEFAULT_TEACHER_NAME } from "./roles";
import { normalizeDigits } from "./validation";

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

/** Keys a teacher may edit. Managers may edit every key. Mirrors the database policy. */
export const TEACHER_EDITABLE_KEYS: SettingKey[] = [
  "teacher_display_name",
  "teacher_instagram_url",
  "teacher_phone",
  "motivational_quote",
  "motivational_quote_author",
];

export function canEditSetting(role: AppRole, key: SettingKey): boolean {
  if (role === "manager") return true;
  if (role === "teacher") return TEACHER_EDITABLE_KEYS.includes(key);
  return false;
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
