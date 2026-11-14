import { describe, expect, it } from "vitest";

import {
  filterPayments,
  parseAmount,
  paymentBucket,
  summarizePayments,
  validatePaymentForm,
  type PaymentForm,
} from "@/lib/domain/payments";
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
    expect(isValidIban("IR85 0120 0000 0000 0000 0000 0000 01")).toBe(true);
    expect(isValidIban("012000000000000000000001")).toBe(false);
    expect(isValidIban("IR86012000000000000000000001")).toBe(false);
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
      payment_iban: "ir85 0120 0000 0000 0000 0000 0000 01",
      group_phone: "۰۲۱ ۱۲۳۴ ۵۶۷۸",
    });
    expect(out.payment_card_number).toBe("6000000000000007");
    expect(out.payment_iban).toBe("IR85012000000000000000000001");
    expect(out.group_phone).toBe("02112345678");
  });
});
