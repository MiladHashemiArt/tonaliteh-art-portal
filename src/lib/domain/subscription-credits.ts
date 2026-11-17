import type { SubscriptionPeriod } from "./subscription-periods";

export type SubscriptionDuration = 1 | 2 | 3;

export type MonthlyAllocation = SubscriptionPeriod & {
  quota: number;
};

export type CreditLedgerEntry = {
  allocationId: string;
  delta: number;
  idempotencyKey: string;
  reason: "booking" | "booking_release" | "attendance_correction" | "staff_adjustment" | "makeup";
};

export type CreditBalance = {
  quota: number;
  consumed: number;
  available: number;
};

/** Presets are conveniences only; any positive whole-number monthly quota is valid. */
export const MONTHLY_QUOTA_PRESETS = [4, 8, 12] as const;

export function validateMonthlyQuota(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateSubscriptionDuration(value: number): value is SubscriptionDuration {
  return value === 1 || value === 2 || value === 3;
}

export function totalSubscriptionEntitlement(
  monthlyQuota: number,
  durationMonths: number,
): number {
  if (!validateMonthlyQuota(monthlyQuota)) {
    throw new Error("سهمیه ماهانه باید عدد صحیح بیشتر از صفر باشد.");
  }
  if (!validateSubscriptionDuration(durationMonths)) {
    throw new Error("مدت اشتراک باید یک، دو یا سه ماه باشد.");
  }
  return monthlyQuota * durationMonths;
}

export function createMonthlyAllocations(
  periods: SubscriptionPeriod[],
  monthlyQuota: number,
): MonthlyAllocation[] {
  if (!validateMonthlyQuota(monthlyQuota)) {
    throw new Error("سهمیه ماهانه باید عدد صحیح بیشتر از صفر باشد.");
  }
  if (periods.length < 1 || periods.length > 3) {
    throw new Error("تعداد دوره‌های اشتراک باید بین یک تا سه باشد.");
  }
  return periods.map((period, index) => {
    if (period.periodNumber !== index + 1) {
      throw new Error("شماره دوره‌ها باید پیوسته و از یک شروع شود.");
    }
    return { ...period, quota: monthlyQuota };
  });
}

/**
 * Ledger balances are append-only: releases and corrections are positive
 * compensating entries; never mutate or delete the original debit.
 */
export function calculateCreditBalance(
  allocationId: string,
  allocation: MonthlyAllocation,
  entries: CreditLedgerEntry[],
): CreditBalance {
  if (!allocationId.trim() || !validateMonthlyQuota(allocation.quota)) {
    throw new Error("اطلاعات سهمیه ماهانه معتبر نیست.");
  }

  const seenKeys = new Set<string>();
  let netDelta = 0;
  for (const entry of entries) {
    if (!entry.idempotencyKey.trim()) {
      throw new Error("هر تراکنش اعتبار باید کلید یکتای تکرارناپذیر داشته باشد.");
    }
    if (seenKeys.has(entry.idempotencyKey)) {
      throw new Error("تراکنش تکراری در دفتر اعتبار وجود دارد.");
    }
    seenKeys.add(entry.idempotencyKey);
    if (!Number.isSafeInteger(entry.delta) || entry.delta === 0) {
      throw new Error("تغییر اعتبار باید عدد صحیح غیرصفر باشد.");
    }
    if (entry.allocationId !== allocationId) continue;

    if ((entry.reason === "booking" || entry.reason === "makeup") && entry.delta > 0) {
      throw new Error("تراکنش رزرو باید از اعتبار کسر کند.");
    }
    if (entry.reason === "booking_release" && entry.delta < 0) {
      throw new Error("تراکنش آزادسازی رزرو باید اعتبار را بازگرداند.");
    }

    netDelta += entry.delta;
    if (!Number.isSafeInteger(netDelta)) {
      throw new Error("مجموع تراکنش‌های اعتبار از محدوده مجاز خارج شده است.");
    }
  }

  const consumed = -netDelta;
  if (consumed < 0) {
    throw new Error("آزادسازی اعتبار نمی‌تواند از مجموع اعتبار قبلاً مصرف‌شده بیشتر باشد.");
  }
  const available = allocation.quota - consumed;
  if (available < 0) throw new Error("مصرف اعتبار از سهمیه این ماه بیشتر شده است.");
  return { quota: allocation.quota, consumed, available };
}

/** Whether one ordinary class booking may debit this month's allocation. */
export function canDebitAllocation(
  allocation: MonthlyAllocation,
  sessionDate: string,
  balance: CreditBalance,
): boolean {
  return (
    sessionDate >= allocation.startsOn &&
    sessionDate <= allocation.endsOn &&
    balance.available > 0
  );
}
