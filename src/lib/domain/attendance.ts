import type { AbsenceRow, AttendanceRecordRow, ProfileRow } from "@/lib/backend/types";

import { parseAmount } from "./payments";
import { toLatinDigits } from "./persian";

export type AttendanceStatus = AttendanceRecordRow["status"];

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  pending: "ثبت‌نشده",
  present: "حاضر",
  prior_notice_absence: "غیبت با اطلاع",
  no_notice_absence: "غیبت بدون اطلاع",
};

export type RosterEntry = {
  profile: ProfileRow;
  enrolled: boolean;
  reserved: boolean;
  /** The student reported this absence in advance. */
  notice: AbsenceRow | undefined;
};

/**
 * Students expected at one class on one date: weekly enrollments plus active reservations
 * for that dated session, each once, sorted by name. Advance absence notices for that class
 * (or with no class given) are attached.
 */
export function buildRoster(input: {
  profiles: ProfileRow[];
  enrolledIds: Iterable<string>;
  reservedIds: Iterable<string>;
  absences: AbsenceRow[];
  classId: string;
  date: string;
}): RosterEntry[] {
  const enrolled = new Set([...input.enrolledIds].map(String));
  const reserved = new Set([...input.reservedIds].map(String));
  const notices = new Map<string, AbsenceRow>();
  for (const a of input.absences) {
    if (a.absence_date.slice(0, 10) !== input.date) continue;
    if (a.class_id !== null && String(a.class_id) !== input.classId) continue;
    notices.set(String(a.student_id), a);
  }
  return input.profiles
    .filter((p) => enrolled.has(String(p.id)) || reserved.has(String(p.id)))
    .map((profile) => ({
      profile,
      enrolled: enrolled.has(String(profile.id)),
      reserved: reserved.has(String(profile.id)),
      notice: notices.get(String(profile.id)),
    }))
    .sort((a, b) => (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? "", "fa"));
}

/** Status to show before staff touch a row: the saved one, else "absent with notice" if reported. */
export function initialStatus(
  saved: AttendanceStatus | undefined,
  hasNotice: boolean,
): AttendanceStatus {
  if (saved && saved !== "pending") return saved;
  return hasNotice ? "prior_notice_absence" : (saved ?? "pending");
}

// ---------------------------------------------------------------------------
// Extra billable attendance (attendance_adjustments)
// ---------------------------------------------------------------------------

export const ADJUSTMENT_TYPES = ["extra_slot", "overtime"] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_LABEL: Record<AdjustmentType, string> = {
  extra_slot: "حضور در سانس دوم",
  overtime: "اضافه‌زمان",
};

export const ADJUSTMENT_UNIT: Record<AdjustmentType, string> = {
  extra_slot: "سانس",
  overtime: "ساعت",
};

export function adjustmentLabel(type: string | null | undefined): string {
  return (ADJUSTMENT_LABEL as Record<string, string>)[type ?? ""] ?? (type || "مورد اضافه");
}

/** Quantity: positive, at most two decimals (e.g. 1.5 hours), up to 24. */
export function parseQuantity(input: string): number | null {
  const raw = toLatinDigits(input.trim()).replace(/[٫،]/g, ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 24 ? n : null;
}

/** Whole-toman amount for quantity × rate. */
export function adjustmentAmount(quantity: number, unitRate: number): number {
  return Math.round(quantity * unitRate);
}

export type AdjustmentForm = {
  student_id: string;
  type: AdjustmentType;
  quantity: string;
  unit_rate: string;
  note: string;
};
export type AdjustmentErrors = Partial<Record<keyof AdjustmentForm, string>>;

export function validateAdjustment(form: AdjustmentForm): AdjustmentErrors {
  const errors: AdjustmentErrors = {};
  if (!form.student_id) errors.student_id = "هنرجو را انتخاب کنید.";
  if (!ADJUSTMENT_TYPES.includes(form.type)) errors.type = "نوع مورد را انتخاب کنید.";
  if (parseQuantity(form.quantity) === null)
    errors.quantity = "تعداد باید عددی بیشتر از صفر باشد (حداکثر دو رقم اعشار).";
  const rate = parseAmount(form.unit_rate);
  if (!form.unit_rate.trim()) errors.unit_rate = "نرخ را وارد کنید.";
  else if (rate === null || rate <= 0) errors.unit_rate = "نرخ باید عدد صحیح بیشتر از صفر باشد.";
  if (form.note.trim().length > 300) errors.note = "توضیح حداکثر ۳۰۰ کاراکتر باشد.";
  return errors;
}

/**
 * The table has no quantity column, so the quantity is written into the description
 * ("حضور در سانس دوم × 1") and can also be derived from amount ÷ unit_rate.
 */
export function adjustmentDescription(type: AdjustmentType, quantity: number, note: string): string {
  const base = `${ADJUSTMENT_LABEL[type]} × ${quantity} ${ADJUSTMENT_UNIT[type]}`;
  return note.trim() ? `${base} — ${note.trim()}` : base;
}

export function adjustmentQuantity(row: {
  amount: number | string | null;
  unit_rate: number | string | null;
}): number | null {
  const amount = Number(row.amount);
  const rate = Number(row.unit_rate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((amount / rate) * 100) / 100;
}
