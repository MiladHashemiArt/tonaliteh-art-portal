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
import type { ClassSessionOccurrenceRow, ClassSessionRow } from "@/lib/backend/types";
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
import { buildAbsenceRows } from "@/lib/domain/absences";

export const Route = createFileRoute("/app/student/absences")({
  head: () => ({ meta: [{ title: "اعلام غیبت | تنالیته" }] }),
  component: AbsencesPage,
});


function AbsencesPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const absences = useQuery(myAbsencesQuery(user.id));
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(toIsoDate(new Date()));
  const [classIds, setClassIds] = useState<string[]>([]);
  const [selectedOccurrenceIds, setSelectedOccurrenceIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const enrolledIds = useMemo(
    () => new Set((enrollments.data ?? []).map((enrollment) => String(enrollment.class_id))),
    [enrollments.data],
  );
  const enrolledSessions = useMemo(
    () => sortSessions((sessions.data ?? []).filter((session) => enrolledIds.has(String(session.id)))),
    [sessions.data, enrolledIds],
  );
  const thursdayIds = useMemo(
    () => enrolledSessions.filter((session) => normalizeWeekday(session.class_day) === 4).map((session) => String(session.id)),
    [enrolledSessions],
  );
  const publishedThursdayOccurrences = useQuery({
    queryKey: ["class_session_occurrences", "absence-options", startDate, endDate, thursdayIds],
    enabled: Boolean(startDate && endDate && endDate >= startDate && thursdayIds.length > 0),
    queryFn: async (): Promise<ClassSessionOccurrenceRow[]> => {
      const { data, error } = await supabase.from("class_session_occurrences")
        .select("*").in("class_session_id", thursdayIds)
        .gte("session_date", startDate).lte("session_date", endDate)
        .eq("is_cancelled", false).order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
  });
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
  const allPlannedRows = buildAbsenceRows({
    studentId: user.id,
    rangeDates,
    sessions: selectedSessions,
    selectedSessionIds: classIds,
    occurrences: publishedThursdayOccurrences.data ?? [],
    selectedOccurrenceIds,
    description,
  });
  const needsAnchor = selectedSessions.some(
    (session) => normalizeWeekday(session.class_day) !== 4 && (session.recurrence_weeks ?? 1) > 1 && !session.recurrence_anchor_date,
  );
  const existingKeys = new Set(
    (absences.data ?? []).map((absence) => `${absence.absence_date}:${absence.class_id ?? ""}`),
  );
  const newRows = allPlannedRows.filter((row) => !existingKeys.has(`${row.absence_date}:${row.class_id}`));

  const optionsById = new Map(enrolledSessions.map((session) => [String(session.id), session]));

  const submit = useMutation({
    mutationFn: async () => {
      if (!startDate || !endDate || endDate < startDate) throw new Error("بازهٔ تاریخ را درست انتخاب کنید.");
      if (!rangeDates.length) throw new Error("بازهٔ غیبت نمی‌تواند بیشتر از ۱۸۰ روز باشد.");
      if (!classIds.length && !selectedOccurrenceIds.length) throw new Error("دست‌کم یک سانس یا جلسهٔ اعلام‌شده را انتخاب کنید.");
      if (needsAnchor) throw new Error("برای جلسه یک هفته در میان، استاد باید ابتدا تاریخ شروع دوره را در مدیریت کلاس‌ها مشخص کند.");
      if (thursdayIds.length && publishedThursdayOccurrences.isPending) throw new Error("در حال دریافت جلسه‌های اعلام‌شدهٔ پنجشنبه هستیم؛ چند لحظه دیگر دوباره تلاش کنید.");
      if (publishedThursdayOccurrences.error) throw publishedThursdayOccurrences.error;
      if (!allPlannedRows.length) throw new Error("در این بازه، جلسه‌ای از کلاس‌های انتخاب‌شده برگزار نمی‌شود یا پنجشنبه‌ای توسط استاد اعلام نشده است.");
      const existing = absences.data ?? [];
      const existingKeys = new Set(existing.map((absence) => `${absence.absence_date}:${absence.class_id ?? ""}`));
      const newRows = allPlannedRows.filter((row) => !existingKeys.has(`${row.absence_date}:${row.class_id}`));
      if (!newRows.length) throw new Error("برای انتخاب‌های شما جلسهٔ جدیدی برای ثبت غیبت پیدا نشد یا همه موارد قبلاً ثبت شده‌اند.");
      const { error } = await supabase.from("absences").insert(newRows);
      if (error) throw error;
      return newRows.length;
    },
    onSuccess: (insertedCount) => {
      toast.success(`غیبت ${toPersianDigits(insertedCount)} جلسه ثبت و به استاد و مدیریت اطلاع داده شد.`);
      setDescription("");
      setClassIds([]);
      setSelectedOccurrenceIds([]);
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
        description="می‌توانید چند روز و چند سانس را هم‌زمان انتخاب کنید؛ برای پنجشنبه فقط جلسه‌هایی که استاد در تاریخ مشخص اعلام کرده باشد قابل انتخاب‌اند."
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
              <Label>روزها و سانس‌هایی که از دست می‌دهید (انتخاب چندگانه)</Label>
              {enrollments.isPending || sessions.isPending ? (
                <LoadingRows rows={2} />
              ) : enrollments.error || sessions.error ? (
                <ErrorState error={enrollments.error ?? sessions.error} onRetry={() => { void enrollments.refetch(); void sessions.refetch(); }} />
              ) : enrolledSessions.length === 0 ? (
                <EmptyState title="جلسه‌ای برای انتخاب پیدا نشد" description="ابتدا باید در برنامهٔ کلاس‌ها ثبت‌نام کرده باشید." />
              ) : (
                <div className="space-y-2">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setClassIds(enrolledSessions.filter((session) => normalizeWeekday(session.class_day) !== 4).map((session) => String(session.id)))}>انتخاب همهٔ سانس‌ها</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setClassIds([]); setSelectedOccurrenceIds([]); }}>پاک‌کردن انتخاب‌ها</Button>
                  </div>
                  {enrolledSessions.filter((session) => normalizeWeekday(session.class_day) !== 4).map((session) => {
                    const id = String(session.id);
                    const checked = classIds.includes(id);
                    const blocked = normalizeWeekday(session.class_day) !== 4 && (session.recurrence_weeks ?? 1) > 1 && !session.recurrence_anchor_date;
                    return (
                      <label key={id} className={`flex items-start gap-3 rounded-lg border p-3 ${blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-bronze/50"}`}>
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--color-bronze)]" checked={checked} disabled={blocked} onChange={() => toggleClass(id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{sessionShortLabel(session)}</span>
                          {normalizeWeekday(session.class_day) === 4
                            ? <span className="mt-1 block text-xs text-muted-foreground">پنجشنبه فقط در تاریخ‌های منتشرشده توسط استاد محاسبه می‌شود</span>
                            : blocked && <span className="mt-1 block text-xs text-muted-foreground">در انتظار تعیین تاریخ شروع دوره توسط استاد</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              {thursdayIds.length > 0 && (
                <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">پنجشنبه‌های اعلام‌شده توسط استاد</p>
                    {!!publishedThursdayOccurrences.data?.length && <Button type="button" size="sm" variant="outline"
                      onClick={() => setSelectedOccurrenceIds(publishedThursdayOccurrences.data!.filter((o) => !o.is_cancelled).map((o) => o.id))}>انتخاب همهٔ پنجشنبه‌ها</Button>}
                  </div>
                  {publishedThursdayOccurrences.isPending ? <LoadingRows rows={2} />
                    : publishedThursdayOccurrences.error ? <ErrorState error={publishedThursdayOccurrences.error} onRetry={() => void publishedThursdayOccurrences.refetch()} />
                    : !(publishedThursdayOccurrences.data ?? []).length
                      ? <p className="text-xs leading-6 text-muted-foreground">در این بازه هنوز جلسهٔ پنجشنبه‌ای اعلام نشده است.</p>
                      : (publishedThursdayOccurrences.data ?? []).map((occurrence) => {
                        const session = enrolledSessions.find((item) => String(item.id) === occurrence.class_session_id);
                        const checked = selectedOccurrenceIds.includes(occurrence.id);
                        return <label key={occurrence.id} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:border-bronze/50">
                          <input type="checkbox" className="mt-1 size-4 accent-[var(--color-bronze)]" checked={checked}
                            onChange={() => setSelectedOccurrenceIds((old) => checked ? old.filter((id) => id !== occurrence.id) : [...old, occurrence.id])} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{formatDateFa(occurrence.session_date, true)} · {session ? sessionShortLabel(session) : "جلسهٔ پنجشنبه"}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{occurrence.is_open ? "جلسه اعلام شده" : "رزرو بسته است"} · {session?.start_time?.slice(0,5) ?? ""} تا {session?.end_time?.slice(0,5) ?? ""}</span>
                          </span>
                        </label>;
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
              {toPersianDigits(allPlannedRows.length)} جلسه در این بازه برای ثبت آماده است.
              {startDate && endDate && endDate < startDate && " تاریخ پایان باید بعد از تاریخ شروع باشد."}
              {startDate && endDate && rangeDates.length === 0 && endDate >= startDate && " بازهٔ انتخابی نمی‌تواند بیشتر از ۱۸۰ روز باشد."}
            </div>
            <Button type="submit" className="w-full" disabled={submit.isPending || enrollments.isPending || sessions.isPending || absences.isPending || (thursdayIds.length > 0 && publishedThursdayOccurrences.isPending)}>
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
