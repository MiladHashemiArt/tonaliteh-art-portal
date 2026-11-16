import { describe, expect, it } from "vitest";

import { classifyAttendanceBilling } from "./attendance-billing";

describe("attendance billing classification", () => {
  it("does not debit an approved make-up attendance", () => {
    expect(classifyAttendanceBilling({
      hasMatchingSubscription: true,
      subscriptionStatus: "active",
      consumedSessions: 2,
      totalSessions: 8,
      isApprovedMakeup: true,
    }).kind).toBe("makeup_exempt");
  });

  it("classifies a matching active subscription as a credit debit", () => {
    expect(classifyAttendanceBilling({
      hasMatchingSubscription: true,
      subscriptionStatus: "active",
      consumedSessions: 2,
      totalSessions: 8,
      isApprovedMakeup: false,
    }).kind).toBe("subscription_credit");
  });

  it("never treats a student without a subscription as already paid", () => {
    const result = classifyAttendanceBilling({
      hasMatchingSubscription: false,
      isApprovedMakeup: false,
    });
    expect(result.kind).toBe("single_session_review");
    expect(result.label).toContain("نیازمند ثبت و بررسی مالی");
  });

  it("flags exhausted subscriptions for staff review", () => {
    expect(classifyAttendanceBilling({
      hasMatchingSubscription: true,
      subscriptionStatus: "active",
      consumedSessions: 8,
      totalSessions: 8,
      isApprovedMakeup: false,
    }).kind).toBe("subscription_exhausted");
  });

  it("flags inactive subscriptions without inventing a payment", () => {
    expect(classifyAttendanceBilling({
      hasMatchingSubscription: true,
      subscriptionStatus: "expired",
      consumedSessions: 2,
      totalSessions: 8,
      isApprovedMakeup: false,
    }).kind).toBe("subscription_inactive");
  });
});
