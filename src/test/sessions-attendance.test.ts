import { describe, expect, it } from "vitest";

import type { ClassSessionRow, OccurrenceRow, ProfileRow } from "@/lib/backend/types";
import { adjustmentAmount, buildRoster, initialStatus, parseQuantity, validateAdjustment } from "@/lib/domain/attendance";
import { countActive, occurrenceState, parseCapacity, reserveBlocker, seatsLeft } from "@/lib/domain/reservations";
import { meetingDates, occursOn } from "@/lib/domain/schedule";
import { validateRates } from "@/lib/domain/settings";

const thursday: ClassSessionRow = {
  id: "t", class_day: "پنجشنبه", start_time: "16:00", end_time: "19:00", class_type: null,
  session_date: null, is_active: true, recurrence_weeks: 2, recurrence_anchor_date: "2026-11-19",
};
const occ = (o: Partial<OccurrenceRow> = {}): OccurrenceRow => ({
  id: "o", class_session_id: "t", session_date: "2026-11-19", published_at: "2026-11-10T00:00:00Z",
  published_by: null, is_open: true, is_cancelled: false, capacity: 2, booked_count: 0,
  created_at: "", updated_at: null, ...o,
});
const p = (id: string, name: string) => ({ id, full_name: name }) as ProfileRow;

describe("Thursday every other week", () => {
  it("meets on the anchor Thursday and two weeks later, not the week between", () => {
    expect(occursOn(thursday, "2026-11-19")).toBe(true);
    expect(occursOn(thursday, "2026-11-26")).toBe(false);
    expect(occursOn(thursday, "2026-12-03")).toBe(true);
    expect(meetingDates(thursday, "2026-11-16", "2026-12-06")).toEqual(["2026-11-19", "2026-12-03"]);
  });
  it("does not meet without an anchor date", () => {
    expect(occursOn({ ...thursday, recurrence_anchor_date: null }, "2026-11-19")).toBe(false);
  });
});

describe("reservations", () => {
  it("blocks a full session", () => {
    expect(reserveBlocker({ occurrence: occ(), todayIso: "2026-11-16", booked: 2, alreadyReserved: false })).toMatch(/ظرفیت/);
    expect(reserveBlocker({ occurrence: occ(), todayIso: "2026-11-16", booked: 1, alreadyReserved: false })).toBeNull();
  });
  it("blocks a second reservation by the same student", () => {
    expect(reserveBlocker({ occurrence: occ(), todayIso: "2026-11-16", booked: 0, alreadyReserved: true })).not.toBeNull();
  });
  it("blocks unpublished, closed, cancelled and past sessions", () => {
    expect(occurrenceState(occ({ published_at: null }), "2026-11-16")).toBe("draft");
    expect(occurrenceState(occ({ is_open: false }), "2026-11-16")).toBe("closed");
    expect(occurrenceState(occ({ is_cancelled: true }), "2026-11-16")).toBe("cancelled");
    expect(occurrenceState(occ(), "2026-11-20")).toBe("past");
  });
  it("counts only active reservations and never shows negative places", () => {
    const rows = [
      { id: "1", occurrence_id: "o", student_id: "a", status: "reserved", created_at: "", updated_at: null },
      { id: "2", occurrence_id: "o", student_id: "b", status: "cancelled", created_at: "", updated_at: null },
    ];
    expect(countActive(rows).get("o")).toBe(1);
    expect(seatsLeft(2, 5)).toBe(0);
    expect(seatsLeft(null, 5)).toBeNull();
  });
  it("capacity: blank = no limit, 1–200 allowed", () => {
    expect(parseCapacity("")).toEqual({ ok: true, value: null });
    expect(parseCapacity("۱۲")).toEqual({ ok: true, value: 12 });
    expect(parseCapacity("0").ok).toBe(false);
  });
});

describe("attendance roster", () => {
  it("joins enrolled and reserved students once and attaches advance notices", () => {
    const roster = buildRoster({
      profiles: [p("a", "الف"), p("b", "ب"), p("c", "پ")],
      enrolledIds: ["a", "b"], reservedIds: ["b", "c"], classId: "t", date: "2026-11-19",
      absences: [{ id: "x", student_id: "a", class_id: "t", absence_date: "2026-11-19", description: null, created_at: "" }],
    });
    expect(roster.map((r) => r.profile.id)).toEqual(["a", "b", "c"]);
    expect(roster[0]?.notice).toBeDefined();
    expect(initialStatus(undefined, true)).toBe("prior_notice_absence");
    expect(initialStatus("present", true)).toBe("present");
  });
});

describe("extra attendance billing", () => {
  it("amount is quantity × teacher rate, rounded to whole toman", () => {
    expect(adjustmentAmount(1.5, 200_000)).toBe(300_000);
    expect(parseQuantity("۱٫۵")).toBe(1.5);
  });
  it("requires an explicit rate; blank teacher rates are allowed in settings", () => {
    const e = validateAdjustment({ student_id: "a", type: "overtime", quantity: "1", unit_rate: "", note: "" });
    expect(e.unit_rate).toBeDefined();
    expect(validateRates({ rate_extra_slot: "", rate_overtime_hour: "" })).toEqual({});
    expect(validateRates({ rate_extra_slot: "-5", rate_overtime_hour: "" }).rate_extra_slot).toBeDefined();
  });
});
