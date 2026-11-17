import { describe, expect, it } from "vitest";

import {
  calculateCreditBalance,
  canDebitAllocation,
  createMonthlyAllocations,
  totalSubscriptionEntitlement,
  validateMonthlyQuota,
} from "@/lib/domain/subscription-credits";
import { buildSubscriptionPeriods } from "@/lib/domain/subscription-periods";

describe("monthly subscription credits", () => {
  const periods = buildSubscriptionPeriods("2026-11-17", 3);
  const allocations = createMonthlyAllocations(periods, 6);

  it("treats 4, 8, and 12 as presets but accepts custom monthly quotas", () => {
    expect(validateMonthlyQuota(4)).toBe(true);
    expect(validateMonthlyQuota(8)).toBe(true);
    expect(validateMonthlyQuota(12)).toBe(true);
    expect(validateMonthlyQuota(6)).toBe(true);
    expect(validateMonthlyQuota(10)).toBe(true);
    expect(validateMonthlyQuota(0)).toBe(false);
    expect(validateMonthlyQuota(1.5)).toBe(false);
  });

  it("calculates total entitlement from monthly quota times term", () => {
    expect(totalSubscriptionEntitlement(6, 2)).toBe(12);
    expect(totalSubscriptionEntitlement(10, 3)).toBe(30);
    expect(() => totalSubscriptionEntitlement(0, 2)).toThrow();
    expect(() => totalSubscriptionEntitlement(4, 4)).toThrow();
  });

  it("allocates quota separately to each month, not as one upfront pool", () => {
    expect(allocations.map((allocation) => allocation.quota)).toEqual([6, 6, 6]);
    expect(allocations).toHaveLength(3);
  });

  it("does not allow spending future-month quota early", () => {
    const firstMonthBalance = calculateCreditBalance("month-1", allocations[0], []);
    expect(canDebitAllocation(allocations[0], allocations[1].startsOn, firstMonthBalance)).toBe(false);
    expect(canDebitAllocation(allocations[1], allocations[1].startsOn, { quota: 6, consumed: 0, available: 6 })).toBe(true);
  });

  it("tracks append-only debits and compensating releases", () => {
    const balance = calculateCreditBalance(allocations[0], [
      { allocationId: "month-1", delta: -1, idempotencyKey: "booking:abc", reason: "booking" },
      { allocationId: "month-1", delta: 1, idempotencyKey: "release:abc", reason: "booking_release" },
      { allocationId: "month-1", delta: -2, idempotencyKey: "booking:def", reason: "booking" },
    ]);
    expect(balance).toEqual({ quota: 6, consumed: 2, available: 4 });
  });

  it("rejects duplicate idempotency keys and over-consumption", () => {
    expect(() => calculateCreditBalance(allocations[0], [
      { allocationId: "month-1", delta: -1, idempotencyKey: "same", reason: "booking" },
      { allocationId: "month-1", delta: -1, idempotencyKey: "same", reason: "booking" },
    ])).toThrow();
    expect(() => calculateCreditBalance(allocations[0], [
      { allocationId: "month-1", delta: -7, idempotencyKey: "too-many", reason: "booking" },
    ])).toThrow();
  });
});
