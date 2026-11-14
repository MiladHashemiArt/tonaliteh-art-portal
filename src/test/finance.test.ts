import { describe, expect, it } from "vitest";

import {
  buildFinanceReport,
  filterPayments,
  isWithinFinanceDateRange,
  parseAmount,
  paymentBucket,
  summarizePayments,
  validatePaymentForm,
  type PaymentForm,
} from "@/lib/domain/payments";
import { summarizeStudentExpenses } from "@/lib/domain/expenses";
import {
  isValidCardNumber,
  isValidIban,
  normalizeGroupPayment,
  validateGroupPayment,
  type GroupPaymentForm,
} from "@/lib/domain/settings";

const form: PaymentForm = {
  student_id: "s1",
  amount: "۱٬۵۰۰٬۰۰۰",
  payment_date: "2026-11-14",
  description: "",
  status: "pending",
};

describe("staff payment form", () => {
  it("accepts Persian digits with separators", () => {
    expect(parseAmount("۱٬۵۰۰٬۰۰۰")).toBe(1500000);
    expect(validatePaymentForm(form)).toEqual({});
  });
  it("requires amount greater than zero", () => {
    expect(validatePaymentForm({ ...form, amount: "0" }).amount).toBeDefined();
    expect(validatePaymentForm({ ...form, amount: "-5" }).amount).toBeDefined();
    expect(validatePaymentForm({ ...form, amount: "abc" }).amount).toBeDefined();
  });
  it("requires a student and a date", () => {
    const e = validatePaymentForm({ ...form, student_id: "", payment_date: "" });
    expect(e.student_id).toBeDefined();
    expect(e.payment_date).toBeDefined();
  });
  it("only allows pending, paid or rejected", () => {
    expect(validatePaymentForm({ ...form, status: "overdue" as never }).status).toBeDefined();
  });
});

