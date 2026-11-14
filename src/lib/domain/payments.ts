import type { PaymentRow } from "@/lib/backend/types";

import { toLatinDigits } from "./persian";

/** Statuses the staff payments page writes. Older values are still read and grouped. */
export const PAYMENT_STATUSES = ["pending", "paid", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "در انتظار",
  paid: "پرداخت‌شده",
  rejected: "رد شده",
};

/** Upper bound to catch typos (one trillion toman). */
export const PAYMENT_AMOUNT_MAX = 1_000_000_000_000;
export const PAYMENT_DESCRIPTION_MAX = 500;
export const PAYMENT_TRACKING_CODE_MAX = 100;
export const PAYMENT_TYPES = ["tuition", "materials", "extra_class", "other"] as const;
export const PAYMENT_TYPE_LABEL: Record<(typeof PAYMENT_TYPES)[number], string> = { tuition: "شهریه", materials: "لوازم هنری", extra_class: "جلسه و زمان اضافه", other: "سایر" };
export const PAYMENT_METHODS = ["cash", "card_transfer", "pos", "bank_transfer", "other", "unknown"] as const;
export const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = { cash: "نقدی", card_transfer: "کارت‌به‌کارت", pos: "کارت‌خوان", bank_transfer: "واریز بانکی", other: "سایر", unknown: "نامشخص" };

/** Group any stored status value into one of the three app statuses; unknown values → null. */
export function paymentBucket(status: string | null | undefined): PaymentStatus | null {
  const v = (status ?? "").trim().toLowerCase();
  if (["paid", "completed", "پرداخت شده", "پرداخت‌شده"].includes(v)) return "paid";
  if (["pending", "unpaid", "overdue", "در انتظار"].includes(v)) return "pending";
  if (["rejected", "failed", "refunded", "رد شده"].includes(v)) return "rejected";
  return null;
}

/** Parse a user-typed amount (Persian or Latin digits, with thousands separators). Integer toman only. */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = toLatinDigits(String(input)).replace(/[\s,،٬_]/g, "");
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export type PaymentForm = {
  student_id: string;
  amount: string;
  payment_date: string;
  description: string;
  status: PaymentStatus;
  payment_type: (typeof PAYMENT_TYPES)[number];
  payment_method: (typeof PAYMENT_METHODS)[number];
  tracking_code: string;
};
export type PaymentFormErrors = Partial<Record<keyof PaymentForm, string>>;

export function validatePaymentForm(form: PaymentForm): PaymentFormErrors {
  const errors: PaymentFormErrors = {};
  if (!form.student_id) errors.student_id = "هنرجو را انتخاب کنید.";
  const amount = parseAmount(form.amount);
  if (!form.amount.trim()) errors.amount = "مبلغ را وارد کنید.";
  else if (amount === null) errors.amount = "مبلغ فقط باید عدد صحیح باشد.";
  else if (amount <= 0) errors.amount = "مبلغ باید بیشتر از صفر باشد.";
  else if (amount > PAYMENT_AMOUNT_MAX) errors.amount = "مبلغ بیش از حد بزرگ است.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.payment_date)) errors.payment_date = "تاریخ پرداخت را انتخاب کنید.";
  if (form.payment_type === "other" && !form.description.trim()) errors.description = "برای پرداخت متفرقه، توضیحات را وارد کنید.";
  if (form.description.trim().length > PAYMENT_DESCRIPTION_MAX)
    errors.description = `توضیحات حداکثر ${PAYMENT_DESCRIPTION_MAX} کاراکتر باشد.`;
  if (!PAYMENT_STATUSES.includes(form.status)) errors.status = "وضعیت معتبر نیست.";
  if (!PAYMENT_TYPES.includes(form.payment_type)) errors.payment_type = "نوع پرداخت معتبر نیست.";
  if (!PAYMENT_METHODS.includes(form.payment_method)) errors.payment_method = "روش پرداخت معتبر نیست.";
  if (form.tracking_code.trim().length > PAYMENT_TRACKING_CODE_MAX) errors.tracking_code = `شناسه پیگیری حداکثر ${PAYMENT_TRACKING_CODE_MAX} کاراکتر باشد.`;
  if (/\d{13,}/.test(form.tracking_code.replace(/\s/g, ""))) errors.tracking_code = "شماره کامل کارت یا حساب را وارد نکنید؛ فقط کد پیگیری مجاز است.";
  return errors;
}

