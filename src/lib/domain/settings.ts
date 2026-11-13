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
export const TEACHER_CONTACT_KEYS = ["teacher_display_name", "teacher_phone", "teacher_instagram_url"] as const;
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
    errors.teacher_instagram_url = "نشانی اینستاگرام معتبر نیست؛ مثلاً https://www.instagram.com/نام‌کاربری یا ‎@نام‌کاربری.";
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
