/**
 * Staff-side classification for attendance billing.
 *
 * This is intentionally advisory: the database trigger remains authoritative
 * for subscription debits. A missing subscription is never labelled "paid".
 */
export type AttendanceBillingInput = {
  hasMatchingSubscription: boolean;
  subscriptionStatus?: string | null;
  consumedSessions?: number | null;
  totalSessions?: number | null;
  isApprovedMakeup: boolean;
};

export type AttendanceBillingDecision =
  | { kind: "makeup_exempt"; label: "جلسه جبرانی؛ بدون کسر اعتبار" }
  | { kind: "subscription_credit"; label: "کسر از اعتبار اشتراک" }
  | { kind: "subscription_exhausted"; label: "اعتبار اشتراک تمام شده؛ نیازمند بررسی استاد" }
  | { kind: "subscription_inactive"; label: "اشتراک فعال نیست؛ نیازمند بررسی استاد" }
  | { kind: "single_session_review"; label: "جلسه آزاد؛ نیازمند ثبت و بررسی مالی" };

/** Classifies the next staff action without charging or marking a payment as received. */
export function classifyAttendanceBilling(
  input: AttendanceBillingInput,
): AttendanceBillingDecision {
  if (input.isApprovedMakeup) {
    return { kind: "makeup_exempt", label: "جلسه جبرانی؛ بدون کسر اعتبار" };
  }

  if (!input.hasMatchingSubscription) {
    return { kind: "single_session_review", label: "جلسه آزاد؛ نیازمند ثبت و بررسی مالی" };
  }

  if (input.subscriptionStatus !== "active") {
    return {
      kind: input.consumedSessions != null &&
        input.totalSessions != null &&
        input.consumedSessions >= input.totalSessions
        ? "subscription_exhausted"
        : "subscription_inactive",
      label: input.consumedSessions != null &&
        input.totalSessions != null &&
        input.consumedSessions >= input.totalSessions
        ? "اعتبار اشتراک تمام شده؛ نیازمند بررسی استاد"
        : "اشتراک فعال نیست؛ نیازمند بررسی استاد",
    };
  }

  if (
    input.consumedSessions != null &&
    input.totalSessions != null &&
    input.consumedSessions >= input.totalSessions
  ) {
    return {
      kind: "subscription_exhausted",
      label: "اعتبار اشتراک تمام شده؛ نیازمند بررسی استاد",
    };
  }

  return { kind: "subscription_credit", label: "کسر از اعتبار اشتراک" };
}
