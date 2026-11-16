export const SUBSCRIPTION_DURATIONS = [1, 2, 3] as const;
export const MONTHLY_SESSION_OPTIONS = [4, 8, 12] as const;

export type SubscriptionDuration = (typeof SUBSCRIPTION_DURATIONS)[number];
export type MonthlySessionCount = (typeof MONTHLY_SESSION_OPTIONS)[number];

export const MONTHLY_TUITION_TOMAN: Record<MonthlySessionCount, number> = {
  4: 3_000_000,
  8: 6_000_000,
  12: 9_000_000,
};

export const DISCOUNTED_MONTHLY_TUITION_TOMAN: Partial<
  Record<MonthlySessionCount, number>
> = {
  8: 5_600_000,
  12: 8_000_000,
};

export const SINGLE_SESSION_TUITION_TOMAN = 750_000;

export type SubscriptionQuote = {
  durationMonths: SubscriptionDuration;
  sessionsPerMonth: MonthlySessionCount;
  totalSessions: number;
  monthlyPriceToman: number;
  totalPriceToman: number;
  discountApplied: boolean;
};

/** A package grants 4/8/12 attendance credits in EACH month of its duration. */
export function quoteSubscription(
  durationMonths: SubscriptionDuration,
  sessionsPerMonth: MonthlySessionCount,
  discountApproved = false,
): SubscriptionQuote {
  const discountedPrice = DISCOUNTED_MONTHLY_TUITION_TOMAN[sessionsPerMonth];
  const discountApplied = discountApproved && discountedPrice !== undefined;
  const monthlyPriceToman = discountApplied
    ? discountedPrice
    : MONTHLY_TUITION_TOMAN[sessionsPerMonth];

  return {
    durationMonths,
    sessionsPerMonth,
    totalSessions: durationMonths * sessionsPerMonth,
    monthlyPriceToman,
    totalPriceToman: durationMonths * monthlyPriceToman,
    discountApplied,
  };
}
