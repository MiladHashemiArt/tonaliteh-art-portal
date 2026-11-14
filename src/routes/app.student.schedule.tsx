import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { SessionMeta, sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, myEnrollmentsQuery, qk, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionOccurrenceRow, ClassSessionReservationRow, ClassSessionRow } from "@/lib/backend/types";
import { formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";
import {
  diffEnrollments,
  normalizeWeekday,
  sessionTitle,
  sortSessions,
  weekdayLabel,
} from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/student/schedule")({
  head: () => ({ meta: [{ title: "برنامهٔ کلاس‌ها | تنالیته" }] }),
  component: SchedulePage,
});

function groupByDay(sessions: ClassSessionRow[]) {
  const groups: { key: string; label: string; items: ClassSessionRow[] }[] = [];
  for (const s of sortSessions(sessions)) {
    const key = String(normalizeWeekday(s.class_day) ?? s.class_day);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: weekdayLabel(s.class_day), items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups;
}

function SchedulePage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const reservationEnd = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 45);
    return toIsoDate(end);
  }, []);
  const occurrences = useQuery({
    queryKey: ["class_session_occurrences", "student", reservationEnd],
    queryFn: async (): Promise<ClassSessionOccurrenceRow[]> => {
      const { data, error } = await supabase.from("class_session_occurrences")
        .select("*").eq("is_open", true).gte("session_date", toIsoDate(new Date()))
        .lte("session_date", reservationEnd).order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
  });
  const reservations = useQuery({
    queryKey: ["class_session_reservations", "student", user.id],
    queryFn: async (): Promise<ClassSessionReservationRow[]> => {
      const { data, error } = await supabase.from("class_session_reservations")
        .select("*").eq("student_id", user.id);
      if (error) throw error;
      return (data ?? []) as ClassSessionReservationRow[];
    },
  });
  const bookingCounts = useQuery({
    queryKey: ["class_session_booking_counts", reservationEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_open_class_session_booking_counts", {
        _from: toIsoDate(new Date()),
        _to: reservationEnd,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const bookingMutation = useMutation({
    mutationFn: async ({ occurrenceId, cancel }: { occurrenceId: string; cancel: boolean }) => {
      if (cancel) {
        const { error } = await supabase.from("class_session_reservations")
          .update({ status: "cancelled" }).eq("occurrence_id", occurrenceId)
          .eq("student_id", user.id).eq("status", "booked");
        if (error) throw error;
      } else {
        const { error } = await supabase.from("class_session_reservations")
          .upsert({ occurrence_id: occurrenceId, student_id: user.id, status: "booked" },
            { onConflict: "occurrence_id,student_id" });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("وضعیت رزرو شما به‌روزرسانی شد.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class_session_reservations", "student", user.id] }),
        queryClient.invalidateQueries({ queryKey: ["class_session_occurrences"] }),
        queryClient.invalidateQueries({ queryKey: ["class_session_booking_counts"] }),
      ]);
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const current = useMemo(
    () => (enrollments.data ?? []).map((e) => String(e.class_id)),
    [enrollments.data],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setSelected(new Set(current)), [current]);

  const { toAdd, toRemove } = diffEnrollments(current, [...selected]);
  const dirty = toAdd.length + toRemove.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (toAdd.length) {
        // Upsert with ignoreDuplicates relies on the unique (student_id, class_id) constraint.
        const { error } = await supabase.from("enrollments").upsert(
          toAdd.map((class_id) => ({ student_id: user.id, class_id })),
          { onConflict: "student_id,class_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("enrollments")
          .delete()
          .eq("student_id", user.id)
          .in("class_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success("انتخاب کلاس‌ها ذخیره شد."),
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.myEnrollments(user.id) }),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const loading = sessions.isPending || enrollments.isPending;
  const error = sessions.error ?? enrollments.error;
  const groups = groupByDay(sessions.data ?? []);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="برنامهٔ هفتگی"
        title="انتخاب کلاس‌ها"
        description="هر تعداد جلسه که می‌خواهید علامت بزنید و سپس ذخیره کنید. کلاس پنجشنبه یک هفته در میان برگزار می‌شود."
      />


      <section className="space-y-3" aria-labelledby="weekly-bookings">
        <div>
          <h2 id="weekly-bookings" className="text-lg font-semibold">رزرو جلسات اعلام‌شده</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            فقط جلسه‌هایی نمایش داده می‌شوند که استاد برای تاریخ مشخص باز کرده است.
          </p>
        </div>
        {occurrences.isPending || reservations.isPending || bookingCounts.isPending ? <LoadingRows rows={3} />
          : occurrences.error || reservations.error || bookingCounts.error
            ? <ErrorState error={occurrences.error ?? reservations.error ?? bookingCounts.error}
                onRetry={() => { void occurrences.refetch(); void reservations.refetch(); void bookingCounts.refetch(); }} />
            : (occurrences.data ?? []).filter((occurrence) => current.includes(occurrence.class_session_id)).length === 0
              ? <EmptyState title="فعلاً جلسه‌ای برای رزرو اعلام نشده است" description="پس از انتشار جلسه توسط استاد، امکان رزرو در همین بخش نمایش داده می‌شود." />
              : <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {(occurrences.data ?? []).filter((occurrence) => current.includes(occurrence.class_session_id)).map((occurrence) => {
                  const session = (sessions.data ?? []).find((item) => item.id === occurrence.class_session_id);
                  const mine = (reservations.data ?? []).find((item) => item.occurrence_id === occurrence.id);
                  const bookedCount = bookingCounts.data?.find((item) => item.occurrence_id === occurrence.id)?.booked_count ?? 0;
                  const isBooked = mine?.status === "booked";
                  const full = bookedCount >= occurrence.capacity && !isBooked;
                  return <li key={occurrence.id} className="surface space-y-3 p-4">
                    <div>
                      <p className="font-semibold">{session ? sessionTitle(session) : "جلسه هنری"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateFa(occurrence.session_date, true)} · {session ? sessionTimeRange(session) : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        ظرفیت باقی‌مانده: {toPersianDigits(Math.max(0, occurrence.capacity - bookedCount))} نفر
                      </p>
                    </div>
                    {isBooked
                      ? <Button size="sm" variant="outline" disabled={bookingMutation.isPending}
                          onClick={() => bookingMutation.mutate({ occurrenceId: occurrence.id, cancel: true })}>لغو رزرو من</Button>
                      : <Button size="sm" disabled={full || bookingMutation.isPending}
                          onClick={() => bookingMutation.mutate({ occurrenceId: occurrence.id, cancel: false })}>
                          {full ? "ظرفیت تکمیل است" : "رزرو این جلسه"}
                        </Button>}
                  </li>;
                })}
              </ul>}
      </section>
      {loading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            sessions.refetch();
            enrollments.refetch();
          }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="هنوز کلاسی تعریف نشده است"
          description="برنامهٔ کلاس‌ها به‌زودی منتشر می‌شود."
        />
      ) : (
        <div className="min-w-0 max-w-full space-y-8 overflow-hidden">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`day-${g.key}`} className="min-w-0 max-w-full overflow-hidden">
              <h2 id={`day-${g.key}`} className="mb-3 text-lg font-semibold">
                {g.label}
              </h2>
              <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {g.items.map((s) => {
                  const id = String(s.id);
                  const on = selected.has(id);
                  const inactive = s.is_active === false;
                  const disabled = inactive && !current.includes(id);
                  return (
                    <li key={id} className="min-w-0 max-w-full overflow-hidden">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => toggle(id)}
                        className={cn(
                          "surface flex w-full min-w-0 max-w-full items-start gap-3 overflow-hidden p-3 text-start transition-all sm:gap-4 sm:p-4",
                          on ? "border-bronze ring-2 ring-bronze/25" : "hover:border-bronze/50",
                          disabled && "cursor-not-allowed opacity-55",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                            on
                              ? "border-bronze bg-bronze text-primary-foreground"
                              : "border-input bg-card",
                          )}
                          aria-hidden
                        >
                          {on && <Check className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="block break-words font-display font-semibold">
                            {sessionTitle(s)}
                          </span>
                          <span className="block break-words text-sm text-muted-foreground">
                            {sessionTimeRange(s)}
                          </span>
                          <SessionMeta session={s} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="sticky bottom-20 z-20 mt-8 lg:bottom-6">
        <div className="surface flex flex-wrap items-center justify-between gap-3 p-3 shadow-lift">
          <p className="ps-2 text-sm text-muted-foreground" aria-live="polite">
            {toPersianDigits(selected.size)} جلسه انتخاب شده
            {dirty && " · تغییرات ذخیره نشده"}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setSelected(new Set(current))}>
                انصراف
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "در حال ذخیره…" : "ذخیرهٔ انتخاب"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
