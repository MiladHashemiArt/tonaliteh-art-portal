import { describe, expect, it } from "vitest";
import {
  studentExpenseInsertPayload,
  summarizeStudentExpenses,
  validateStudentExpenseForm,
  type StudentExpenseForm,
} from "@/lib/domain/expenses";

const form: StudentExpenseForm = {
  student_id: "student-1",
  category: "materials",
  title: "رنگ روغن",
  description: "خرید رنگ برای تمرین",
  amount: "۱٬۵۰۰٬۰۰۰",
  expense_date: "2026-11-14",
};

describe("student expense form", () => {
  it("accepts Persian digits and creates a pending-only student payload", () => {
    expect(validateStudentExpenseForm(form)).toEqual({});
    expect(studentExpenseInsertPayload(form, "student-1")).toEqual({
      student_id: "student-1",
      submitted_by: "student-1",
      category: "materials",
      title: "رنگ روغن",
      description: "خرید رنگ برای تمرین",
      amount: 1500000,
      expense_date: "2026-11-14",
      status: "pending",
    });
  });
  it("rejects zero, negative, fractional and malformed amounts", () => {
    for (const amount of ["0", "-10", "12.5", "abc"]) {
      expect(validateStudentExpenseForm({ ...form, amount }).amount).toBeDefined();
    }
  });
  it("requires a real calendar date and a title", () => {
    const errors = validateStudentExpenseForm({ ...form, title: "  ", expense_date: "2026-02-30" });
    expect(errors.title).toBeDefined();
    expect(errors.expense_date).toBeDefined();
  });
  it("summarizes statuses separately and keeps approved costs as a breakdown", () => {
    expect(summarizeStudentExpenses([
      { amount: 100, status: "pending" },
      { amount: "۲۰۰", status: "approved" },
      { amount: 300, status: "rejected" },
      { amount: 999, status: "unknown" },
    ])).toEqual({
      pending: { count: 1, total: 100 },
      approved: { count: 1, total: 200 },
      rejected: { count: 1, total: 300 },
      approvedLedgerTotal: 200,
    });
  });
});
