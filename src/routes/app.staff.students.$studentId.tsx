import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Phone, MapPin, Image as ImageIcon, Send } from "lucide-react";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import { formatAmountFa, formatDateFa, formatTimeFa, toPersianDigits } from "@/lib/domain/persian";

const db = supabase as unknown as SupabaseClient<any>;

export const Route = createFileRoute("/app/staff/students/$studentId")({
  head: () => ({ meta: [{ title: "پرونده هنرجو | تنالیته" }] }),
  component: StudentRecordPage,
});

function StudentRecordPage() {
  const { studentId } = Route.useParams();
  const { user } = useAppSession();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");

  const record = useQuery({
    queryKey: ["staff-student-record", studentId],
    queryFn: async () => {
      const [profile, enrollments, absences, attendance, payments, artworks, messages] = await Promise.all([
        db.from("profiles").select("id,full_name,phone,role,created_at,home_address").eq("id", studentId).maybeSingle(),
        db.from("enrollments").select("id,student_id,class_id,created_at").eq("student_id", studentId).order("created_at", { ascending: false }),
        db.from("absences").select("*").eq("student_id", studentId).order("absence_date", { ascending: false }),
        db.from("attendance_records").select("*").eq("student_id", studentId).order("session_date", { ascending: false }).limit(200),
        db.from("payments").select("*").eq("student_id", studentId).order("payment_date", { ascending: false }),
        db.from("student_artworks").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
        db.from("student_messages").select("*").eq("student_id", studentId).order("created_at", { ascending: true }).limit(200),
      ]);
      for (const result of [profile, enrollments, absences, attendance, payments, artworks, messages]) {
        if (result.error) throw result.error;
      }
      const sessionsResult = await db.from("class_sessions").select("*");
      if (sessionsResult.error) throw sessionsResult.error;
      const imageRows = await Promise.all((artworks.data ?? []).map(async (artwork: any) => {
        const { data, error } = await supabase.storage.from("student-artworks").createSignedUrl(artwork.object_path, 3600);
        return { ...artwork, imageUrl: error ? null : data?.signedUrl ?? null };
      }));
      return {
        profile: profile.data,
        enrollments: enrollments.data ?? [],
        absences: absences.data ?? [],
        attendance: attendance.data ?? [],
        payments: payments.data ?? [],
        artworks: imageRows,
        messages: messages.data ?? [],
        sessions: sessionsResult.data ?? [],
      };
    },
    refetchInterval: 30000,
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      const body = message.trim();
      if (!body) throw new Error("متن پیام را بنویسید.");
      const { error } = await db.from("student_messages").insert({
        student_id: studentId, sender_id: user.id, body,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("");
      toast.success("پیام ارسال شد و اعلان آن برای هنرجو ثبت شد.");
      await qc.invalidateQueries({ queryKey: ["staff-student-record", studentId] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const markRead = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("student_messages").update({ read_at: new Date().toISOString() })
        .eq("student_id", studentId).neq("sender_id", user.id).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-student-record", studentId] }),
  });

  const data = record.data;
  const sessionById = useMemo(() => new Map((data?.sessions ?? []).map((s: any) => [String(s.id), s])), [data?.sessions]);
  const enrolledSessions = useMemo(() => (data?.enrollments ?? []).map((enrollment: any) => ({
    ...enrollment, session: sessionById.get(String(enrollment.class_id)),
  })), [data?.enrollments, sessionById]);
  const unread = (data?.messages ?? []).some((item: any) => item.sender_id === studentId && !item.read_at);

  return <>
    <PageHeader back={{ to: "/app/staff/students", label: "بازگشت به هنرجویان" }}
      eyebrow="مدیریت آموزشگاه" title={data?.profile?.full_name || "پرونده هنرجو"}
      description="اطلاعات تماس، برنامه آموزشی، حضور و غیاب، پرداخت‌ها، آثار و گفت‌وگوی اختصاصی." />
    {record.isPending ? <LoadingRows rows={5} /> : record.error ? <ErrorState error={record.error} onRetry={() => void record.refetch()} />
    : !data?.profile ? <EmptyState title="پرونده هنرجو پیدا نشد" description="ممکن است حساب کاربری حذف شده یا دسترسی آن محدود باشد." />
    : <>
      <Section title="اطلاعات و راه‌های تماس">
        <div className="surface space-y-3 p-4 sm:p-5">
          <p className="font-display text-xl font-semibold">{data.profile.full_name || "هنرجوی بدون نام"}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="size-4 text-bronze" />
              {data.profile.phone ? <div className="flex flex-wrap gap-3" dir="ltr">
                <a className="hover:text-bronze" href={`tel:${data.profile.phone}`}>{toPersianDigits(data.profile.phone)}</a>
                <a className="text-xs text-bronze" href={`sms:${data.profile.phone}`}>پیامک</a>
              </div> : "شماره تماس ثبت نشده"}
            </div>
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" />
              {data.profile.home_address ? <div className="min-w-0 space-y-1">
                <p className="break-words">{data.profile.home_address}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <a className="text-bronze hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.profile.home_address)}`}>نقشه گوگل</a>
                  <a className="text-bronze hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(data.profile.home_address)}`}>نقشه جایگزین</a>
                </div>
              </div> : "نشانی ثبت نشده"}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">عضویت: {formatDateFa(data.profile.created_at, true)}</p>
        </div>
      </Section>

      <Section title={`کلاس‌های انتخاب‌شده · ${toPersianDigits(enrolledSessions.length)}`}>
        {enrolledSessions.length ? <ul className="grid gap-2 sm:grid-cols-2">{enrolledSessions.map((item: any) =>
          <li key={item.id} className="surface p-3 text-sm">
            <p className="font-semibold">{item.session?.class_type || "کلاس"}</p>
            <p className="mt-1 text-muted-foreground">{item.session?.class_day || "روز نامشخص"} · {formatTimeFa(item.session?.start_time)} تا {formatTimeFa(item.session?.end_time)}</p>
            <p className="mt-1 text-xs text-muted-foreground">ثبت‌نام: {formatDateFa(item.created_at)}</p>
          </li>)}</ul> : <EmptyState title="کلاسی برای این هنرجو ثبت نشده است" />}
      </Section>

      <Section title={`حضور و غیاب · ${toPersianDigits(data.attendance.length)}`}>
        {data.attendance.length ? <ul className="space-y-2">{data.attendance.map((item: any) =>
          <li key={item.id} className="surface flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>{formatDateFa(item.session_date, true)}</span>
            <span className="text-muted-foreground">{({present:"حاضر",prior_notice_absence:"غیبت با اطلاع",no_notice_absence:"غیبت بدون اطلاع",pending:"ثبت‌نشده"} as Record<string,string>)[item.status] || item.status}</span>
            {item.note && <p className="w-full text-xs text-muted-foreground">{item.note}</p>}
          </li>)}</ul> : <EmptyState title="سابقه‌ای برای حضور و غیاب ثبت نشده است" />}
        <p className="mt-3 text-xs text-muted-foreground">گزارش‌های اعلام غیبت: {toPersianDigits(data.absences.length)}</p>
        {data.absences.map((item: any) => <p key={item.id} className="mt-2 rounded-lg bg-muted/50 p-3 text-sm">{formatDateFa(item.absence_date, true)}{item.description ? ` · ${item.description}` : ""}</p>)}
      </Section>

      <Section title={`پرداخت‌ها · ${toPersianDigits(data.payments.length)}`}>
        {data.payments.length ? <ul className="space-y-2">{data.payments.map((item: any) =>
          <li key={item.id} className="surface flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div><p className="font-semibold">{formatAmountFa(item.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{item.description || "بدون توضیح"}</p></div>
            <div className="text-left text-xs text-muted-foreground">{item.status || "وضعیت نامشخص"}<p className="mt-1">{item.payment_date ? formatDateFa(item.payment_date, true) : "تاریخ ثبت نشده"}</p></div>
          </li>)}</ul> : <EmptyState title="هنوز پرداختی ثبت نشده است" />}
      </Section>

      <Section title={`آثار هنری · ${toPersianDigits(data.artworks.length)}`}>
        {data.artworks.length ? <div className="grid gap-3 sm:grid-cols-2">{data.artworks.map((item: any) =>
          <article key={item.id} className="surface overflow-hidden">
            {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full bg-muted object-contain" loading="lazy" />
              : <div className="flex aspect-[4/3] items-center justify-center bg-muted"><ImageIcon className="size-8 text-muted-foreground" /></div>}
            <div className="space-y-1 p-3"><p className="font-semibold">{item.title}</p>{item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
              <p className="text-xs text-muted-foreground">{formatDateFa(item.created_at, true)}</p>
              {item.teacher_note && <p className="rounded-lg bg-muted/50 p-2 text-sm">بازخورد: {item.teacher_note}</p>}
            </div>
          </article>)}</div> : <EmptyState title="هنوز اثری در پرونده ثبت نشده است" />}
      </Section>

      <Section title="گفت‌وگوی اختصاصی با هنرجو">
        <div className="surface space-y-3 p-4">
          {unread && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bronze/10 p-3 text-sm">
            <span>پیام خوانده‌نشده از هنرجو دارید.</span>
            <Button size="sm" variant="outline" onClick={() => markRead.mutate()} disabled={markRead.isPending}>علامت‌گذاری به‌عنوان خوانده‌شده</Button>
          </div>}
          <div className="max-h-[28rem] space-y-3 overflow-y-auto">
            {data.messages.length ? data.messages.map((item: any) => {
              const mine = item.sender_id === user.id;
              return <div key={item.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${mine ? "mr-auto bg-primary text-primary-foreground" : "ml-auto bg-muted"}`}>
                <p className="whitespace-pre-wrap break-words leading-6">{item.body}</p>
                <p className={`mt-2 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatDateFa(item.created_at, true)} · {formatTimeFa(item.created_at.slice(11,16))}</p>
              </div>;
            }) : <EmptyState title="هنوز گفت‌وگویی آغاز نشده است" description="پیام شما پس از ارسال به هنرجو اعلان می‌شود." />}
          </div>
          <form className="space-y-2 border-t border-border pt-3" onSubmit={event => { event.preventDefault(); sendMessage.mutate(); }}>
            <Textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} placeholder="پیام خود را برای هنرجو بنویسید…" />
            <div className="flex justify-end"><Button type="submit" disabled={!message.trim() || sendMessage.isPending}><Send className="size-4" /> ارسال پیام</Button></div>
          </form>
        </div>
      </Section>
    </>}
  </>;
}
