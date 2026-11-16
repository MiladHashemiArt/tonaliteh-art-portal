import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, myEnrollmentsQuery, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionOccurrenceRow, ClassSessionReservationRow } from "@/lib/backend/types";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { sessionTitle } from "@/lib/domain/schedule";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/bookings")({
  head: () => ({ meta: [{ title: "رزرو جلسات | تنالیته" }] }),
  component: StudentBookingsPage,
});

function localDateIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function StudentBookingsPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const occurrences = useQuery({
    queryKey: ["session-occurrences", "open"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_session_occurrences")
        .select("*")
        .eq("is_open", true)
        .eq("is_cancelled", false)
        .order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
    refetchInterval: 60000,
  });
  const mine = useQuery({
    queryKey: ["session-reservations", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_session_reservations")
        .select("*")
        .eq("student_id", user.id);
      if (error) throw error;
      return (data ?? []) as ClassSessionReservationRow[];
    },
  });
  const enrollIds = useMemo(
    () => new Set((enrollments.data ?? []).map((e) => e.class_id)),
    [enrollments.data],
  );
  const sessionMap = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.id, s])),
    [sessions.data],
  );
  const mineMap = useMemo(
    () => new Map((mine.data ?? []).map((r) => [r.occurrence_id, r])),
    [mine.data],
  );
  const oneOffEnabled = true;
  const book = useMutation({
    mutationFn: async (occurrence: ClassSessionOccurrenceRow) => {
      if (occurrence.session_date < localDateIso())
        throw new Error("امکان رزرو جلسهٔ گذشته وجود ندارد.");
      const { error } = await supabase.rpc("tonaliteh_reserve_occurrence", {
        _occurrence_id: occurrence.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("رزرو شما ثبت شد.");
      await qc.invalidateQueries({ queryKey: ["session-reservations", user.id] });
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const cancel = useMutation({
    mutationFn: async (occurrenceId: string) => {
      const { error } = await supabase.rpc("tonaliteh_cancel_reservation", {
        _occurrence_id: occurrenceId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("رزرو لغو شد.");
      await qc.invalidateQueries({ queryKey: ["session-reservations", user.id] });
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const loading =
    sessions.isPending || enrollments.isPending || occurrences.isPending || mine.isPending;
  const error = sessions.error ?? enrollments.error ?? occurrences.error ?? mine.error;
  const today = localDateIso();
  const available = (occurrences.data ?? []).filter(
    (o) => enrollIds.has(o.class_session_id) && o.session_date >= today,
  );
  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="حضور در جلسات"
        title="رزرو جلسات موردی"
        description="جلسه‌های اعلام‌شده از سوی استاد را ببینید و فقط در کلاس‌هایی که ثبت‌نام کرده‌اید جا رزرو کنید."
      />
      {!loading && !error && !oneOffEnabled ? (
        <EmptyState
          title="ثبت‌نام در جلسات ویژه فعلاً غیرفعال است"
          description="در حال حاضر امکان ثبت‌نام در این جلسات فراهم نیست. برای اطلاع از زمان فعال‌سازی، با استاد هماهنگ کنید."
        />
      ) : loading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void occurrences.refetch();
            void mine.refetch();
          }}
        />
      ) : available.length === 0 ? (
        <EmptyState
          title="جلسهٔ بازی برای رزرو وجود ندارد"
          description="وقتی استاد جلسه‌ای را منتشر کند، اینجا نمایش داده می‌شود."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {available.map((o) => {
            const session = sessionMap.get(o.class_session_id);
            const reservation = mineMap.get(o.id);
            const booked = o.booked_count ?? 0;
            const capacity = o.capacity ?? 0;
            const full = booked >= capacity;
            const active = reservation?.status === "reserved" || reservation?.status === "booked";
            return (
              <article key={o.id} className="surface space-y-3 p-4">
                <div>
                  <h2 className="font-semibold">
                    {session ? sessionTitle(session) : "جلسهٔ آموزشی"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDateFa(o.session_date, true)} ·{" "}
                    {session ? sessionTimeRange(session) : ""}
                  </p>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>ظرفیت باقی‌مانده</span>
                  <strong>{toPersianDigits(Math.max(0, capacity - booked))} نفر</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-bronze"
                    style={{ width: Math.min(100, (booked / Math.max(1, capacity)) * 100) + "%" }}
                  />
                </div>
                {active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(o.id)}
                  >
                    لغو رزرو من
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!oneOffEnabled || full || book.isPending}
                    onClick={() => book.mutate(o)}
                  >
                    {full ? "ظرفیت تکمیل است" : "رزرو حضور"}
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
