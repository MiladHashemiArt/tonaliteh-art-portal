export type StaffRole = "teacher" | "manager";
export type StudentRequestStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "completed";

export type AbsenceNotice = {
  id: string;
  reservationId: string;
  studentId: string;
  sessionDate: string;
  submittedAt: string;
  reason?: string;
  status: "submitted" | "acknowledged" | "makeup_pending" | "resolved";
};

export type RescheduleRequest = {
  id: string;
  reservationId: string;
  studentId: string;
  fromOccurrenceId: string;
  requestedOccurrenceId: string;
  submittedAt: string;
  status: StudentRequestStatus;
  decidedBy?: StaffRole;
  decidedAt?: string;
  decisionNote?: string;
};

export type StaffNotification = {
  recipientRole: StaffRole;
  event: "absence_notice" | "reschedule_request";
  requestId: string;
};

/** Both staff roles are notified; push delivery is a server concern. */
export function staffNotifications(
  event: StaffNotification["event"],
  requestId: string,
): StaffNotification[] {
  return (["teacher", "manager"] as const).map((recipientRole) => ({
    recipientRole,
    event,
    requestId,
  }));
}

/** Students may report an absence, but this never cancels the reservation or refunds credit. */
export function submitAbsenceNotice(input: {
  id: string;
  reservationId: string;
  studentId: string;
  sessionDate: string;
  submittedAt: string;
  reason?: string;
}): AbsenceNotice {
  if (!input.id.trim() || !input.reservationId.trim() || !input.studentId.trim()) {
    throw new Error("اطلاعات اعلام غیبت ناقص است.");
  }
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(input.sessionDate)) {
    throw new Error("تاریخ جلسه معتبر نیست.");
  }
  return { ...input, status: "submitted" };
}

/** A reschedule request is only a request. The original booking remains active until staff approval. */
export function submitRescheduleRequest(input: Omit<
  RescheduleRequest,
  "status" | "decidedBy" | "decidedAt" | "decisionNote"
>): RescheduleRequest {
  if (
    !input.id.trim() ||
    !input.reservationId.trim() ||
    !input.studentId.trim() ||
    !input.fromOccurrenceId.trim() ||
    !input.requestedOccurrenceId.trim()
  ) {
    throw new Error("اطلاعات درخواست جابه‌جایی ناقص است.");
  }
  if (input.fromOccurrenceId === input.requestedOccurrenceId) {
    throw new Error("سانس مقصد باید با سانس فعلی متفاوت باشد.");
  }
  return { ...input, status: "submitted" };
}

export function decideRescheduleRequest(
  request: RescheduleRequest,
  decision: {
    approved: boolean;
    actorRole: StaffRole;
    decidedAt: string;
    note?: string;
  },
): RescheduleRequest {
  if (request.status !== "submitted") {
    throw new Error("این درخواست قبلاً بررسی شده است.");
  }
  if (!decision.decidedAt.trim()) {
    throw new Error("زمان تصمیم‌گیری الزامی است.");
  }
  return {
    ...request,
    status: decision.approved ? "approved" : "rejected",
    decidedBy: decision.actorRole,
    decidedAt: decision.decidedAt,
    decisionNote: decision.note,
  };
}

/** A make-up is linked to the original charged absence and must not debit a second ordinary credit. */
export function makeupCreditDebit(originalAbsenceAlreadyCharged: boolean): 0 | 1 {
  return originalAbsenceAlreadyCharged ? 0 : 1;
}