describe("finance report date range", () => {
  it("includes both endpoints and treats an empty range as all valid dates", () => {
    expect(isWithinFinanceDateRange("2026-11-01", { from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(isWithinFinanceDateRange("2026-11-30", { from: "2026-11-01", to: "2026-11-30" })).toBe(true);
    expect(isWithinFinanceDateRange("2026-10-31", { from: "2026-11-01", to: "2026-11-30" })).toBe(false);
    expect(isWithinFinanceDateRange("2026-12-01", { from: "2026-11-01", to: "2026-11-30" })).toBe(false);
    expect(isWithinFinanceDateRange("2026-11-14", { from: "", to: "" })).toBe(true);
  });

  it("excludes rows without a valid ISO date", () => {
    expect(isWithinFinanceDateRange(null, { from: "", to: "" })).toBe(false);
    expect(isWithinFinanceDateRange("not-a-date", { from: "", to: "" })).toBe(false);
  });
});

describe("finance report", () => {
  it("does not double count linked extra charges in pending balances", () => {
    const report = buildFinanceReport(
      [{ id: "p1", student_id: "s1", amount: 150000, status: "pending", payment_date: "2026-11-14", description: "extra" }],
      [{ student_id: "s1", class_id: "c1", amount: 150000 }],
    );
    expect(report.pendingTotal).toBe(150000);
    expect(report.extraTotal).toBe(150000);
    expect(report.students[0]).toEqual({ studentId: "s1", paid: 0, pending: 150000, extra: 150000 });
    expect(report.classes).toEqual([{ classId: "c1", extra: 150000, count: 1 }]);
  });
  it("groups monthly payments and ignores unknown statuses", () => {
    const report = buildFinanceReport([
      { id: "1", student_id: "s1", amount: 100, status: "paid", payment_date: "2026-10-04", description: null },
      { id: "2", student_id: "s1", amount: 200, status: "pending", payment_date: "2026-11-04", description: null },
      { id: "3", student_id: "s1", amount: 999, status: "other", payment_date: "2026-11-05", description: null },
    ], []);
    expect(report.monthly).toEqual([{ month: "2026-10", paid: 100, pending: 0 }, { month: "2026-11", paid: 0, pending: 200 }]);
    expect(report.rejectedTotal).toBe(0);
  });
});

describe("student expense finance breakdown", () => {
  it("keeps pending expenses out of confirmed balances and treats approved expenses as a breakdown only", () => {
    const summary = summarizeStudentExpenses([
      { amount: 120000, status: "pending" },
      { amount: "۸۰۰۰۰", status: "approved" },
      { amount: 50000, status: "rejected" },
    ]);
    expect(summary.pending).toEqual({ count: 1, total: 120000 });
    expect(summary.approved).toEqual({ count: 1, total: 80000 });
    expect(summary.rejected).toEqual({ count: 1, total: 50000 });
    expect(summary.approvedLedgerTotal).toBe(80000);
  });
});

describe("payment totals and filters", () => {
  const rows = [
    { id: "1", student_id: "a", amount: 1000, status: "paid", description: null },
    { id: "2", student_id: "a", amount: "2000", status: "completed", description: null },
    { id: "3", student_id: "b", amount: 500, status: "pending", description: "آبان" },
    { id: "4", student_id: "b", amount: 700, status: "rejected", description: null },
  ];
  it("groups legacy statuses and sums by status", () => {
    expect(paymentBucket("completed")).toBe("paid");
    const t = summarizePayments(rows);
    expect(t.paid).toEqual({ count: 2, total: 3000 });
    expect(t.pending).toEqual({ count: 1, total: 500 });
    expect(t.rejected).toEqual({ count: 1, total: 700 });
  });
  it("filters by status and by student name or description", () => {
    const name = (id: string) => (id === "a" ? "سارا" : "علی 09121234567");
    expect(filterPayments(rows, { query: "", status: "paid" }, name).map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterPayments(rows, { query: "سارا", status: "all" }, name)).toHaveLength(2);
    expect(filterPayments(rows, { query: "۰۹۱۲", status: "all" }, name)).toHaveLength(2);
    expect(filterPayments(rows, { query: "آبان", status: "all" }, name).map((r) => r.id)).toEqual(["3"]);
  });
});

const blank: GroupPaymentForm = {
  group_phone: "",
  group_address: "",
  payment_card_number: "",
  payment_card_holder: "",
  payment_bank_name: "",
  payment_iban: "",
  payment_notes: "",
  extra_hourly_rate: "",
  extra_session_rate: "",
};

describe("group contact and payment settings", () => {
  it("allows every field to stay blank", () => {
    expect(validateGroupPayment(blank)).toEqual({});
    expect(normalizeGroupPayment(blank)).toEqual(blank);
  });
  it("checks card numbers with the Luhn rule", () => {
    expect(isValidCardNumber("6000-0000-0000-0007")).toBe(true);
    expect(isValidCardNumber("6000000000000008")).toBe(false);
    expect(isValidCardNumber("12345")).toBe(false);
  });
  it("checks IBAN checksum and accepts 24 bare digits", () => {
    expect(isValidIban("IR43 0120 0000 0000 0000 0000 01")).toBe(true);
    expect(isValidIban("012000000000000000000001")).toBe(false);
    expect(isValidIban("IR440120000000000000000001")).toBe(false);
  });
  it("validates extra-time and extra-session rates as positive integer toman amounts", () => {
    expect(validateGroupPayment({
      ...blank,
      extra_hourly_rate: "۰",
      extra_session_rate: "-100",
    }).extra_hourly_rate).toBeDefined();
    expect(validateGroupPayment({
      ...blank,
      extra_hourly_rate: "۱۵۰۰۰۰",
      extra_session_rate: "۳۰۰۰۰۰",
    })).toEqual({});
  });
  it("normalizes extra rates to Latin digits", () => {
    const out = normalizeGroupPayment({
      ...blank,
      extra_hourly_rate: "۱۵۰۰۰۰",
      extra_session_rate: "۳۰۰۰۰۰",
    });
    expect(out.extra_hourly_rate).toBe("150000");
    expect(out.extra_session_rate).toBe("300000");
  });
  it("rejects invalid phone, card and IBAN", () => {
    const e = validateGroupPayment({
      ...blank,
      group_phone: "123",
      payment_card_number: "1111",
      payment_iban: "IR00",
    });
    expect(e.group_phone).toBeDefined();
    expect(e.payment_card_number).toBeDefined();
    expect(e.payment_iban).toBeDefined();
  });
  it("stores card as bare digits and IBAN with IR prefix", () => {
    const out = normalizeGroupPayment({
      ...blank,
      payment_card_number: "۶۰۰۰-۰۰۰۰-۰۰۰۰-۰۰۰۷",
      payment_iban: "ir43 0120 0000 0000 0000 0000 01",
      group_phone: "۰۲۱ ۱۲۳۴ ۵۶۷۸",
    });
    expect(out.payment_card_number).toBe("6000000000000007");
    expect(out.payment_iban).toBe("IR430120000000000000000001");
    expect(out.group_phone).toBe("02112345678");
  });
});
