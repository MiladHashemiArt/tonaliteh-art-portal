import type { ClassSessionRow } from "@/lib/backend/types";

import { parseLocalDate } from "./persian";

/** Index follows JavaScript Date#getDay(): 0 = Sunday … 6 = Saturday. */
export const WEEKDAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** Persian week order, Saturday first. */
export const PERSIAN_WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  یکشنبه: 0,
  monday: 1,
  mon: 1,
  دوشنبه: 1,
  tuesday: 2,
  tue: 2,
  سهشنبه: 2,
  wednesday: 3,
  wed: 3,
  چهارشنبه: 3,
  thursday: 4,
  thu: 4,
  پنجشنبه: 4,
  friday: 5,
  fri: 5,
  جمعه: 5,
  saturday: 6,
  sat: 6,
  شنبه: 6,
};

export function normalizeWeekday(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value >= 0 && value <= 6 ? value : null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\u200c\s\-_]/g, "")
    .replace(/ي/g, "ی");
  if (/^[0-6]$/.test(key)) return Number(key);
  return NAME_TO_INDEX[key] ?? null;
}

export function weekdayLabel(value: string | number | null | undefined): string {
  const idx = normalizeWeekday(value);
  return idx === null ? String(value ?? "—") : (WEEKDAY_FA[idx] ?? "—");
}

export function recurrenceLabel(weeks: number | null | undefined): string {
  if (!weeks || weeks <= 1) return "هر هفته";
  if (weeks === 2) return "یک هفته در میان";
  return `هر ${weeks} هفته یک‌بار`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  // Round to absorb daylight-saving offsets.
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export type NextOccurrence =
  { kind: "date"; date: Date } | { kind: "needs-anchor" } | { kind: "staff-announced" } | { kind: "none" };

/**
 * Next date (from `from`, inclusive) on which the session meets.
 * - One-off sessions (session_date set, no recurrence) return that date if it is upcoming.
 * - Weekly sessions return the next matching weekday.
 * - Multi-week sessions need recurrence_anchor_date; the anchor marks a week that has class.
 */
export function nextOccurrence(session: ClassSessionRow, from: Date = new Date()): NextOccurrence {
  const today = startOfDay(from);
  const weeks = session.recurrence_weeks ?? 0;

  if (weeks <= 0) {
    if (!session.session_date) return { kind: "none" };
    const d = parseLocalDate(session.session_date);
    return daysBetween(today, d) >= 0 ? { kind: "date", date: d } : { kind: "none" };
  }

  const weekday = normalizeWeekday(session.class_day);
  if (weekday === 4) return { kind: "staff-announced" };
  if (weekday === null) return { kind: "none" };

  let candidate = new Date(today);
  candidate.setDate(candidate.getDate() + ((weekday - candidate.getDay() + 7) % 7));

  if (weeks === 1) return { kind: "date", date: candidate };

  if (!session.recurrence_anchor_date) return { kind: "needs-anchor" };
  const anchorRaw = parseLocalDate(session.recurrence_anchor_date);
  // Align the anchor to this session's weekday inside the anchor's week.
  const anchor = new Date(anchorRaw);
  anchor.setDate(anchor.getDate() + (weekday - anchor.getDay()));

  for (let i = 0; i < weeks; i++) {
    const diffWeeks = Math.round(daysBetween(anchor, candidate) / 7);
    if (((diffWeeks % weeks) + weeks) % weeks === 0) return { kind: "date", date: candidate };
    candidate = new Date(candidate);
    candidate.setDate(candidate.getDate() + 7);
  }
  return { kind: "none" };
}

export function sortSessions<T extends ClassSessionRow>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const da = PERSIAN_WEEK_ORDER.indexOf(normalizeWeekday(a.class_day) ?? 99);
    const db = PERSIAN_WEEK_ORDER.indexOf(normalizeWeekday(b.class_day) ?? 99);
    if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });
}

export function sessionTitle(s: ClassSessionRow): string {
  return s.class_type?.trim() || "کلاس";
}

/** Diff the desired selection against current enrollments. */
export function diffEnrollments(current: string[], desired: string[]) {
  const cur = new Set(current.map(String));
  const want = new Set(desired.map(String));
  return {
    toAdd: [...want].filter((id) => !cur.has(id)),
    toRemove: [...cur].filter((id) => !want.has(id)),
  };
}