export function amountOf(p: Pick<PaymentRow, "amount">): number {
  return parseAmount(p.amount ?? 0) ?? 0;
}

export type PaymentTotals = Record<PaymentStatus, { count: number; total: number }>;

export function summarizePayments(rows: Pick<PaymentRow, "amount" | "status">[]): PaymentTotals {
  const out: PaymentTotals = {
    pending: { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    rejected: { count: 0, total: 0 },
  };
  for (const row of rows) {
    const bucket = paymentBucket(row.status);
    if (!bucket) continue;
    out[bucket].count += 1;
    out[bucket].total += amountOf(row);
  }
  return out;
}

export type PaymentFilter = { query: string; status: PaymentStatus | "all" };

/** Search matches student name, phone or description; Persian and Latin digits are equivalent. */
export function filterPayments<T extends Pick<PaymentRow, "student_id" | "status" | "description">>(
  rows: T[],
  filter: PaymentFilter,
  studentLabel: (studentId: string) => string,
): T[] {
  const q = toLatinDigits(filter.query.trim().toLowerCase());
  return rows.filter((row) => {
    if (filter.status !== "all" && paymentBucket(row.status) !== filter.status) return false;
    if (!q) return true;
    const hay = toLatinDigits(
      `${studentLabel(row.student_id)} ${row.description ?? ""}`.toLowerCase(),
    );
    return hay.includes(q);
  });
}


export type FinanceDateRange = { from: string; to: string };

/** ISO calendar dates sort lexically, so this remains timezone-independent. */
export function isWithinFinanceDateRange(
  date: string | null | undefined,
  range: FinanceDateRange,
): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return false;
  const day = date.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

export type FinanceReport = {
  paidTotal: number;
  pendingTotal: number;
  rejectedTotal: number;
  extraTotal: number;
  monthly: { month: string; paid: number; pending: number; extra: number }[];
  students: { studentId: string; paid: number; pending: number; extra: number }[];
  classes: { classId: string; extra: number; count: number }[];
};

type FinanceAdjustment = Pick<
  import("@/lib/backend/types").AttendanceAdjustmentRow,
  "student_id" | "class_id" | "amount" | "session_date"
>;

/** Payments are the source of truth for balances; adjustments are breakdown only. */
export function buildFinanceReport(
  payments: PaymentRow[],
  adjustments: FinanceAdjustment[],
): FinanceReport {
  const report: FinanceReport = {
    paidTotal: 0, pendingTotal: 0, rejectedTotal: 0, extraTotal: 0,
    monthly: [], students: [], classes: [],
  };
  const monthly = new Map<string, { month: string; paid: number; pending: number; extra: number }>();
  const students = new Map<string, { studentId: string; paid: number; pending: number; extra: number }>();
  const classes = new Map<string, { classId: string; extra: number; count: number }>();

  for (const payment of payments) {
    const bucket = paymentBucket(payment.status);
    if (!bucket) continue;
    const amount = amountOf(payment);
    if (bucket === "paid") report.paidTotal += amount;
    if (bucket === "pending") report.pendingTotal += amount;
    if (bucket === "rejected") report.rejectedTotal += amount;

    const student = students.get(payment.student_id) ?? { studentId: payment.student_id, paid: 0, pending: 0, extra: 0 };
    if (bucket === "paid") student.paid += amount;
    if (bucket === "pending") student.pending += amount;
    students.set(payment.student_id, student);

    const month = payment.payment_date?.slice(0, 7);
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const entry = monthly.get(month) ?? { month, paid: 0, pending: 0, extra: 0 };
      if (bucket === "paid") entry.paid += amount;
      if (bucket === "pending") entry.pending += amount;
      monthly.set(month, entry);
    }
  }

  for (const adjustment of adjustments) {
    const amount = parseAmount(adjustment.amount) ?? 0;
    report.extraTotal += amount;
    const adjustmentMonth = adjustment.session_date?.slice(0, 7);
    if (adjustmentMonth && /^\d{4}-\d{2}$/.test(adjustmentMonth)) {
      const entry = monthly.get(adjustmentMonth) ?? { month: adjustmentMonth, paid: 0, pending: 0, extra: 0 };
      entry.extra += amount;
      monthly.set(adjustmentMonth, entry);
    }
    const student = students.get(adjustment.student_id) ?? { studentId: adjustment.student_id, paid: 0, pending: 0, extra: 0 };
    student.extra += amount;
    students.set(adjustment.student_id, student);
    const group = classes.get(adjustment.class_id) ?? { classId: adjustment.class_id, extra: 0, count: 0 };
    group.extra += amount;
    group.count += 1;
    classes.set(adjustment.class_id, group);
  }

  report.monthly = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month));
  report.students = [...students.values()].sort((a, b) => b.pending - a.pending || b.extra - a.extra);
  report.classes = [...classes.values()].sort((a, b) => b.extra - a.extra);
  return report;
}

