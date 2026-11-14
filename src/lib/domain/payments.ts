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
  if (form.description.trim().length > PAYMENT_DESCRIPTION_MAX)
    errors.description = `توضیحات حداکثر ${PAYMENT_DESCRIPTION_MAX} کاراکتر باشد.`;
  if (!PAYMENT_STATUSES.includes(form.status)) errors.status = "وضعیت معتبر نیست.";
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
  if (!date || !/^\\d{4}-\\d{2}-\\d{2}/.test(date)) return false;
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
  monthly: { month: string; paid: number; pending: number }[];
  students: { studentId: string; paid: number; pending: number; extra: number }[];
  classes: { classId: string; extra: number; count: number }[];
};

type FinanceAdjustment = Pick<
  import("@/lib/backend/types").AttendanceAdjustmentRow,
  "student_id" | "class_id" | "amount"
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
  const monthly = new Map<string, { month: string; paid: number; pending: number }>();
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
      const entry = monthly.get(month) ?? { month, paid: 0, pending: 0 };
      if (bucket === "paid") entry.paid += amount;
      if (bucket === "pending") entry.pending += amount;
      monthly.set(month, entry);
    }
  }

  for (const adjustment of adjustments) {
    const amount = parseAmount(adjustment.amount) ?? 0;
    report.extraTotal += amount;
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
