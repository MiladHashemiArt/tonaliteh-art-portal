import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, qk, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionOccurrenceRow, ClassSessionRow } from "@/lib/backend/types";
import { formatDateFa, toIsoDate, toLatinDigits, toPersianDigits } from "@/lib/domain/persian";
import { recurrenceLabel, sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";

export const Route = createFileRoute("/app/staff/classes")({
  head: () => ({ meta: [{ title: "کلاس‌ها | تنالیته" }] }),
  component: StaffClassesPage,
});

const DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
type SessionDraft = {
  class_day: string;
  class_type: string;
  start_time: string;
  end_time: string;
  recurrence_weeks: number;
  recurrence_anchor_date: string;
};
const blankDraft = (): SessionDraft => ({
  class_day: "سه‌شنبه",
  class_type: "طراحی و رنگ",
  start_time: "09:00",
  end_time: "12:00",
  recurrence_weeks: 1,
  recurrence_anchor_date: "",
});

function StaffClassesPage() {
  const { role } = useAppSession();
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const [occurrenceDate, setOccurrenceDate] = useState(() => toIsoDate(new Date()));
  const [occurrenceSessionId, setOccurrenceSessionId] = useState("");
  const [capacity, setCapacity] = useState("12");
  const rangeEnd = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return toIsoDate(end);
  }, []);
  const occurrences = useQuery({
    queryKey: ["class_session_occurrences", "staff", rangeEnd],
    queryFn: async (): Promise<ClassSessionOccurrenceRow[]> => {
      const { data, error } = await supabase.from("class_session_occurrences")
        .select("*").gte("session_date", toIsoDate(new Date())).lte("session_date", rangeEnd)
        .order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
  });
  const reservations = useQuery({
    queryKey: ["class_session_reservations", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_reservations")
        .select("id, occurrence_id, student_id, status, created_at, updated_at").eq("status", "booked");
      if (error) throw error;
      return data ?? [];
    },
  });
  const studentProfiles = useQuery({
    queryKey: ["class_session_reservation_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, phone");
      if (error) throw error;
      return data ?? [];
    },
  });
  const publishOccurrence = useMutation({
    mutationFn: async () => {
      if (!occurrenceSessionId) throw new Error("ابتدا جلسه را انتخاب کنید.");
      const cap = Number(toLatinDigits(capacity));
      if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new Error("ظرفیت باید عددی بین ۱ تا ۲۰۰ باشد.");
      const { error } = await supabase.from("class_session_occurrences").upsert({
        class_session_id: occurrenceSessionId,
        session_date: occurrenceDate,
        capacity: cap,
        is_open: true,
        published_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        published_at: new Date().toISOString(),
      }, { onConflict: "class_session_id,session_date" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("جلسه برای رزرو هنرجویان منتشر شد.");
      await queryClient.invalidateQueries({ queryKey: ["class_session_occurrences"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const toggleOccurrence = useMutation({
    mutationFn: async ({ id, is_open }: { id: string; is_open: boolean }) => {
      const { error } = await supabase.from("class_session_occurrences").update({ is_open }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("وضعیت رزرو جلسه به‌روزرسانی شد.");
      await queryClient.invalidateQueries({ queryKey: ["class_session_occurrences"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });
  const [anchors, setAnchors] = useState<Record<string, string>>({});
  const [openAnchorId, setOpenAnchorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SessionDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const session of sessions.data ?? []) next[session.id] = session.recurrence_anchor_date ?? "";
    setAnchors(next);
  }, [sessions.data]);

  const rows = useMemo(() => sortSessions(sessions.data ?? []), [sessions.data]);
  const activeCount = rows.filter((session) => session.is_active !== false).length;
  const alternating = rows.filter((session) => session.is_active !== false && session.class_day !== "پنجشنبه" && (session.recurrence_weeks ?? 1) > 1);

  const saveSession = useMutation({
    mutationFn: async () => {
      const title = draft.class_type.trim();
      if (!title) throw new Error("عنوان کلاس را وارد کنید.");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.start_time) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.end_time) || draft.start_time >= draft.end_time)
        throw new Error("ساعت شروع و پایان را به شکل درست وارد کنید؛ مثلاً ۰۹:۰۰ و ۱۲:۰۰.");
      if (draft.class_day !== "پنجشنبه" && draft.recurrence_weeks > 1 && !draft.recurrence_anchor_date)
        throw new Error("برای کلاس یک هفته در میان، تاریخ شروع دوره را مشخص کنید.");
      const payload = {
        class_day: draft.class_day,
        class_type: title,
        start_time: draft.start_time,
        end_time: draft.end_time,
        recurrence_weeks: draft.class_day === "پنجشنبه" ? 1 : draft.recurrence_weeks,
        recurrence_anchor_date: draft.class_day === "پنجشنبه" ? null : draft.recurrence_weeks > 1 ? draft.recurrence_anchor_date : null,
        session_date: null,
      };
      const result = editingId
        ? await supabase.from("class_sessions").update(payload).eq("id", editingId)
        : await supabase.from("class_sessions").insert({ ...payload, is_active: true });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      toast.success(editingId ? "برنامهٔ جلسه ویرایش شد." : "جلسهٔ جدید به برنامه اضافه شد.");
      setDraft(blankDraft());
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const toggleActive = useMutation({
    mutationFn: async (session: ClassSessionRow) => {
      const { error } = await supabase.from("class_sessions")
        .update({ is_active: session.is_active === false })
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("وضعیت جلسه تغییر کرد.");
      await queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const saveAnchor = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("class_sessions")
        .update({ recurrence_anchor_date: date || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تاریخ شروع دوره ذخیره شد.");
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  function editSession(session: ClassSessionRow) {
    setEditingId(session.id);
    setDraft({
      class_day: String(session.class_day ?? "سه‌شنبه"),
      class_type: session.class_type ?? "",
      start_time: (session.start_time ?? "09:00").slice(0, 5),
      end_time: (session.end_time ?? "12:00").slice(0, 5),
      recurrence_weeks: session.class_day === "پنجشنبه" ? 1 : session.recurrence_weeks ?? 1,
      recurrence_anchor_date: session.class_day === "پنجشنبه" ? "" : session.recurrence_anchor_date ?? "",
    });
  }

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow={role === "manager" ? "مدیریت آموزشگاه" : "مدیریت آموزشی"}
        title="برنامه کلاس‌ها"
        description="استاد و مدیریت می‌توانند هر تعداد جلسه، در هر روز هفته و با هر تعداد سانس تعریف و ویرایش کنند."
      />

      <Section title="افزودن یا ویرایش جلسه">
        <form className="surface min-w-0 space-y-4 overflow-hidden p-4 sm:p-5"
          onSubmit={(event) => { event.preventDefault(); saveSession.mutate(); }}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="session-day" className="text-sm font-medium">روز برگزاری</label>
              <select id="session-day" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
                value={draft.class_day} onChange={(event) => setDraft((old) => ({ ...old, class_day: event.target.value, ...(event.target.value === "پنجشنبه" ? { recurrence_weeks: 1, recurrence_anchor_date: "" } : {}) }))}>
                {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="session-title" className="text-sm font-medium">عنوان کلاس</label>
              <Input id="session-title" value={draft.class_type}
                onChange={(event) => setDraft((old) => ({ ...old, class_type: event.target.value }))}
                placeholder="مثلاً طراحی و رنگ" maxLength={100} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="session-start" className="text-sm font-medium">ساعت شروع</label>
              <Input id="session-start" type="text" inputMode="numeric" dir="ltr" placeholder="۰۹:۰۰" value={toPersianDigits(draft.start_time)}
                onChange={(event) => setDraft((old) => ({ ...old, start_time: toLatinDigits(event.target.value).replace(/[^0-9:]/g, "").slice(0, 5) }))} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label htmlFor="session-end" className="text-sm font-medium">ساعت پایان</label>
              <Input id="session-end" type="text" inputMode="numeric" dir="ltr" placeholder="۱۲:۰۰" value={toPersianDigits(draft.end_time)}
                onChange={(event) => setDraft((old) => ({ ...old, end_time: toLatinDigits(event.target.value).replace(/[^0-9:]/g, "").slice(0, 5) }))} />
            </div>
            {draft.class_day !== "پنجشنبه" && <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <label htmlFor="session-recurrence" className="text-sm font-medium">نحوهٔ تکرار</label>
              <select id="session-recurrence" className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
                value={draft.recurrence_weeks}
                onChange={(event) => setDraft((old) => ({ ...old, recurrence_weeks: Number(event.target.value) }))}>
                <option value={1}>هر هفته</option>
                <option value={2}>یک هفته در میان</option>
              </select>
            </div>}
            {draft.class_day !== "پنجشنبه" && draft.recurrence_weeks > 1 && (
              <div className="min-w-0 space-y-1.5 sm:col-span-2">
                <label htmlFor="session-anchor" className="text-sm font-medium">تاریخ شروع چرخه</label>
                <JalaliDatePicker id="session-anchor" value={draft.recurrence_anchor_date}
                  onChange={(value) => setDraft((old) => ({ ...old, recurrence_anchor_date: value }))}
                  label="انتخاب تاریخ شروع چرخه" />
              </div>
            )}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            برای ساخت سانس سوم، کافی است همین فرم را با ساعت دلخواه ثبت کنید. می‌توانید برای یک روز چند جلسه با ساعت‌های متفاوت بسازید.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saveSession.isPending}>
              {saveSession.isPending ? "در حال ذخیره…" : editingId ? "ذخیرهٔ ویرایش" : "افزودن جلسه"}
            </Button>
            {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setDraft(blankDraft()); }}>انصراف از ویرایش</Button>}
          </div>
        </form>
      </Section>

      <Section title={`جلسات فعال · ${toPersianDigits(activeCount)}`}>
        {sessions.isPending ? <LoadingRows rows={4} />
          : sessions.error ? <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          : rows.length === 0 ? <EmptyState title="هنوز کلاسی تعریف نشده است" />
          : <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {rows.map((session) => (
              <li key={session.id} className={`surface min-w-0 max-w-full space-y-3 overflow-hidden p-4 ${session.is_active === false ? "opacity-65" : ""}`}>
                <div className="min-w-0">
                  <p className="break-words font-display font-semibold">{sessionTitle(session)}</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {weekdayLabel(session.class_day)} · {sessionTimeRange(session)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{session.class_day === "پنجشنبه" ? "فقط با اعلام و انتشار استاد" : recurrenceLabel(session.recurrence_weeks)}</p>
                  {session.is_active === false && <p className="mt-1 text-xs font-medium text-amber-700">غیرفعال · سوابق ثبت‌نام و حضور حفظ شده‌اند</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => editSession(session)}>ویرایش</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={toggleActive.isPending}
                    onClick={() => toggleActive.mutate(session)}>
                    {session.is_active === false ? "فعال‌سازی" : "غیرفعال‌سازی"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>}
      </Section>


      <Section title="انتشار جلسهٔ مشخص و رزرو هنرجویان">
        <p className="mb-4 text-sm leading-7 text-muted-foreground">
          برای پنجشنبه، استاد هر زمان لازم باشد تاریخ مشخصی را منتشر می‌کند؛ فقط همان تاریخ برای هنرجویان قابل رزرو خواهد بود. با بستن جلسه، رزرو آن متوقف می‌شود.
        </p>
        <div className="surface space-y-3 p-4">
          <div className="space-y-1.5">
            <label htmlFor="occurrence-session" className="text-sm font-medium">جلسه</label>
            <select id="occurrence-session" value={occurrenceSessionId}
              onChange={(event) => setOccurrenceSessionId(event.target.value)}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
              <option value="">انتخاب جلسه</option>
              {rows.filter((session) => session.is_active !== false).map((session) =>
                <option key={session.id} value={session.id}>
                  {weekdayLabel(session.class_day)} · {sessionTitle(session)} · {sessionTimeRange(session)}
                </option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="occurrence-date">تاریخ برگزاری</label>
              <JalaliDatePicker id="occurrence-date" value={occurrenceDate}
                onChange={setOccurrenceDate} label="انتخاب تاریخ جلسه" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="occurrence-capacity">ظرفیت هنرجو</label>
              <Input id="occurrence-capacity" inputMode="numeric" value={toPersianDigits(capacity)}
                onChange={(event) => setCapacity(toLatinDigits(event.target.value).replace(/[^0-9]/g, "").slice(0, 3))} />
            </div>
          </div>
          <Button disabled={publishOccurrence.isPending || !occurrenceSessionId || !occurrenceDate}
            onClick={() => publishOccurrence.mutate()}>
            {publishOccurrence.isPending ? "در حال انتشار…" : "انتشار برای رزرو"}
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {occurrences.isPending || reservations.isPending || studentProfiles.isPending ? <LoadingRows rows={3} />
            : occurrences.error || reservations.error || studentProfiles.error ? <ErrorState error={occurrences.error ?? reservations.error ?? studentProfiles.error} onRetry={() => { void occurrences.refetch(); void reservations.refetch(); void studentProfiles.refetch(); }} />
            : (occurrences.data ?? []).length === 0 ? <EmptyState title="هنوز جلسه‌ای برای رزرو منتشر نشده است" />
            : (occurrences.data ?? []).map((occurrence) => {
              const session = rows.find((item) => item.id === occurrence.class_session_id);
              const booked = (reservations.data ?? []).filter((item) => item.occurrence_id === occurrence.id);
              return <article key={occurrence.id} className="surface space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{session ? sessionTitle(session) : "جلسه"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateFa(occurrence.session_date, true)} · {session ? sessionTimeRange(session) : ""}
                    </p>
                  </div>
                  <span className={occurrence.is_open ? "text-xs font-medium text-emerald-700" : "text-xs text-muted-foreground"}>
                    {occurrence.is_open ? "باز برای رزرو" : "رزرو بسته"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {toPersianDigits(occurrence.booked_count)} از {toPersianDigits(occurrence.capacity)} نفر رزرو کرده‌اند
                </p>
                {booked.length > 0 && <p className="break-all text-xs text-muted-foreground">
                  {booked.map((item) => studentProfiles.data?.find((profile) => profile.id === item.student_id)?.full_name || "هنرجو").join("، ")}
                </p>}
                <Button size="sm" variant="outline" disabled={toggleOccurrence.isPending}
                  onClick={() => toggleOccurrence.mutate({ id: occurrence.id, is_open: !occurrence.is_open })}>
                  {occurrence.is_open ? "بستن رزرو" : "بازکردن رزرو"}
                </Button>
              </article>;
            })}
        </div>
      </Section>
      <Section title="تنظیم تاریخ جلسات یک هفته در میان">
        <p className="mb-4 text-sm leading-7 text-muted-foreground">
          تاریخ شروع چرخه مشخص می‌کند کدام هفته جلسه برگزار شود. تاریخ‌ها بر اساس تقویم شمسی نمایش داده می‌شوند.
        </p>
        {alternating.length === 0 ? <EmptyState title="جلسهٔ فعال یک هفته در میان تعریف نشده است" />
          : <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
            {alternating.map((session) => {
              const date = anchors[session.id] ?? "";
              const changed = date !== (session.recurrence_anchor_date ?? "");
              return <li key={session.id} className={`surface relative z-0 min-w-0 space-y-3 overflow-visible p-4 ${openAnchorId === session.id ? "z-20" : ""}`}>
                <div className="min-w-0">
                  <p className="break-words font-semibold">{weekdayLabel(session.class_day)} · {sessionTimeRange(session)}</p>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{sessionTitle(session)}</p>
                </div>
                <div className="min-w-0 space-y-2">
                  <label htmlFor={`anchor-${session.id}`} className="text-sm font-medium">تاریخ شروع دوره</label>
                  <JalaliDatePicker id={`anchor-${session.id}`} value={date}
                    onChange={(value) => setAnchors((old) => ({ ...old, [session.id]: value }))}
                    label="انتخاب تاریخ شروع دوره"
                    onOpenChange={(open) => setOpenAnchorId(open ? session.id : null)} />
                </div>
                <Button size="sm" disabled={!changed || !date || saveAnchor.isPending}
                  onClick={() => saveAnchor.mutate({ id: session.id, date })}>ذخیره تاریخ شروع</Button>
              </li>;
            })}
          </ul>}
      </Section>
    </>
  );
}
