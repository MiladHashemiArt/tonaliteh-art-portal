import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, qk, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionOccurrenceRow, ClassSessionReservationRow, ProfileRow } from "@/lib/backend/types";
import { toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/occurrences")({
  head: () => ({ meta: [{ title: "جلسات موردی | تنالیته" }] }),
  component: StaffOccurrencesPage,
});

function isThursday(date: string) {
  return Boolean(date) && new Date(date + "T12:00:00").getDay() === 4;
}

function StaffOccurrencesPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const occurrences = useQuery({
    queryKey: ["session-occurrences", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_occurrences").select("*").order("session_date", { ascending: true });
      if (error) throw error;
      return data as ClassSessionOccurrenceRow[];
    },
  });
  const reservations = useQuery({
    queryKey: ["session-reservations", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_reservations").select("*").order("reserved_at", { ascending: true });
      if (error) throw error;
      return data as ClassSessionReservationRow[];
    },
  });
  const profiles = useQuery({
    queryKey: qk.allProfiles,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,phone,role,created_at,home_address,avatar_path");
      if (error) throw error;
      return data as ProfileRow[];
    },
  });
  const templates = useMemo(() => (sessions.data ?? []).filter((s) => s.class_day === "پنجشنبه" && s.is_active !== false), [sessions.data]);
  const [templateId, setTemplateId] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const template = templates.find((s) => s.id === templateId);
      if (!template) throw new Error("سانس پنجشنبه را انتخاب کنید.");
      if (!isThursday(date)) throw new Error("تاریخ انتخابی باید پنجشنبه باشد.");
      if (date < new Date().toLocaleDateString("en-CA")) throw new Error("تاریخ جلسه باید امروز یا در آینده باشد.");
      const { error } = await supabase.from("class_session_occurrences").insert({
        class_session_id: template.id,
        session_date: date,
        start_time: template.start_time ?? "09:00",
        end_time: template.end_time ?? "12:00",
        class_type: template.class_type ?? "طراحی از مدل زنده",
        created_by: user.id,
        capacity: capacity ? Number(capacity) : null,
        announcement: announcement.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("جلسهٔ موردی منتشر شد و اعلان آن برای هنرجویان ارسال شد.");
      setDate(""); setCapacity(""); setAnnouncement("");
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from("class_session_occurrences").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تغییرات جلسه ثبت شد و اعلان برای هنرجویان ارسال شد.");
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const loading = sessions.isPending || occurrences.isPending || reservations.isPending || profiles.isPending;
  const error = sessions.error ?? occurrences.error ?? reservations.error ?? profiles.error;
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || "هنرجو"]));

  return <>
    <PageHeader back={{ to: "/app/staff/classes", label: "برنامهٔ کلاس‌ها" }} eyebrow="مدیریت آموزشی" title="جلسات موردی پنجشنبه" description="برای هر پنجشنبه‌ای که تصمیم به برگزاری دارید، جلسه‌ای مستقل منتشر کنید؛ چرخهٔ هفتگی تغییر نمی‌کند." />
    <Section title="انتشار جلسهٔ جدید">
      <div className="surface space-y-4 p-4 sm:p-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">سانس پنجشنبه</label>
          <select className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">انتخاب سانس</option>
            {templates.map((s) => <option key={s.id} value={s.id}>{s.start_time?.slice(0,5)} تا {s.end_time?.slice(0,5)} · {s.class_type}</option>)}
          </select>
        </div>
        <div className="space-y-1.5"><label className="text-sm font-medium">تاریخ برگزاری</label><JalaliDatePicker id="occurrence-date" value={date} onChange={setDate} label="انتخاب پنجشنبه" /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">ظرفیت (اختیاری)</label><Input value={capacity} onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g,""))} inputMode="numeric" placeholder="بدون محدودیت" /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">توضیح برای هنرجویان (اختیاری)</label><textarea className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm" value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="توضیحات جلسه…" /></div>
        <Button disabled={create.isPending || !templateId || !date || !isThursday(date)} onClick={() => create.mutate()}>{create.isPending ? "در حال انتشار…" : "انتشار جلسه و اطلاع‌رسانی"}</Button>
      </div>
    </Section>
    <Section title="جلسات منتشرشده">
      {loading ? <LoadingRows rows={3}/> : error ? <ErrorState error={error} onRetry={() => { void occurrences.refetch(); void reservations.refetch(); }} /> : !occurrences.data?.length ? <EmptyState title="هنوز جلسهٔ موردی منتشر نشده است"/> :
        <ul className="space-y-4">{occurrences.data.map((o) => {
          const roster = (reservations.data ?? []).filter((r) => r.occurrence_id === o.id && r.status === "reserved");
          return <li key={o.id} className="surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-semibold">{o.class_type}</p><p className="text-sm text-muted-foreground">{o.session_date} · {o.start_time.slice(0,5)} تا {o.end_time.slice(0,5)}</p></div>
              <span className="text-sm">{o.status === "cancelled" ? "لغوشده" : o.reservations_open ? "رزرو باز" : "رزرو بسته"} · {toPersianDigits(roster.length)} رزرو</span>
            </div>
            <p className="text-sm text-muted-foreground">ظرفیت: {o.capacity ? toPersianDigits(o.capacity) : "نامحدود"}</p>
            {roster.length > 0 && <div className="rounded-lg bg-muted/50 p-3"><p className="mb-2 text-sm font-medium">فهرست رزروکنندگان</p><ul className="space-y-1 text-sm">{roster.map((r) => <li key={r.id}>{names.get(r.student_id) ?? "هنرجو"}</li>)}</ul></div>}
            {o.status === "scheduled" && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({id:o.id,values:{reservations_open:!o.reservations_open}})}>{o.reservations_open ? "بستن رزرو" : "بازکردن رزرو"}</Button>
              <Button size="sm" variant="destructive" disabled={update.isPending} onClick={() => { if (window.confirm("جلسه لغو شود؟ رزروها و سوابق حفظ می‌شوند و هنرجویان اعلان می‌گیرند.")) update.mutate({id:o.id,values:{status:"cancelled",reservations_open:false}}); }}>لغو جلسه</Button>
            </div>}
          </li>;
        })}</ul>}
    </Section>
  </>;
}
