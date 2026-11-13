import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/backend/client";
import { allEnrollmentsQuery, allProfilesQuery, friendlyError, sessionsQuery } from "@/lib/backend/queries";
import type { AttendanceRecordRow, ClassSessionRow, ProfileRow } from "@/lib/backend/types";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";
import { normalizeWeekday, sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";

type Status = AttendanceRecordRow["status"];
const db = supabase as unknown as SupabaseClient<any>;
const labels: Record<Status, string> = {
  pending: "ثبت‌نشده",
  present: "حاضر",
  prior_notice_absence: "غیبت با اطلاع",
  no_notice_absence: "غیبت بدون اطلاع",
};
const styles: Record<Status, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  present: "border-emerald-300 bg-emerald-50 text-emerald-800",
  prior_notice_absence: "border-amber-300 bg-amber-50 text-amber-800",
  no_notice_absence: "border-rose-300 bg-rose-50 text-rose-800",
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
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
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
  const [date, setDate] = useState(todayInTehran);
  const jalali = jalaliParts(date);
  const yearDates = useMemo(() => jalaliYearDates(jalali.year), [jalali.year]);
  const selectedMonth = yearDates.filter(item => item.month === jalali.month);
  const monthNames = PERSIAN_MONTHS.map((label, index) => ({ value: index + 1, label }));
  const [classId, setClassId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: Status; note: string }>>({});
  const active = useMemo(() => sortSessions((sessions.data ?? []).filter(s => s.is_active !== false)), [sessions.data]);
  const daySessions = useMemo(() => active.filter(s => scheduledOn(s, date)), [active, date]);
  const session = daySessions.find(s => s.id === classId) ?? daySessions[0];
  const selectedId = session?.id ?? "";
  const roster = useMemo(() => {
    const ids = new Set((enrollments.data ?? []).filter(e => e.class_id === selectedId).map(e => e.student_id));
    return (profiles.data ?? []).filter(p => ids.has(p.id)).sort((a,b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "fa"));
  }, [enrollments.data, profiles.data, selectedId]);
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
  const loading = sessions.isPending || enrollments.isPending || profiles.isPending;
  const error = sessions.error || enrollments.error || profiles.error || attendance.error;
  const missingAnchor = active.some(s => (s.recurrence_weeks ?? 1) > 1 && !s.recurrence_anchor_date);

  return <>
    <PageHeader back={{ to: "/app", label: "بازگشت به پنل" }} eyebrow="مدیریت آموزشی"
      title="حضور و غیاب" description="وضعیت هر هنرجو را برای جلسهٔ مشخص ثبت کنید؛ ثبت‌نشدن به‌معنای غیبت نیست." />
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
      {missingAnchor && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        برای جلسات پنجشنبهٔ یک هفته در میان، ابتدا تاریخ شروع دوره را در «برنامه کلاس‌ها» تعیین کنید.
      </p>}
    </Section>
    <Section title={session ? `فهرست هنرجویان · ${toPersianDigits(roster.length)} نفر` : "فهرست هنرجویان"}>
      {loading ? <LoadingRows rows={4} /> : error ? <ErrorState error={error} onRetry={() => {
        void sessions.refetch(); void enrollments.refetch(); void profiles.refetch(); void attendance.refetch();
      }} /> : !session ? <EmptyState title="در این تاریخ جلسه‌ای برنامه‌ریزی نشده است"
        description="تاریخ دیگری انتخاب کنید یا برنامهٔ جلسات را بررسی کنید." />
      : attendance.isPending ? <LoadingRows rows={4} />
      : roster.length === 0 ? <EmptyState title="هنرجویی برای این جلسه ثبت‌نام نکرده است"
        description="فهرست هنرجویان از ثبت‌نام‌های همین کلاس دریافت می‌شود." />
      : <>
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
          const draft = drafts[student.id] ?? { status: existing?.status ?? "pending", note: existing?.note ?? "" };
          return <article key={student.id} className="surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{toPersianDigits(index + 1)}. {student.full_name || "هنرجوی بدون نام"}</p>
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{student.phone || "شماره تماس ثبت نشده"}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${styles[draft.status]}`}>{labels[draft.status]}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
              <select aria-label={`وضعیت حضور ${student.full_name ?? ""}`}
                className="h-10 min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
                value={draft.status}
                onChange={e => setDrafts(old => ({ ...old, [student.id]: { ...draft, status: e.target.value as Status } }))}>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <Input value={draft.note} placeholder="توضیح یا علت (اختیاری)"
                aria-label={`توضیح حضور ${student.full_name ?? ""}`}
                onChange={e => setDrafts(old => ({ ...old, [student.id]: { ...draft, note: e.target.value } }))} />
              <Button size="sm" disabled={save.isPending}
                onClick={() => save.mutate({ student, status: draft.status, note: draft.note })}>ذخیره</Button>
            </div>
            {existing?.marked_at && <p className="text-xs text-muted-foreground">
              آخرین ثبت: {formatDateFa(existing.marked_at, true)}
            </p>}
          </article>;
        })}
        </div>
      </>}
    </Section>
  </>;
}
