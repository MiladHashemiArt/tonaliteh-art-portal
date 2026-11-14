import { parseAmount, PAYMENT_AMOUNT_MAX } from "./payments";

export const STUDENT_EXPENSE_CATEGORIES = [
  "materials", "tools", "photography", "printing", "transport", "other",
] as const;
export type StudentExpenseCategory = (typeof STUDENT_EXPENSE_CATEGORIES)[number];
export type StudentExpenseStatus = "pending" | "approved" | "rejected";

export const STUDENT_EXPENSE_CATEGORY_LABEL: Record<StudentExpenseCategory, string> = {
  materials: "مواد مصرفی",
  tools: "ابزار و وسایل",
  photography: "عکاسی آثار",
  printing: "چاپ",
  transport: "رفت‌وآمد",
  other: "سایر",
};

export const STUDENT_EXPENSE_TITLE_MAX = 120;
export const STUDENT_EXPENSE_DESCRIPTION_MAX = 1000;

export type StudentExpenseForm = {
  student_id: string;
  category: StudentExpenseCategory;
  title: string;
  description: string;
  amount: string;
  expense_date: string;
};
export type StudentExpenseFormErrors = Partial<Record<keyof StudentExpenseForm, string>>;

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-");
  if (parts.length !== 3) return false;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (![year, month, day].every(Number.isInteger)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function validateStudentExpenseForm(form: StudentExpenseForm): StudentExpenseFormErrors {
  const errors: StudentExpenseFormErrors = {};
  if (!form.student_id.trim()) errors.student_id = "هنرجو مشخص نشده است.";
  if (!STUDENT_EXPENSE_CATEGORIES.includes(form.category)) errors.category = "دسته‌بندی معتبر نیست.";
  const title = form.title.trim();
  if (!title) errors.title = "عنوان هزینه را وارد کنید.";
  else if (title.length > STUDENT_EXPENSE_TITLE_MAX) errors.title = `عنوان حداکثر ${STUDENT_EXPENSE_TITLE_MAX} کاراکتر باشد.`;
  const amount = parseAmount(form.amount);
  if (!form.amount.trim()) errors.amount = "مبلغ را وارد کنید.";
  else if (amount === null) errors.amount = "مبلغ باید عدد صحیح و به تومان باشد.";
  else if (amount <= 0) errors.amount = "مبلغ باید بیشتر از صفر باشد.";
  else if (amount > PAYMENT_AMOUNT_MAX) errors.amount = "مبلغ بیش از حد مجاز است.";
  if (!isRealIsoDate(form.expense_date)) errors.expense_date = "تاریخ هزینه معتبر نیست.";
  if (form.description.trim().length > STUDENT_EXPENSE_DESCRIPTION_MAX) errors.description = `توضیحات حداکثر ${STUDENT_EXPENSE_DESCRIPTION_MAX} کاراکتر باشد.`;
  return errors;
}

export type StudentExpenseLike = { amount: number | string | null; status: string | null };
export type StudentExpenseSummary = {
  pending: { count: number; total: number };
  approved: { count: number; total: number };
  rejected: { count: number; total: number };
  /** Breakdown only. Approved amounts are represented by their linked payment in balances. */
  approvedLedgerTotal: number;
};

export function summarizeStudentExpenses(rows: StudentExpenseLike[]): StudentExpenseSummary {
  const summary: StudentExpenseSummary = {
    pending: { count: 0, total: 0 },
    approved: { count: 0, total: 0 },
    rejected: { count: 0, total: 0 },
    approvedLedgerTotal: 0,
  };
  for (const row of rows) {
    if (row.status !== "pending" && row.status !== "approved" && row.status !== "rejected") continue;
    const amount = parseAmount(row.amount ?? 0) ?? 0;
    summary[row.status].count += 1;
    summary[row.status].total += amount;
    if (row.status === "approved") summary.approvedLedgerTotal += amount;
  }
  return summary;
}

/** Client payload deliberately contains no approval fields and always starts pending. */
export function studentExpenseInsertPayload(form: StudentExpenseForm, submittedBy: string) {
  return {
    student_id: form.student_id,
    submitted_by: submittedBy,
    category: form.category,
    title: form.title.trim(),
    description: form.description.trim() || null,
    amount: parseAmount(form.amount) ?? 0,
    expense_date: form.expense_date,
    status: "pending" as const,
  };
}
