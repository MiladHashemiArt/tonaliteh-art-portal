import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/backend/client";
import { allEnrollmentsQuery, allProfilesQuery, friendlyError, sessionsQuery, settingsQuery } from "@/lib/backend/queries";
import type { AbsenceRow, AttendanceAdjustmentRow, AttendanceRecordRow, ClassSessionOccurrenceRow, ClassSessionReservationRow, ClassSessionRow, ProfileRow } from "@/lib/backend/types";
import { formatAmountFa, formatDateFa, toLatinDigits, toPersianDigits } from "@/lib/domain/persian";
import { normalizeWeekday, sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";

type Status = AttendanceRecordRow["status"];
const db = supabase as unknown as SupabaseClient<any>;
const labels: Record<Status, string> = {
  pending: "ثبت‌نشده",
  present: "حاضر",
  prior_notice_absence: "غیبت با اطلاع",
  no_notice_absence: "غیبت بدون اطلاع",
  cancelled_session: "جلسه لغو شد",
};
const styles: Record<Status, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  present: "border-emerald-300 bg-emerald-50 text-emerald-800",
  prior_notice_absence: "border-amber-300 bg-amber-50 text-amber-800",
  no_notice_absence: "border-rose-300 bg-rose-50 text-rose-800",
  cancelled_session: "border-border bg-muted text-muted-foreground",
};
function todayInTehran() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

const persianCalendar = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric",
});
const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
function jalaliParts(iso: string) {
  const parts = Object.fromEntries(persianCalendar.formatToParts(new Date(iso + "T12:00:00Z"))
    .map(part => [part.type, part.value]));
  return { year: Number(parts["year"]), month: Number(parts["month"]), day: Number(parts["day"]) };
}
function jalaliYearDates(year: number) {
  const start = Date.UTC(year + 621, 2, 19);
  return Array.from({ length: 370 }, (_, index) => {
    const date = new Date(start + index * 86400000);
    const iso = date.toISOString().slice(0, 10);
    return { iso, ...jalaliParts(iso) };
  }).filter(item => item.year === year);
}
function scheduledOn(session: ClassSessionRow, isoDate: string) {
  const weekday = normalizeWeekday(session.class_day);
  const day = new Date(isoDate + "T12:00:00");
  if (weekday === null || Number.isNaN(day.getTime()) || day.getDay() !== weekday) return false;
  if (weekday === 4) return false; // Thursday appears only when staff publishes a dated occurrence.
  const weeks = session.recurrence_weeks ?? 1;
  if (weeks <= 1) return !session.session_date || session.session_date === isoDate;
  if (!session.recurrence_anchor_date) return false;
  const anchor = new Date(session.recurrence_anchor_date + "T12:00:00");
  anchor.setDate(anchor.getDate() + weekday - anchor.getDay());
  const weeksFromAnchor = Math.round((day.getTime() - anchor.getTime()) / 604800000);
  return weeksFromAnchor >= 0 && weeksFromAnchor % weeks === 0;
}

export const Route = createFileRoute("/app/staff/attendance")({
  head: () => ({ meta: [{ title: "حضور و غیاب | تنالیته" }] }),
  component: StaffAttendancePage,
});

