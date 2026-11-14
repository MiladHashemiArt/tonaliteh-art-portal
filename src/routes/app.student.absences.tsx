import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { sessionShortLabel } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import type { ClassSessionRow } from "@/lib/backend/types";
import { supabase } from "@/lib/backend/client";
import {
  friendlyError,
  myAbsencesQuery,
  myEnrollmentsQuery,
  qk,
  sessionsQuery,
} from "@/lib/backend/queries";
import { formatDateFa, formatRelativeFa, parseLocalDate, toIsoDate, toPersianDigits } from "@/lib/domain/persian";
import { normalizeWeekday, sortSessions } from "@/lib/domain/schedule";

export const Route = createFileRoute("/app/student/absences")({
  head: () => ({ meta: [{ title: "اعلام غیبت | تنالیته" }] }),
  component: AbsencesPage,
});

function occursOnDate(session: ClassSessionRow, isoDate: string) {
  const date = parseLocalDate(isoDate);
  if (normalizeWeekday(session.class_day) !== date.getDay()) return false;
  const weeks = session.recurrence_weeks ?? 1;
  if (weeks <= 0) return session.session_date === isoDate;
  if (weeks === 1) return !session.session_date || session.session_date === isoDate;
  if (!session.recurrence_anchor_date) return false;
  const anchor = parseLocalDate(session.recurrence_anchor_date);
  anchor.setDate(anchor.getDate() + (date.getDay() - anchor.getDay()));
  const diffDays = Math.round((date.getTime() - anchor.getTime()) / 86_400_000);
  if (diffDays < 0) return false;
  const diffWeeks = Math.round(diffDays / 7);
  return ((diffWeeks % weeks) + weeks) % weeks === 0;
}

function AbsencesPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const absences = useQuery(myAbsencesQuery(user.id));
  const sessions = useQuery(sessionsQuery());
  const closures = useQuery({
    queryKey: ["class_session_closures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_closures")
        .select("scope,class_session_id,start_date,end_date")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(toIsoDate(new Date()));
  const [classIds, setClassIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const enrolledIds = useMemo(
    () => new Set((enrollments.data ?? []).map((enrollment) => String(enrollment.class_id))),
    [enrollments.data],
  );
  const enrolledSessions = useMemo(
    () => sortSessions((sessions.data ?? []).filter((session) => enrolledIds.has(String(session.id)))),
    [sessions.data, enrolledIds],
  );
  const selectedSessions = enrolledSessions.filter((session) => classIds.includes(String(session.id)));
  const rangeDates = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (totalDays > 180) return [];
    return Array.from({ length: totalDays }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return toIsoDate(date);
    });
  }, [startDate, endDate]);
  const plannedRows = rangeDates.flatMap((date) =>
    selectedSessions
      .filter((session) => occursOnDate(session, date))
      .filter((session) => !(closures.data ?? []).some(closure =>
        date >= closure.start_date && date <= closure.end_date &&
        (closure.scope !== "session" || closure.class_session_id === session.id)
      ))
      .map((session) => ({ student_id: user.id, absence_date: date, class_id: session.id, description: description.trim() || null })),
  );
  const needsAnchor = selectedSessions.some(
    (session) => (session.recurrence_weeks ?? 1) > 1 && !session.recurrence_anchor_date,
  );
  const existingKeys = new Set(
    (absences.data ?? []).map((absence) => `${absence.absence_date}:${absence.class_id ?? ""}`),
  );
  const newRows = plannedRows.filter((row) => !existingKeys.has(`${row.absence_date}:${row.class_id}`));

  const optionsById = new Map(enrolledSessions.map((session) => [String(session.id), session]));

  const submit = useMutation({
    mutationFn: async () => {
      if (!startDate || !endDate || endDate < startDate) throw new Error("بازهٔ تاریخ را درست انتخاب کنید.");
      if (!rangeDates.length) throw new Error("بازهٔ غیبت نمی‌تواند بیشتر از ۱۸۰ روز باشد.");
      if (!classIds.length) throw new Error("دست‌کم یک جلسه را انتخاب کنید.");
      if (needsAnchor) throw new Error("این کلاس قدیمیِ یک هفته در میان هنوز تاریخ شروع چرخه ندارد؛ از استاد بخواهید برنامه را اصلاح کند.");
      if (!newRows.length) throw new Error("برای انتخاب‌های شما جلسهٔ جدیدی برای ثبت غیبت پیدا نشد یا همه موارد قبلاً ثبت شده‌اند.");
      if (!plannedRows.length) throw new Error("در این بازه، جلسه‌ای از کلاس‌های انتخاب‌شده برگزار نمی‌شود. تاریخ‌ها یا کلاس‌ها را بررسی کنید.");
      const { error } = await supabase.from("absences").insert(newRows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`غیبت ${toPersianDigits(newRows.length)} جلسه ثبت و به استاد و مدیریت اطلاع داده شد.`);
      setDescription("");
      setClassIds([]);
      setStartDate(toIsoDate(new Date()));
      setEndDate(toIsoDate(new Date()));
      queryClient.invalidateQueries({ queryKey: qk.myAbsences(user.id) });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const toggleClass = (id: string) =>
    setClassIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="غیبت"
        title="اعلام غیبت"
        description="می‌توانید چند جلسه را در یک بازهٔ چندروزه یا چندماهه انتخاب کنید و فقط یک بار گزارش بفرستید."
      />
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Section title="فرم اعلام غیبت">
          <form
            className="surface min-w-0 space-y-5 overflow-hidden p-5"
            onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}
          >
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="abs-start">از تاریخ</Label>
                <JalaliDatePicker id="abs-start" value={startDate} onChange={setStartDate} label="تاریخ شروع غیبت" />
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor="abs-end">تا تاریخ</Label>
                <JalaliDatePicker id="abs-end" value={endDate} onChange={setEndDate} label="تاریخ پایان غیبت" />
              </div>
              <p className="text-xs leading-6 text-muted-foreground sm:col-span-2">
                برای یک جلسه، تاریخ شروع و پایان را یکسان بگذارید. برای مرخصی چندروزه یا چندماهه، بازه را مشخص کنید؛ سامانه فقط جلسات انتخاب‌شده را در روزهای برگزاری‌شان ثبت می‌کند.
              </p>
            </div>

            <div className="space-y-2">
              <Label>جلسه‌هایی که از دست می‌دهید</Label>
              {enrollments.isPending || sessions.isPending || closures.isPending ? (
                <LoadingRows rows={2} />
              ) : enrollments.error || sessions.error || closures.error ? (
                <ErrorState error={enrollments.error ?? sessions.error ?? closures.error} onRetry={() => { void enrollments.refetch(); void sessions.refetch(); void closures.refetch(); }} />
              ) : enrolledSessions.length === 0 ? (
                <EmptyState title="جلسه‌ای برای انتخاب پیدا نشد" description="ابتدا باید در برنامهٔ کلاس‌ها ثبت‌نام کرده باشید." />
              ) : (
                <div className="space-y-2">
                  {enrolledSessions.map((session) => {
                    const id = String(session.id);
                    const checked = classIds.includes(id);
                    const blocked = (session.recurrence_weeks ?? 1) > 1 && !session.recurrence_anchor_date;
                    return (
                      <label key={id} className={`flex items-start gap-3 rounded-lg border p-3 ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-bronze/50"}`}>
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--color-bronze)]" checked={checked} disabled={blocked} onChange={() => toggleClass(id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{sessionShortLabel(session)}</span>
                          {blocked && <span className="mt-1 block text-xs text-muted-foreground">در انتظار تعیین تاریخ شروع دوره توسط استاد</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {needsAnchor && <p className="text-xs text-destructive">برای جلسات یک هفته در میان، ابتدا باید تاریخ شروع دوره در پنل مدیریت کلاس‌ها تعیین شود.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="abs-desc">توضیح (اختیاری)</Label>
              <Textarea id="abs-desc" maxLength={800} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="مثلاً به دلیل سفر تا هفته آینده در کلاس حاضر نیستم." />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
              {toPersianDigits(plannedRows.length)} جلسه در این بازه برای ثبت آماده است.
              {startDate && endDate && endDate < startDate && " تاریخ پایان باید بعد از تاریخ شروع باشد."}
              {startDate && endDate && rangeDates.length === 0 && endDate >= startDate && " بازهٔ انتخابی نمی‌تواند بیشتر از ۱۸۰ روز باشد."}
            </div>
            <Button type="submit" className="w-full" disabled={submit.isPending || enrollments.isPending || sessions.isPending || closures.isPending}>
              {submit.isPending ? "در حال ثبت…" : "ثبت همه غیبت‌ها"}
            </Button>
          </form>
        </Section>

        <Section title="غیبت‌های ثبت‌شده">
          {absences.isPending ? (
            <LoadingRows />
          ) : absences.error ? (
            <ErrorState error={absences.error} onRetry={() => absences.refetch()} />
          ) : !absences.data?.length ? (
            <EmptyState title="غیبتی ثبت نکرده‌اید" />
          ) : (
            <ul className="space-y-3">
              {absences.data.map((absence) => {
                const session = absence.class_id ? optionsById.get(String(absence.class_id)) : undefined;
                return (
                  <li key={String(absence.id)} className="surface p-4">
                    <p className="font-display font-semibold">{formatDateFa(absence.absence_date, true)}</p>
                    {session && <p className="mt-0.5 text-sm text-muted-foreground">{sessionShortLabel(session)}</p>}
                    {absence.description && <p className="mt-2 text-sm leading-7">{absence.description}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">ثبت‌شده {formatRelativeFa(absence.created_at)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
