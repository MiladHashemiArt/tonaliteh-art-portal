import { queryOptions } from "@tanstack/react-query";

import { RESERVATION_ACTIVE, RESERVATION_CANCELLED, reserveBlocker } from "@/lib/domain/reservations";
import { todayIsoTehran } from "@/lib/domain/persian";

import { supabase } from "./client";
import { permissionDenied } from "./errors";
import type { AttendanceAdjustmentRow, OccurrenceRow, ReservationRow } from "./types";

export const OCCURRENCE_COLUMNS =
  "id, class_session_id, session_date, published_at, published_by, is_open, is_cancelled, capacity, booked_count, created_at, updated_at";
export const RESERVATION_COLUMNS = "id, occurrence_id, student_id, status, created_at, updated_at";
export const ADJUSTMENT_COLUMNS =
  "id, student_id, class_id, session_date, adjustment_type, unit_rate, amount, description, payment_id, attendance_id, recorded_by, created_at";

export const sessionKeys = {
  occurrences: (from: string, to: string) => ["occurrences", from, to] as const,
  occurrence: (classId: string, date: string) => ["occurrences", "one", classId, date] as const,
  reservationsFor: (ids: string[]) => ["reservations", "for", ...ids] as const,
  myReservations: (userId: string) => ["reservations", "mine", userId] as const,
  adjustments: (classId: string, date: string) => ["attendance_adjustments", classId, date] as const,
};

/** Dated sessions in a range. RLS decides which rows the caller sees. */
export const occurrencesQuery = (fromIso: string, toIso: string) =>
  queryOptions({
    queryKey: sessionKeys.occurrences(fromIso, toIso),
    queryFn: async (): Promise<OccurrenceRow[]> => {
      const { data, error } = await supabase
        .from("class_session_occurrences")
        .select(OCCURRENCE_COLUMNS)
        .gte("session_date", fromIso)
        .lte("session_date", toIso)
        .order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OccurrenceRow[];
    },
  });

export const occurrenceForQuery = (classId: string, date: string) =>
  queryOptions({
    queryKey: sessionKeys.occurrence(classId, date),
    enabled: Boolean(classId && date),
    queryFn: async (): Promise<OccurrenceRow | null> => {
      const { data, error } = await supabase
        .from("class_session_occurrences")
        .select(OCCURRENCE_COLUMNS)
        .eq("class_session_id", classId)
        .eq("session_date", date)
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as OccurrenceRow | undefined) ?? null;
    },
  });

/** Reservations for the given occurrences (staff see all; students see what RLS allows). */
export const reservationsForQuery = (occurrenceIds: string[]) =>
  queryOptions({
    queryKey: sessionKeys.reservationsFor(occurrenceIds),
    enabled: occurrenceIds.length > 0,
    queryFn: async (): Promise<ReservationRow[]> => {
      const { data, error } = await supabase
        .from("class_session_reservations")
        .select(RESERVATION_COLUMNS)
        .in("occurrence_id", occurrenceIds);
      if (error) throw error;
      return (data ?? []) as ReservationRow[];
    },
  });

export const myReservationsQuery = (userId: string) =>
  queryOptions({
    queryKey: sessionKeys.myReservations(userId),
    queryFn: async (): Promise<ReservationRow[]> => {
      const { data, error } = await supabase
        .from("class_session_reservations")
        .select(RESERVATION_COLUMNS)
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ReservationRow[];
    },
  });

