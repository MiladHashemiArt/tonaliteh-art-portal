import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
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
  if (weeks <= 1) return true;
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
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const [draftDate, setDraftDate] = useState(toIsoDate(new Date()));
  const [dates, setDates] = useState<string[]>([toIsoDate(new Date())]);
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
  const plannedRows = dates.flatMap((date) =>
    selectedSessions
      .filter((session) => occursOnDate(session, date))
      .map((session) => ({ student_id: user.id, absence_date: date, class_id: session.id, description: description.trim() || null })),
  );
  const unmatched = dates.filter(
    (date) => !selectedSessions.some((session) => occursOnDate(session, date)),
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
      if (!dates.length || !classIds.length) throw new Error("تاریخ و دست‌کم یک جلسه را انتخاب کنید.");
      if (needsAnchor) throw new Error("برای جلسه یک هفته در میان، استاد باید ابتدا تاریخ شروع دوره را در مدیریت کلاس‌ها مشخص کند.");
      if (!newRows.length) throw new Error("برای انتخاب‌های شما جلسهٔ جدیدی برای ثبت غیبت پیدا نشد یا همه موارد قبلاً ثبت شده‌اند.");
      if (unmatched.length === dates.length) throw new Error("هیچ‌یک از تاریخ‌ها با روز جلسات انتخاب‌شده هم‌خوانی ندارد. تاریخ‌ها یا کلاس‌ها را بررسی کنید.");
      const { error } = await supabase.from("absences").insert(newRows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`غیبت ${toPersianDigits(newRows.length)} جلسه ثبت و به استاد و مدیریت اطلاع داده شد.`);
      setDescription("");
      setClassIds([]);
      setDates([]);
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
        description="می‌توانید چند تاریخ و چند جلسه را یک‌جا انتخاب کنید و فقط یک بار گزارش بفرستید."
      />
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Section title="فرم اعلام غیبت">
          <form
            className="surface min-w-0 space-y-5 overflow-hidden p-5"
            onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}
          >
            <div className="min-w-0 space-y-2">
              <Label htmlFor="abs-date">انتخاب تاریخ‌های غیبت</Label>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <JalaliDatePicker id="abs-date" value={draftDate} onChange={setDraftDate} label="انتخاب تاریخ شمسی" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="افزودن تاریخ"
                  disabled={!draftDate || dates.includes(draftDate)}
                  onClick={() => setDates((current) => [...current, draftDate].sort())}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {dates.map((date) => (
                  <span key={date} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs">
                    {formatDateFa(date, true)}
                    <button type="button" aria-label={`حذف ${formatDateFa(date)}`} onClick={() => setDates((current) => current.filter((item) => item !== date))} className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">برای هر روزی که غیبت دارید، تاریخ را انتخاب و با علامت + اضافه کنید.</p>
            </div>

            <div className="space-y-2">
              <Label>جلسه‌هایی که از دست می‌دهید</Label>
              {enrollments.isPending || sessions.isPending ? (
                <LoadingRows rows={2} />
              ) : enrollments.error || sessions.error ? (
                <ErrorState error={enrollments.error ?? sessions.error} onRetry={() => { void enrollments.refetch(); void sessions.refetch(); }} />
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
              {toPersianDigits(plannedRows.length)} جلسه برای ثبت آماده است.
              {unmatched.length > 0 && ` در ${toPersianDigits(unmatched.length)} تاریخ، جلسه‌ای از کلاس‌های انتخاب‌شده برگزار نمی‌شود و نادیده گرفته می‌شود.`}
            </div>
            <Button type="submit" className="w-full" disabled={submit.isPending || enrollments.isPending || sessions.isPending}>
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