export type WeeklyOperationsReport = {
  attendance: { total: number; present: number; priorNotice: number; noNotice: number; pending: number; cancelled: number };
  finance: { paid: number; pending: number; rejected: number; extra: number };
  sessions: { total: number; uniqueDates: number };
  adjustments: { extraSessions: number; extraTimeMinutes: number };
};

/** Summarizes only records inside the requested calendar week; no synthetic dates or rows. */
export function buildWeeklyOperationsReport(
  attendanceRows: import("@/lib/backend/types").AttendanceRecordRow[],
  paymentRows: PaymentRow[],
  adjustmentRows: FinanceAdjustment[],
): WeeklyOperationsReport {
  const report: WeeklyOperationsReport = {
    attendance: { total: 0, present: 0, priorNotice: 0, noNotice: 0, pending: 0, cancelled: 0 },
    finance: { paid: 0, pending: 0, rejected: 0, extra: 0 },
    sessions: { total: attendanceRows.length, uniqueDates: new Set(attendanceRows.map(row => row.session_date)).size },
    adjustments: { extraSessions: 0, extraTimeMinutes: 0 },
  };
  report.attendance.total = attendanceRows.length;
  for (const row of attendanceRows) {
    if (row.status === "present") report.attendance.present += 1;
    else if (row.status === "prior_notice_absence") report.attendance.priorNotice += 1;
    else if (row.status === "no_notice_absence") report.attendance.noNotice += 1;
    else if (row.status === "pending") report.attendance.pending += 1;
    else if (row.status === "cancelled_session") report.attendance.cancelled += 1;
  }
  for (const payment of paymentRows) {
    const bucket = paymentBucket(payment.status);
    if (bucket) report.finance[bucket] += amountOf(payment);
  }
  for (const adjustment of adjustmentRows) {
    const amount = parseAmount(adjustment.amount) ?? 0;
    report.finance.extra += amount;
    if ((adjustment as FinanceAdjustment & { adjustment_type?: string }).adjustment_type === "extra_session") {
      report.adjustments.extraSessions += 1;
    }
    if ((adjustment as FinanceAdjustment & { adjustment_type?: string; quantity_minutes?: number | null }).adjustment_type === "extra_time") {
      report.adjustments.extraTimeMinutes += (adjustment as FinanceAdjustment & { quantity_minutes?: number | null }).quantity_minutes ?? 0;
    }
  }
  return report;
}