function StaffAttendancePage() {
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(allEnrollmentsQuery());
  const profiles = useQuery(allProfilesQuery());
  const settings = useQuery(settingsQuery());
  const [date, setDate] = useState(todayInTehran);
  const jalali = jalaliParts(date);
  const yearDates = useMemo(() => jalaliYearDates(jalali.year), [jalali.year]);
  const selectedMonth = yearDates.filter(item => item.month === jalali.month);
  const monthNames = PERSIAN_MONTHS.map((label, index) => ({ value: index + 1, label }));
  const [classId, setClassId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: Status; note: string }>>({});
  const [extraDrafts, setExtraDrafts] = useState<Record<string, { minutes: string; extraSession: boolean; note: string }>>({});
  const active = useMemo(() => sortSessions((sessions.data ?? []).filter(s => s.is_active !== false)), [sessions.data]);
  const occurrencesOnDate = useQuery({
    queryKey: ["class_session_occurrences", "attendance-date", date],
    enabled: Boolean(date),
    queryFn: async (): Promise<ClassSessionOccurrenceRow[]> => {
      const { data, error } = await db.from("class_session_occurrences").select("*").eq("session_date", date);
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
  });
  const daySessions = useMemo(() => active.filter(s =>
    scheduledOn(s, date) || (normalizeWeekday(s.class_day) === 4 &&
      (occurrencesOnDate.data ?? []).some(o => o.class_session_id === s.id))
  ), [active, date, occurrencesOnDate.data]);
  const session = daySessions.find(s => s.id === classId) ?? daySessions[0];
  const selectedId = session?.id ?? "";
  const occurrence = useQuery({
    queryKey: ["class_session_occurrence", selectedId, date],
    enabled: Boolean(selectedId && date),
    queryFn: async (): Promise<ClassSessionOccurrenceRow | null> => {
      const { data, error } = await db.from("class_session_occurrences")
        .select("*").eq("class_session_id", selectedId).eq("session_date", date).maybeSingle();
      if (error) throw error;
      return (data as ClassSessionOccurrenceRow | null) ?? null;
    },
  });
  const reservations = useQuery({
    queryKey: ["class_session_reservations", "staff-attendance", occurrence.data?.id],
    enabled: Boolean(occurrence.data?.id),
    queryFn: async (): Promise<ClassSessionReservationRow[]> => {
      const { data, error } = await db.from("class_session_reservations")
        .select("id,occurrence_id,student_id,status,created_at,updated_at")
        .eq("occurrence_id", occurrence.data!.id);
      if (error) throw error;
      return (data ?? []) as ClassSessionReservationRow[];
    },
  });
  const plannedAbsences = useQuery({
    queryKey: ["absences", "staff-attendance", selectedId, date],
    enabled: Boolean(selectedId && date),
    queryFn: async (): Promise<AbsenceRow[]> => {
      const { data, error } = await db.from("absences")
        .select("id,student_id,class_id,absence_date,description,created_at")
        .eq("class_id", selectedId).eq("absence_date", date);
      if (error) throw error;
      return (data ?? []) as AbsenceRow[];
    },
  });
  const adjustments = useQuery({
    queryKey: ["attendance_adjustments", selectedId, date],
    enabled: Boolean(selectedId && date),
    queryFn: async (): Promise<AttendanceAdjustmentRow[]> => {
      const { data, error } = await db.from("attendance_adjustments")
        .select("*").eq("class_id", selectedId).eq("session_date", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceAdjustmentRow[];
    },
  });
  const attendance = useQuery({
    queryKey: ["attendance_records", selectedId, date],
    enabled: Boolean(selectedId && date),
    queryFn: async (): Promise<AttendanceRecordRow[]> => {
      const { data, error } = await db.from("attendance_records")
        .select("id,student_id,class_id,session_date,status,note,marked_by,marked_at,created_at,updated_at")
        .eq("class_id", selectedId).eq("session_date", date);
      if (error) throw error;
      return (data ?? []) as AttendanceRecordRow[];
    },
  });
  const roster = useMemo(() => {
    const ids = occurrence.data
      ? new Set([
          ...(reservations.data ?? []).filter(row => row.status === "booked").map(row => row.student_id),
          ...(plannedAbsences.data ?? []).map(row => row.student_id),
          ...(attendance.data ?? []).filter(row => row.status !== "pending").map(row => row.student_id),
        ])
      : new Set((enrollments.data ?? []).filter(e => e.class_id === selectedId).map(e => e.student_id));
    return (profiles.data ?? []).filter(p => ids.has(p.id))
      .sort((a,b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "fa"));
  }, [enrollments.data, profiles.data, selectedId, occurrence.data, reservations.data, plannedAbsences.data, attendance.data]);
  const absenceByStudent = useMemo(
    () => new Map((plannedAbsences.data ?? []).map(row => [row.student_id, row])),
    [plannedAbsences.data],
  );
  const adjustmentsByStudent = useMemo(() => {
    const grouped = new Map<string, AttendanceAdjustmentRow[]>();
    for (const row of adjustments.data ?? []) {
      const current = grouped.get(row.student_id) ?? [];
      current.push(row);
      grouped.set(row.student_id, current);
    }
    return grouped;
  }, [adjustments.data]);
  const extraHourlyRate = Number(toLatinDigits(settings.data?.values.extra_hourly_rate ?? "")) || 0;
  const extraSessionRate = Number(toLatinDigits(settings.data?.values.extra_session_rate ?? "")) || 0;
  const byStudent = useMemo(() => new Map((attendance.data ?? []).map(r => [r.student_id, r])), [attendance.data]);
  const attendanceCounts = useMemo(() => {
    const rows = attendance.data ?? [];
    return {
      present: rows.filter(row => row.status === "present").length,
      prior: rows.filter(row => row.status === "prior_notice_absence").length,
      absent: rows.filter(row => row.status === "no_notice_absence").length,
      pending: Math.max(0, roster.length - rows.filter(row => row.status !== "pending").length),
    };
  }, [attendance.data, roster.length]);
  const save = useMutation({
    mutationFn: async ({ student, status, note }: { student: ProfileRow; status: Status; note: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("برای ثبت حضور و غیاب ابتدا وارد شوید.");
      const { error } = await db.from("attendance_records").upsert({
        student_id: student.id, class_id: selectedId, session_date: date,
        status, note: note.trim() || null, marked_by: auth.user.id, marked_at: new Date().toISOString(),
      }, { onConflict: "student_id,class_id,session_date" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("وضعیت حضور و غیاب ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["attendance_records", selectedId, date] });
    },
    onError: error => toast.error(friendlyError(error)),
  });
  const recordExtraCharges = useMutation({
    mutationFn: async ({ student, attendanceId, minutes, extraSession, note }: {
      student: ProfileRow; attendanceId: string; minutes: number; extraSession: boolean; note: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("برای ثبت هزینه ابتدا وارد شوید.");
      const rows: Array<Record<string, unknown>> = [];
      if (minutes > 0) rows.push({
        attendance_id: attendanceId, student_id: student.id, class_id: selectedId,
        session_date: date, adjustment_type: "extra_time", quantity_minutes: minutes,
        unit_rate: extraHourlyRate, description: note.trim() || null, recorded_by: auth.user.id,
      });
      if (extraSession) rows.push({
        attendance_id: attendanceId, student_id: student.id, class_id: selectedId,
        session_date: date, adjustment_type: "extra_session", quantity_minutes: null,
        unit_rate: extraSessionRate, description: note.trim() || null, recorded_by: auth.user.id,
      });
      if (!rows.length) throw new Error("مدت اضافه‌زمان یا گزینهٔ اضافه‌جلسه را مشخص کنید.");
      const { error } = await db.from("attendance_adjustments").insert(rows);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success("هزینهٔ اضافه ثبت و به فهرست پرداخت‌های هنرجو اضافه شد.");
      setExtraDrafts(old => ({ ...old, [variables.student.id]: { minutes: "", extraSession: false, note: "" } }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["attendance_adjustments", selectedId, date] }),
        qc.invalidateQueries({ queryKey: ["payments"] }),
      ]);
    },
    onError: error => toast.error(friendlyError(error)),
  });
  const loading = sessions.isPending || enrollments.isPending || profiles.isPending ||
    (Boolean(selectedId) && (occurrence.isPending || plannedAbsences.isPending || adjustments.isPending || Boolean(occurrence.data?.id && reservations.isPending)));
  const error = sessions.error || enrollments.error || profiles.error || occurrencesOnDate.error || attendance.error ||
    occurrence.error || reservations.error || plannedAbsences.error || adjustments.error;
  

  return <>
    <PageHeader back={{ to: "/app", label: "بازگشت به پنل" }} eyebrow="مدیریت آموزشی"
      title="حضور و غیاب" description="وضعیت هر هنرجو را برای جلسهٔ مشخص ثبت کنید؛ پنجشنبه فقط در صورت انتشار جلسه توسط استاد نمایش داده می‌شود." />
    <Section title="انتخاب تاریخ و جلسه">
      <div className="surface grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="attendance-date" className="text-sm font-medium">تاریخ جلسه</label>
          <div className="grid grid-cols-3 gap-2" dir="rtl">
            <select aria-label="سال شمسی" className="h-11 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={jalali.year} onChange={e => {
                const nextYear = Number(e.target.value);
                const nextDate = jalaliYearDates(nextYear).find(item => item.month === jalali.month && item.day === jalali.day)
                  ?? jalaliYearDates(nextYear)[0];
                if (nextDate) { setDate(nextDate.iso); setClassId(""); setDrafts({}); }
              }}>
              {Array.from({ length: 7 }, (_, index) => jalali.year - 3 + index).map(year =>
                <option key={year} value={year}>{toPersianDigits(year)}</option>)}
            </select>
            <select aria-label="ماه شمسی" className="h-11 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={jalali.month} onChange={e => {
                const month = Number(e.target.value);
                const nextDate = yearDates.find(item => item.month === month && item.day === Math.min(jalali.day, 29));
                const fallback = yearDates.find(item => item.month === month);
                if (nextDate || fallback) { setDate((nextDate ?? fallback)!.iso); setClassId(""); setDrafts({}); }
              }}>
              {monthNames.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
            </select>
            <select aria-label="روز ماه شمسی" className="h-11 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={jalali.day} onChange={e => {
                const nextDate = selectedMonth.find(item => item.day === Number(e.target.value));
                if (nextDate) { setDate(nextDate.iso); setClassId(""); setDrafts({}); }
              }}>
              {selectedMonth.map(item => <option key={item.day} value={item.day}>{toPersianDigits(item.day)}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">{date ? formatDateFa(date, true) : ""}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="attendance-session" className="text-sm font-medium">جلسه</label>
          <select id="attendance-session" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={session?.id ?? ""} disabled={!daySessions.length}
            onChange={e => { setClassId(e.target.value); setDrafts({}); }}>
            {daySessions.map(s => <option key={s.id} value={s.id}>
              {weekdayLabel(s.class_day)} · {sessionTimeRange(s)} · {sessionTitle(s)}
            </option>)}
          </select>
        </div>
      </div>

    </Section>
    <Section title={session ? `فهرست هنرجویان · ${toPersianDigits(roster.length)} نفر` : "فهرست هنرجویان"}>
      {loading ? <LoadingRows rows={4} /> : error ? <ErrorState error={error} onRetry={() => {
        void sessions.refetch(); void enrollments.refetch(); void profiles.refetch(); void occurrencesOnDate.refetch(); void attendance.refetch();
        void occurrence.refetch(); void reservations.refetch(); void plannedAbsences.refetch(); void adjustments.refetch();
      }} /> : !session ? <EmptyState title="در این تاریخ جلسه‌ای برنامه‌ریزی نشده است"
        description="تاریخ دیگری انتخاب کنید یا برنامهٔ جلسات را بررسی کنید." />
      : attendance.isPending ? <LoadingRows rows={4} />
      : roster.length === 0 ? <EmptyState
        title={occurrence.data ? "هنوز رزروی برای این جلسه ثبت نشده است" : "هنرجویی برای این جلسه ثبت‌نام نکرده است"}
        description={occurrence.data
          ? "پس از رزرو هنرجویان، فهرست آن‌ها در همین بخش نمایش داده می‌شود."
          : "فهرست این جلسه از ثبت‌نام‌های کلاس دریافت می‌شود."} />
      : <>
        {occurrence.data && <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6">
          <p className="font-medium">{occurrence.data.is_cancelled ? "این جلسه توسط استاد لغو شده است." : "فهرست این جلسه از روی رزروها آماده شده است."}</p>
          <p className="text-muted-foreground">
            {toPersianDigits(reservations.data?.filter(row => row.status === "booked").length ?? 0)} رزرو قطعی از ظرفیت {toPersianDigits(occurrence.data.capacity)} نفر
            {plannedAbsences.data?.length ? " · " + toPersianDigits(plannedAbsences.data.length) + " اعلام غیبت قبلی" : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">هنرجویان رزروشده و افرادی که از قبل غیبت اعلام کرده‌اند در فهرست دیده می‌شوند؛ ثبت حضور نهایی همچنان با تأیید استاد انجام می‌شود.</p>
        </div>}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "حاضر", value: attendanceCounts.present, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
            { label: "غیبت با اطلاع", value: attendanceCounts.prior, tone: "border-amber-200 bg-amber-50 text-amber-800" },
            { label: "غیبت بدون اطلاع", value: attendanceCounts.absent, tone: "border-rose-200 bg-rose-50 text-rose-800" },
            { label: "هنوز ثبت‌نشده", value: attendanceCounts.pending, tone: "border-border bg-muted text-muted-foreground" },
          ].map(item => <div key={item.label} className={`rounded-xl border p-3 ${item.tone}`}>
            <p className="text-xs">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{toPersianDigits(item.value)}</p>
          </div>)}
        </div>
        <div className="space-y-3">
        {roster.map((student, index) => {
          const existing = byStudent.get(student.id);
          const plannedAbsence = absenceByStudent.get(student.id);
          const draft = drafts[student.id] ?? {
            status: existing?.status ?? (plannedAbsence ? "prior_notice_absence" : "pending"),
            note: existing?.note ?? plannedAbsence?.description ?? "",
          };
          return <article key={student.id} className="surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar path={student.avatar_path} name={student.full_name} className="size-11" />
                <div className="min-w-0"><p className="font-semibold">{toPersianDigits(index + 1)}. {student.full_name || "هنرجوی بدون نام"}</p>
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{student.phone || "شماره تماس ثبت نشده"}</p>
                {occurrence.data && <p className="mt-1 text-xs text-muted-foreground">
                  {(reservations.data ?? []).some(row => row.student_id === student.id && row.status === "booked") ? "رزرو قطعی" : "بدون رزرو فعال"}
                  {plannedAbsence ? " · غیبت از قبل اعلام شده" : ""}
                </p>}</div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${styles[draft.status]}`}>{labels[draft.status]}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
              <select aria-label={`وضعیت حضور ${student.full_name ?? ""}`}
                disabled={occurrence.data?.is_cancelled === true}
                className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
                value={draft.status}
                onChange={e => setDrafts(old => ({ ...old, [student.id]: { ...draft, status: e.target.value as Status } }))}>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Input value={draft.note} placeholder="توضیح یا علت (اختیاری)"
                aria-label={`توضیح حضور ${student.full_name ?? ""}`}
                onChange={e => setDrafts(old => ({ ...old, [student.id]: { ...draft, note: e.target.value } }))} />
              <Button size="sm" disabled={save.isPending || occurrence.data?.is_cancelled === true}
                onClick={() => save.mutate({ student, status: draft.status, note: draft.note })}>ذخیره</Button>
            </div>
            {existing?.marked_at && <p className="text-xs text-muted-foreground">
              آخرین ثبت: {formatDateFa(existing.marked_at, true)}
            </p>}
            {existing?.status === "present" && <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm font-semibold">ثبت اضافه‌زمان و اضافه‌جلسه</p>
              {(adjustmentsByStudent.get(student.id) ?? []).length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {(adjustmentsByStudent.get(student.id) ?? []).map(item => <li key={item.id}>
                  {item.adjustment_type === "extra_time" ? "اضافه‌زمان " + toPersianDigits(item.quantity_minutes ?? 0) + " دقیقه" : "جلسهٔ اضافه"}
                  {" · "}{formatAmountFa(item.amount)} · ثبت‌شده در امور مالی
                </li>)}
              </ul>}
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <label className="text-xs font-medium" htmlFor={"extra-minutes-" + student.id}>مدت اضافه‌زمان (دقیقه)</label>
                  <Input id={"extra-minutes-" + student.id} inputMode="numeric" placeholder="مثلاً ۳۰"
                    value={extraDrafts[student.id]?.minutes ?? ""}
                    onChange={event => setExtraDrafts(old => ({ ...old, [student.id]: {
                      minutes: String(Math.min(480, Number(toLatinDigits(event.target.value).replace(/[^0-9]/g, "").slice(0, 3) || "0"))),
                      extraSession: old[student.id]?.extraSession ?? false,
                      note: old[student.id]?.note ?? "",
                    } }))} />
                  <p className="text-xs text-muted-foreground">نرخ ساعتی: {extraHourlyRate > 0 ? formatAmountFa(extraHourlyRate) : "در تنظیمات تعیین نشده"}</p>
                </div>
                <label className="flex items-center gap-2 self-end rounded-lg border border-input p-3 text-sm">
                  <input type="checkbox" checked={extraDrafts[student.id]?.extraSession ?? false}
                    onChange={event => setExtraDrafts(old => ({ ...old, [student.id]: {
                      minutes: old[student.id]?.minutes ?? "",
                      extraSession: event.target.checked,
                      note: old[student.id]?.note ?? "",
                    } }))} />
                  جلسهٔ اضافه
                </label>
              </div>
              <div className="mt-2 space-y-1">
                <label className="text-xs font-medium" htmlFor={"extra-note-" + student.id}>توضیح هزینه (اختیاری)</label>
                <Input id={"extra-note-" + student.id} maxLength={300}
                  placeholder="مثلاً ماندن ۳۰ دقیقه پس از پایان کلاس"
                  value={extraDrafts[student.id]?.note ?? ""}
                  onChange={event => setExtraDrafts(old => ({ ...old, [student.id]: {
                    minutes: old[student.id]?.minutes ?? "",
                    extraSession: old[student.id]?.extraSession ?? false,
                    note: event.target.value,
                  } }))} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  نرخ جلسهٔ اضافه: {extraSessionRate > 0 ? formatAmountFa(extraSessionRate) : "در تنظیمات تعیین نشده"}
                </p>
                <Button size="sm" variant="outline"
                  disabled={recordExtraCharges.isPending ||
                    (!(Number(extraDrafts[student.id]?.minutes ?? 0) > 0) && !(extraDrafts[student.id]?.extraSession ?? false)) ||
                    (Number(extraDrafts[student.id]?.minutes ?? 0) > 0 && extraHourlyRate <= 0) ||
                    ((extraDrafts[student.id]?.extraSession ?? false) && extraSessionRate <= 0)}
                  onClick={() => recordExtraCharges.mutate({
                    student, attendanceId: existing.id,
                    minutes: Number(extraDrafts[student.id]?.minutes ?? 0),
                    extraSession: extraDrafts[student.id]?.extraSession ?? false,
                    note: extraDrafts[student.id]?.note ?? "",
                  })}>ثبت هزینهٔ اضافه</Button>
              </div>
            </div>}
          </article>;
        })}
        </div>
      </>}
    </Section>
  </>;
}
