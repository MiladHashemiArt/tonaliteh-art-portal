import type { ClassSessionOccurrenceRow, ClassSessionRow } from "@/lib/backend/types";
import { normalizeWeekday } from "./schedule";
import { parseLocalDate } from "./persian";

export type AbsenceInsertRow = {
  student_id: string;
  absence_date: string;
  class_id: string;
  description: string | null;
};

function occursOnDate(session: ClassSessionRow, isoDate: string): boolean {
  const date = parseLocalDate(isoDate);
  const weekday = normalizeWeekday(session.class_day);
  if (weekday === 4 || weekday !== date.getDay()) return false;
  const weeks = session.recurrence_weeks ?? 1;
  if (weeks <= 1) return true;
  if (!session.recurrence_anchor_date) return false;
  const anchor = parseLocalDate(session.recurrence_anchor_date);
  anchor.setDate(anchor.getDate() + (date.getDay() - anchor.getDay()));
  const diffDays = Math.round((date.getTime() - anchor.getTime()) / 86_400_000);
  if (diffDays < 0) return false;
  const diffWeeks = Math.round(diffDays / 7);
  return ((diffWeeks % weeks) + weeks) % weeks === 0;
}

/** Build one absence notice for every selected weekly session/date and published Thursday occurrence. */
export function buildAbsenceRows(input: {
  studentId: string;
  rangeDates: string[];
  sessions: ClassSessionRow[];
  selectedSessionIds: string[];
  occurrences: ClassSessionOccurrenceRow[];
  selectedOccurrenceIds: string[];
  description: string;
}): AbsenceInsertRow[] {
  const selectedIds = new Set(input.selectedSessionIds);
  const selectedOccurrences = new Set(input.selectedOccurrenceIds);
  const note = input.description.trim() || null;
  const rows: AbsenceInsertRow[] = [];

  for (const date of input.rangeDates) {
    for (const session of input.sessions) {
      if (!selectedIds.has(session.id) || !occursOnDate(session, date)) continue;
      rows.push({ student_id: input.studentId, absence_date: date, class_id: session.id, description: note });
    }
  }

  for (const occurrence of input.occurrences) {
    if (!selectedOccurrences.has(occurrence.id) || occurrence.is_cancelled) continue;
    rows.push({
      student_id: input.studentId,
      absence_date: occurrence.session_date,
      class_id: occurrence.class_session_id,
      description: note,
    });
  }

  const unique = new Map<string, AbsenceInsertRow>();
  for (const row of rows) unique.set(`${row.absence_date}:${row.class_id}`, row);
  return [...unique.values()];
}
