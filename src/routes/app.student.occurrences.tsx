import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, myEnrollmentsQuery } from "@/lib/backend/queries";
import type { ClassSessionOccurrenceRow, ClassSessionReservationRow } from "@/lib/backend/types";
import { toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/occurrences")({
  head: () => ({ meta: [{ title: "رزرو جلسات موردی | تنالیته" }] }),
  component: StudentOccurrencesPage,
});

function StudentOccurrencesPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const occurrences = useQuery({
    queryKey: ["session-occurrences", "student", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_occurrences").select("*").order("session_date", { ascending: true });
      if (error) throw error;
      return data as ClassSessionOccurrenceRow[];
    },
  });
  const reservations = useQuery({
    queryKey: ["session-reservations", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_session_reservations").select("*").eq("student_id", user.id);
      if (error) throw error;
      return data as ClassSessionReservationRow[];
    },
  });
  const reserve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reserve_class_session_occurrence", { p_occurrence_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("رزرو شما ثبت شد.");
      await qc.invalidateQueries({ queryKey: ["session-reservations", user.id] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_class_session_reservation", { p_reservation_id: id });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("رزرو لغو شد.");
      await qc.invalidateQueries({ queryKey: ["session-reservations", user.id] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const loading = enrollments.isPending || occurrences.isPending || reservations.isPending;
  const error = enrollments.error ?? occurrences.error ?? reservations.error;
  const enrolled = new Set((enrollments.data ?? []).map((e) => e.class_id));
  const mine = reservations.data ?? [];
  const today = new Date().toLocaleDateString("en-CA");
  const visible = (occurrences.data ?? []).filter((o) => enrolled.has(o.class_session_id) && o.session_date >= today);

  return <>
    <PageHeader back={{ to: "/app/student/schedule", label: "برنامهٔ کلاس‌ها" }} eyebrow="جلسات ویژه" title="رزرو جلسهٔ موردی" description="جلسه‌های ویژهٔ پنجشنبه را فقط برای تاریخ اعلام‌شده رزرو کنید. رزرو با حضور واقعی تفاوت دارد و حضور در روز کلاس جداگانه ثبت می‌شود." />
    <Section title="جلسات قابل رزرو">
      {loading ? <LoadingRows rows={3}/> : error ? <ErrorState error={error} onRetry={() => { void occurrences.refetch(); void reservations.refetch(); }} /> : visible.length === 0 ? <EmptyState title="جلسهٔ موردی فعالی برای کلاس‌های شما اعلام نشده است" /> :
        <ul className="space-y-3">{visible.map((o) => {
          const active = mine.find((r) => r.occurrence_id === o.id && r.status === "reserved");
          const closed = o.status !== "scheduled" || !o.reservations_open || o.session_date < today;
          return <li key={o.id} className="surface space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{o.class_type}</p><p className="text-sm text-muted-foreground">{o.session_date} · {o.start_time.slice(0,5)} تا {o.end_time.slice(0,5)}</p></div>
              <span className="text-xs text-muted-foreground">{o.status === "cancelled" ? "لغوشده" : closed ? "رزرو بسته" : "قابل رزرو"}</span>
            </div>
            {o.announcement && <p className="text-sm leading-7">{o.announcement}</p>}
            <p className="text-xs text-muted-foreground">ظرفیت: {o.capacity ? toPersianDigits(o.capacity) : "نامحدود"}</p>
            {active ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium text-emerald-700">رزرو شما ثبت شده است</span><Button size="sm" variant="outline" disabled={cancel.isPending || closed} onClick={() => cancel.mutate(active.id)}>لغو رزرو</Button></div>
              : <Button size="sm" disabled={closed || reserve.isPending} onClick={() => reserve.mutate(o.id)}>{closed ? "رزرو در دسترس نیست" : "رزرو این جلسه"}</Button>}
          </li>;
        })}</ul>}
    </Section>
  </>;
}
