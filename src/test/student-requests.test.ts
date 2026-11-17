import { describe, expect, it } from "vitest";

import {
  decideRescheduleRequest,
  makeupCreditDebit,
  staffNotifications,
  submitAbsenceNotice,
  submitRescheduleRequest,
} from "@/lib/domain/student-requests";

describe("student absence and reschedule workflow", () => {
  it("creates an absence notice without cancelling the reservation", () => {
    const notice = submitAbsenceNotice({
      id: "absence-1",
      reservationId: "reservation-1",
      studentId: "student-1",
      sessionDate: "2026-11-20",
      submittedAt: "2026-11-18T10:00:00+03:30",
      reason: "Unable to attend",
    });
    expect(notice.status).toBe("submitted");
    expect(notice.reservationId).toBe("reservation-1");
  });

  it("notifies both teacher and manager for absence and reschedule requests", () => {
    expect(staffNotifications("absence_notice", "absence-1").map((n) => n.recipientRole))
      .toEqual(["teacher", "manager"]);
    expect(staffNotifications("reschedule_request", "move-1").map((n) => n.recipientRole))
      .toEqual(["teacher", "manager"]);
  });

  it("keeps a reschedule pending until staff decides", () => {
    const request = submitRescheduleRequest({
      id: "move-1",
      reservationId: "reservation-1",
      studentId: "student-1",
      fromOccurrenceId: "occurrence-a",
      requestedOccurrenceId: "occurrence-b",
      submittedAt: "2026-11-18T10:00:00+03:30",
    });
    expect(request.status).toBe("submitted");
    expect(request.fromOccurrenceId).toBe("occurrence-a");
  });

  it("allows either teacher or manager to decide without mutual approval", () => {
    const request = submitRescheduleRequest({
      id: "move-1",
      reservationId: "reservation-1",
      studentId: "student-1",
      fromOccurrenceId: "occurrence-a",
      requestedOccurrenceId: "occurrence-b",
      submittedAt: "2026-11-18T10:00:00+03:30",
    });
    expect(decideRescheduleRequest(request, {
      approved: true,
      actorRole: "teacher",
      decidedAt: "2026-11-18T11:00:00+03:30",
    }).status).toBe("approved");
    expect(decideRescheduleRequest(request, {
      approved: false,
      actorRole: "manager",
      decidedAt: "2026-11-18T11:00:00+03:30",
    }).status).toBe("rejected");
  });

  it("prevents a second decision and rejects same-occurrence requests", () => {
    const request = submitRescheduleRequest({
      id: "move-1",
      reservationId: "reservation-1",
      studentId: "student-1",
      fromOccurrenceId: "occurrence-a",
      requestedOccurrenceId: "occurrence-b",
      submittedAt: "2026-11-18T10:00:00+03:30",
    });
    const approved = decideRescheduleRequest(request, {
      approved: true,
      actorRole: "manager",
      decidedAt: "2026-11-18T11:00:00+03:30",
    });
    expect(() => decideRescheduleRequest(approved, {
      approved: true,
      actorRole: "teacher",
      decidedAt: "2026-11-18T12:00:00+03:30",
    })).toThrow();
    expect(() => submitRescheduleRequest({
      id: "move-2",
      reservationId: "reservation-1",
      studentId: "student-1",
      fromOccurrenceId: "occurrence-a",
      requestedOccurrenceId: "occurrence-a",
      submittedAt: "2026-11-18T10:00:00+03:30",
    })).toThrow();
  });

  it("does not debit a second ordinary credit for a charged absence make-up", () => {
    expect(makeupCreditDebit(true)).toBe(0);
    expect(makeupCreditDebit(false)).toBe(1);
  });
});
