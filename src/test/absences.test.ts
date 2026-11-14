import { describe, expect, it } from "vitest";

import type { ClassSessionOccurrenceRow, ClassSessionRow } from "@/lib/backend/types";
import { buildAbsenceRows } from "@/lib/domain/absences";

const session = (id: string, day: string, weeks = 1, anchor: string | null = null): ClassSessionRow => ({
  id, class_day: day, start_time: "09:00:00", end_time: "12:00:00",
  class_type: "طراحی", session_date: null, is_active: true,
  recurrence_weeks: weeks, recurrence_anchor_date: anchor,
});

const occurrence = (id: string, sessionId: string, date: string, cancelled = false) => ({
  id, class_session_id: sessionId, session_date: date, is_open: true,
  is_cancelled: cancelled, capacity: 12, booked_count: 0, published_by: "teacher",
  published_at: date + "T08:00:00Z", created_at: date + "T08:00:00Z",
  updated_at: date + "T08:00:00Z",
}) as ClassSessionOccurrenceRow;

describe("multi-session absence planning", () => {
  it("creates notices for multiple selected weekly days and slots", () => {
    const rows = buildAbsenceRows({
      studentId: "student-1",
      rangeDates: ["2026-11-17", "2026-11-20"],
      sessions: [
        session("tue-1", "سه‌شنبه"),
        session("tue-2", "سه‌شنبه"),
        session("tue-3", "سه‌شنبه"),
        session("fri-1", "جمعه"),
      ],
      selectedSessionIds: ["tue-1", "tue-2", "tue-3", "fri-1"],
      occurrences: [], selectedOccurrenceIds: [], description: " سفر ",
    });
    expect(rows).toEqual([
      { student_id: "student-1", absence_date: "2026-11-17", class_id: "tue-1", description: "سفر" },
      { student_id: "student-1", absence_date: "2026-11-17", class_id: "tue-2", description: "سفر" },
      { student_id: "student-1", absence_date: "2026-11-17", class_id: "tue-3", description: "سفر" },
      { student_id: "student-1", absence_date: "2026-11-20", class_id: "fri-1", description: "سفر" },
    ]);
  });

  it("supports a Thursday-only selection from a teacher-published occurrence", () => {
    const rows = buildAbsenceRows({
      studentId: "student-1", rangeDates: [],
      sessions: [session("thu-1", "پنجشنبه", 1, null)],
      selectedSessionIds: [],
      occurrences: [occurrence("occ-1", "thu-1", "2026-11-19")],
      selectedOccurrenceIds: ["occ-1"], description: "",
    });
    expect(rows).toEqual([
      { student_id: "student-1", absence_date: "2026-11-19", class_id: "thu-1", description: null },
    ]);
  });

  it("ignores unselected and cancelled Thursday occurrences", () => {
    const rows = buildAbsenceRows({
      studentId: "student-1", rangeDates: [], sessions: [],
      selectedSessionIds: [],
      occurrences: [
        occurrence("occ-1", "thu-1", "2026-11-19"),
        occurrence("occ-2", "thu-2", "2026-11-26", true),
      ],
      selectedOccurrenceIds: ["occ-1", "occ-2"], description: "",
    });
    expect(rows.map(row => row.class_id)).toEqual(["thu-1"]);
  });

  it("does not generate off-week sessions in an alternating schedule", () => {
    const rows = buildAbsenceRows({
      studentId: "student-1",
      rangeDates: ["2026-11-17", "2026-11-24"],
      sessions: [session("alternate", "سه‌شنبه", 2, "2026-11-17")],
      selectedSessionIds: ["alternate"],
      occurrences: [], selectedOccurrenceIds: [], description: "",
    });
    expect(rows.map(row => row.absence_date)).toEqual(["2026-11-17"]);
  });
});