export const adjustmentsQuery = (classId: string, date: string) =>
  queryOptions({
    queryKey: sessionKeys.adjustments(classId, date),
    enabled: Boolean(classId && date),
    queryFn: async (): Promise<AttendanceAdjustmentRow[]> => {
      const { data, error } = await supabase
        .from("attendance_adjustments")
        .select(ADJUSTMENT_COLUMNS)
        .eq("class_id", classId)
        .eq("session_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendanceAdjustmentRow[];
    },
  });

// ---------------------------------------------------------------------------
// Staff: publish / open / close / cancel dated sessions
// ---------------------------------------------------------------------------

/** Create or re-publish the dated row for one class meeting and open it for reservations. */
export async function publishOccurrence(input: {
  userId: string;
  classId: string;
  date: string;
  capacity: number | null;
  existingId?: string | undefined;
}) {
  const values = {
    published_at: new Date().toISOString(),
    published_by: input.userId,
    is_open: true,
    is_cancelled: false,
    capacity: input.capacity,
  };
  const query = input.existingId
    ? supabase.from("class_session_occurrences").update(values).eq("id", input.existingId)
    : supabase
        .from("class_session_occurrences")
        .insert({ class_session_id: input.classId, session_date: input.date, ...values });
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

export async function updateOccurrence(
  id: string,
  values: Partial<Pick<OccurrenceRow, "is_open" | "is_cancelled" | "capacity">>,
) {
  const { data, error } = await supabase
    .from("class_session_occurrences")
    .update(values)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

// ---------------------------------------------------------------------------
// Students: reserve / cancel their own place
// ---------------------------------------------------------------------------

/** The secure database function is not installed yet (docs/setup/005). */
function rpcMissing(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/**
 * Prefers the locking database function (no double booking, no over-capacity even under
 * concurrent requests). Until the owner installs it, falls back to a checked direct write
 * that the table's own policies still gate.
 */
export async function reserveOccurrence(userId: string, occurrenceId: string) {
  const rpc = await supabase.rpc("tonaliteh_reserve_occurrence", { _occurrence_id: occurrenceId });
  if (!rpc.error) return;
  if (!rpcMissing(rpc.error)) throw rpc.error;

  const [{ data: occ, error: occError }, { data: mine, error: mineError }] = await Promise.all([
    supabase.from("class_session_occurrences").select(OCCURRENCE_COLUMNS).eq("id", occurrenceId).limit(1),
    supabase
      .from("class_session_reservations")
      .select(RESERVATION_COLUMNS)
      .eq("occurrence_id", occurrenceId)
      .eq("student_id", userId),
  ]);
  if (occError) throw occError;
  if (mineError) throw mineError;
  const occurrence = (occ ?? [])[0] as OccurrenceRow | undefined;
  if (!occurrence) throw new Error("این جلسه پیدا نشد.");
  const own = (mine ?? []) as ReservationRow[];
  const active = own.find((r) => !/cancel|reject|declin|لغو/i.test(r.status ?? ""));
  const blocker = reserveBlocker({
    occurrence,
    todayIso: todayIsoTehran(),
    booked: Math.max(0, (occurrence.booked_count ?? 0) - (active ? 1 : 0)),
    alreadyReserved: Boolean(active),
  });
  if (blocker) throw new Error(blocker);

  const previous = own[0];
  const { data, error } = previous
    ? await supabase
        .from("class_session_reservations")
        .update({ status: RESERVATION_ACTIVE })
        .eq("id", previous.id)
        .eq("student_id", userId)
        .select("id")
    : await supabase
        .from("class_session_reservations")
        .insert({ occurrence_id: occurrenceId, student_id: userId, status: RESERVATION_ACTIVE })
        .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

export async function cancelReservation(userId: string, occurrenceId: string) {
  const rpc = await supabase.rpc("tonaliteh_cancel_reservation", { _occurrence_id: occurrenceId });
  if (!rpc.error) return;
  if (!rpcMissing(rpc.error)) throw rpc.error;

  const { data, error } = await supabase
    .from("class_session_reservations")
    .update({ status: RESERVATION_CANCELLED })
    .eq("occurrence_id", occurrenceId)
    .eq("student_id", userId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}

// ---------------------------------------------------------------------------
// Staff: extra billable attendance
// ---------------------------------------------------------------------------

export async function createAdjustment(
  row: Omit<AttendanceAdjustmentRow, "id" | "created_at" | "payment_id">,
): Promise<string> {
  const { data, error } = await supabase.from("attendance_adjustments").insert(row).select("id");
  if (error) throw error;
  const id = (data ?? [])[0]?.id;
  if (!id) throw permissionDenied();
  return String(id);
}

export async function linkAdjustmentPayment(adjustmentId: string, paymentId: string) {
  const { data, error } = await supabase
    .from("attendance_adjustments")
    .update({ payment_id: paymentId })
    .eq("id", adjustmentId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw permissionDenied();
}
