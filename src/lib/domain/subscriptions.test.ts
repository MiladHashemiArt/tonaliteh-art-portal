import { describe, expect, it } from "vitest";

import {
  quoteSubscription,
  SINGLE_SESSION_TUITION_TOMAN,
} from "./subscriptions";

describe("quoteSubscription", () => {
  it("treats the session count as a monthly allowance across the full duration", () => {
    expect(quoteSubscription(3, 8)).toMatchObject({
      totalSessions: 24,
      monthlyPriceToman: 6_000_000,
      totalPriceToman: 18_000_000,
      discountApplied: false,
    });
  });

  it("applies the approved 8-session monthly discount for each month", () => {
    expect(quoteSubscription(2, 8, true)).toMatchObject({
      totalSessions: 16,
      monthlyPriceToman: 5_600_000,
      totalPriceToman: 11_200_000,
      discountApplied: true,
    });
  });

  it("applies the approved 12-session monthly discount for each month", () => {
    expect(quoteSubscription(3, 12, true).totalPriceToman).toBe(24_000_000);
  });

  it("does not apply a discount to the 4-session package", () => {
    expect(quoteSubscription(1, 4, true)).toMatchObject({
      monthlyPriceToman: 3_000_000,
      discountApplied: false,
    });
  });

  it("keeps single-session tuition separate from monthly package pricing", () => {
    expect(SINGLE_SESSION_TUITION_TOMAN).toBe(750_000);
  });
});
