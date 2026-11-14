import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/backend/client";
import { friendlyError, qk, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionRow } from "@/lib/backend/types";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";
import { normalizeWeekday, sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";

type ClosureScope = "session" | "day" | "range";
type ClosureRow = {
  id: string;
  scope: ClosureScope;
  class_session_id: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_active: boolean;
  created_at: string;
};

export const Route = createFileRoute("/app/staff/closures")({
  head: () => ({ meta: [{ title: "تعطیلی کلاس‌ها | تنالیته" }] }),
  component: StaffClosuresPage,
});

function dayMatches(session: ClassSessionRow, iso: string) {
  const weekday = normalizeWeekday(session.class_day);
  const day = new Date(iso + "T12:00:00");
  if (weekday === null || day.getDay() !== weekday) return false;
  if (session.session_date) return session.session_date === iso;
  const weeks = session.recurrence_weeks ?? 1;
  if (weeks <= 1) return true;
  if (!session.recurrence_anchor_date) return false;
  const anchor = new Date(session.recurrence_anchor_date + "T12:00:00");
  anchor.setDate(anchor.getDate() + weekday - anchor.getDay());
  const diff = Math.round((day.getTime() - anchor.getTime()) / 604800000);
  return diff >= 0 && diff % weeks === 0;
}

function StaffClosuresPage() {
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const closures = useQuery({
    queryKey: ["class_session_closures"],
    queryFn: async (): Promise<ClosureRow[]> => {
      const { data, error } = await supabase.from("class_session_closures")
        .select("id,scope,class_session_id,start_date,end_date,reason,is_active,created_at")
        .order("start_date", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as ClosureRow[];
    },
  });
  const [scope, setScope] = useState<ClosureScope>("session");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [classId, setClassId] = useState("");
  const [reason, setReason] = useState("");
  const activeSessions = useMemo(
    () => sortSessions((sessions.data ?? []).filter(item => item.is_active !== false)),
    [sessions.data],
  );
  const createClosure = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("تاریخ تعطیلی را انتخاب کنید.");
      if (scope === "range" && (!endDate || endDate < startDate))
        throw new Error("تاریخ پایان باید بعد از تاریخ شروع باشد.");
      if (scope === "session" && !classId) throw new Error("سانس موردنظر را انتخاب کنید.");
      const from = new Date(startDate + "T12:00:00");
      const through = new Date((scope === "range" ? endDate : startDate) + "T12:00:00");
      const matchingSessions = activeSessions.filter(session => {
        if (scope === "session") return session.id === classId && dayMatches(session, startDate);
        for (const day = new Date(from); day <= through; day.setDate(day.getDate() + 1)) {
          const iso = day.getFullYear() + "-" + String(day.getMonth() + 1).padStart(2, "0") + "-" + String(day.getDate()).padStart(2, "0");
          if (dayMatches(session, iso)) return true;
        }
        return false;
      });
      if (!matchingSessions.length)
        throw new Error("در تاریخ یا بازهٔ انتخاب‌شده جلسه‌ای از برنامهٔ فعال پیدا نشد.");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("برای ثبت تعطیلی ابتدا وارد شوید.");
      const { error } = await supabase.from("class_session_closures").insert({
        scope,
        class_session_id: scope === "session" ? classId : null,
        start_date: startDate,
        end_date: scope === "range" ? endDate : startDate,
        reason: reason.trim() || null,
        created_by: auth.user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تعطیلی با موفقیت ثبت شد.");
      setReason("");
      setStartDate("");
      setEndDate("");
      await qc.invalidateQueries({ queryKey: ["class_session_closures"] });
    },
    onError: error => toast.error(friendlyError(error)),
  });
  const restoreClosure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_session_closures")
        .update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تعطیلی لغو شد و برنامه به حالت عادی برگشت.");
      await qc.invalidateQueries({ queryKey: ["class_session_closures"] });
    },
    onError: error => toast.error(friendlyError(error)),
  });
  const loading = sessions.isPending || closures.isPending;
  const error = sessions.error || closures.error;

  function closureTitle(item: ClosureRow) {
    if (item.scope === "session") {
      const session = sessions.data?.find(row => row.id === item.class_session_id);
      return session
        ? `لغو سانس · ${weekdayLabel(session.class_day)} · ${(session.start_time ?? "").slice(0,5)} تا ${(session.end_time ?? "").slice(0,5)}`
        : "لغو یک سانس";
    }
    if (item.scope === "day") return "تعطیلی تمام سانس‌های یک روز";
    return "تعطیلی بازهٔ چندروزه";
  }

  return <>
    <PageHeader back={{ to: "/app", label: "بازگشت به پنل" }}
      eyebrow="مدیریت آموزشی" title="تعطیلی و لغو کلاس‌ها"
      description="سانس، یک روز کامل یا چند روز را تعطیل کنید؛ سوابق کلاس‌ها و ثبت‌نام هنرجویان محفوظ می‌ماند." />
    <Section title="ثبت تعطیلی جدید">
      <form className="surface space-y-4 p-4 sm:p-5" onSubmit={event => {
        event.preventDefault();
        createClosure.mutate();
      }}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="closure-scope">نوع تعطیلی</label>
          <select id="closure-scope" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={scope} onChange={event => setScope(event.target.value as ClosureScope)}>
            <option value="session">فقط یک سانس در یک تاریخ</option>
            <option value="day">تمام سانس‌های یک روز</option>
            <option value="range">بازهٔ چندروزه یا یک هفته</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">تاریخ شروع / روز تعطیل</label>
            <JalaliDatePicker value={startDate} onChange={setStartDate} label="انتخاب تاریخ" />
          </div>
          {scope === "range" && <div className="space-y-2">
            <label className="text-sm font-medium">تاریخ پایان</label>
            <JalaliDatePicker value={endDate} onChange={setEndDate} label="انتخاب تاریخ پایان" />
          </div>}
        </div>
        {scope === "session" && <div className="space-y-2">
          <label htmlFor="closure-session" className="text-sm font-medium">سانس موردنظر</label>
          <select id="closure-session" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={classId} onChange={event => setClassId(event.target.value)}>
            <option value="">انتخاب سانس</option>
            {activeSessions.map(session => <option key={session.id} value={session.id}>
              {weekdayLabel(session.class_day)} · {(session.start_time ?? "").slice(0,5)} تا {(session.end_time ?? "").slice(0,5)} · {sessionTitle(session)}
            </option>)}
          </select>
          <p className="text-xs text-muted-foreground">این سانس فقط در تاریخ انتخاب‌شده لغو می‌شود.</p>
        </div>}
        <div className="space-y-2">
          <label htmlFor="closure-reason" className="text-sm font-medium">علت یا توضیح (اختیاری)</label>
          <Input id="closure-reason" value={reason} onChange={event => setReason(event.target.value)}
            placeholder="مثلاً تعطیلی رسمی یا هماهنگی استاد" maxLength={300} />
        </div>
        <Button type="submit" disabled={createClosure.isPending}>
          {createClosure.isPending ? "در حال ثبت…" : "ثبت تعطیلی"}
        </Button>
      </form>
    </Section>
    <Section title="سوابق تعطیلی‌ها">
      {loading ? <LoadingRows rows={3} /> : error ? <ErrorState error={error} onRetry={() => {
        void sessions.refetch(); void closures.refetch();
      }} /> : !closures.data?.length ? <EmptyState title="هنوز تعطیلی‌ای ثبت نشده است" />
      : <div className="space-y-3">
        {closures.data.map(item => <article key={item.id} className="surface space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{closureTitle(item)}</p>
            <span className={item.is_active
              ? "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800"
              : "rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground"}>
              {item.is_active ? "فعال" : "لغوشده"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {item.start_date === item.end_date
              ? formatDateFa(item.start_date, true)
              : `${formatDateFa(item.start_date, true)} تا ${formatDateFa(item.end_date, true)}`}
          </p>
          {item.reason && <p className="text-sm leading-6">{item.reason}</p>}
          {item.is_active && <Button size="sm" variant="outline" disabled={restoreClosure.isPending}
            onClick={() => restoreClosure.mutate(item.id)}>لغو تعطیلی و بازگرداندن برنامه</Button>}
        </article>)}
      </div>}
    </Section>
  </>;
}
