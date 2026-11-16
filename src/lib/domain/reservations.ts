import type { OccurrenceRow, ReservationRow } from "@/lib/backend/types";

/** Stored reservation states accepted by the live database constraint. */
export const RESERVATION_ACTIVE = "booked";
export const RESERVATION_CANCELLED = "cancelled";

export function isActiveReservation(r: Pick<ReservationRow, "status">): boolean {
  return !/cancel|reject|declin|لغو/i.test(r.status ?? "");
}

export type OccurrenceState = "draft" | "open" | "closed" | "cancelled" | "past";

export const OCCURRENCE_STATE_LABEL: Record<OccurrenceState, string> = {
  draft: "منتشر نشده",
  open: "باز برای رزرو",
  closed: "رزرو بسته",
  cancelled: "لغو شده",
  past: "برگزار شده",
};

/** `occurrence` is undefined when staff have not created the dated row yet. */
export function occurrenceState(
  occurrence: Pick<OccurrenceRow, "published_at" | "is_open" | "is_cancelled" | "session_date"> | undefined,
  todayIso: string,
): OccurrenceState {
  if (!occurrence) return "draft";
  if (occurrence.is_cancelled) return "cancelled";
  if (occurrence.session_date < todayIso) return "past";
  if (!occurrence.published_at) return "draft";
  return occurrence.is_open ? "open" : "closed";
}

/** Places left, or null when the occurrence has no capacity limit. Never negative. */
export function seatsLeft(capacity: number | null | undefined, booked: number): number | null {
  if (capacity === null || capacity === undefined) return null;
  return Math.max(0, capacity - booked);
}

/** Active reservations per occurrence id. */
export function countActive(reservations: ReservationRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of reservations) {
    if (!isActiveReservation(r)) continue;
    const id = String(r.occurrence_id);
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * Why a student may not reserve right now, or null if they may.
 * `booked` excludes the student's own active reservation.
 */
export function reserveBlocker(input: {
  occurrence: OccurrenceRow;
  todayIso: string;
  booked: number;
  alreadyReserved: boolean;
}): string | null {
  const { occurrence, todayIso, booked, alreadyReserved } = input;
  if (alreadyReserved) return "این جلسه را قبلاً رزرو کرده‌اید.";
  const state = occurrenceState(occurrence, todayIso);
  if (state === "cancelled") return "این جلسه لغو شده است.";
  if (state === "past") return "تاریخ این جلسه گذشته است.";
  if (state === "draft") return "این جلسه هنوز برای رزرو منتشر نشده است.";
  if (state === "closed") return "رزرو این جلسه بسته شده است.";
  if (seatsLeft(occurrence.capacity, booked) === 0) return "ظرفیت این جلسه تکمیل شده است.";
  return null;
}

/** Students may cancel their own active reservation until the day of the session. */
export function canCancelReservation(
  occurrence: Pick<OccurrenceRow, "session_date">,
  todayIso: string,
): boolean {
  return occurrence.session_date >= todayIso;
}

/** Capacity typed by staff: empty = no limit; otherwise a whole number from 1 to 200. */
export function parseCapacity(input: string): { ok: true; value: number | null } | { ok: false } {
  const raw = input.trim().replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!raw) return { ok: true, value: null };
  if (!/^\d+$/.test(raw)) return { ok: false };
  const n = Number(raw);
  return n >= 1 && n <= 200 ? { ok: true, value: n } : { ok: false };
}
