import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Send } from "lucide-react";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import { formatDateFa, formatTimeFa } from "@/lib/domain/persian";

const db = supabase as unknown as SupabaseClient<any>;

export const Route = createFileRoute("/app/student/messages")({
  head: () => ({ meta: [{ title: "پیام به آموزشگاه | تنالیته" }] }),
  component: StudentMessagesPage,
});

function StudentMessagesPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const messages = useQuery({
    queryKey: ["student-messages", user.id],
    queryFn: async () => {
      const { data, error } = await db.from("student_messages").select("*")
        .eq("student_id", user.id).order("created_at", { ascending: true }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20000,
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!message.trim()) throw new Error("متن پیام را بنویسید.");
      const { error } = await db.from("student_messages").insert({
        student_id: user.id, sender_id: user.id, body: message.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage("");
      toast.success("پیام شما برای استاد و مدیریت ارسال شد.");
      await qc.invalidateQueries({ queryKey: ["student-messages", user.id] });
    },
    onError: error => toast.error(friendlyError(error)),
  });
  const unread = (messages.data ?? []).some((item: any) => item.sender_id !== user.id && !item.read_at);
  const markRead = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("student_messages").update({ read_at: new Date().toISOString() })
        .eq("student_id", user.id).neq("sender_id", user.id).is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["student-messages", user.id] }),
  });

  return <>
    <PageHeader back={{ to: "/app/student", label: "بازگشت به پنل" }} eyebrow="ارتباط مستقیم"
      title="پیام به آموزشگاه" description="پیام شما برای استاد و مدیریت ارسال می‌شود؛ پاسخ‌ها را همین‌جا دریافت می‌کنید." />
    <Section title="گفت‌وگوی خصوصی">
      {messages.isPending ? <LoadingRows rows={3} /> : messages.error ? <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
      : <div className="surface space-y-3 p-4">
        {unread && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bronze/10 p-3 text-sm">
          <span>پاسخ خوانده‌نشده دارید.</span>
          <Button size="sm" variant="outline" onClick={() => markRead.mutate()} disabled={markRead.isPending}>خوانده شد</Button>
        </div>}
        <div className="max-h-[28rem] space-y-3 overflow-y-auto">
          {messages.data?.length ? messages.data.map((item: any) => {
            const mine = item.sender_id === user.id;
            return <div key={item.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${mine ? "mr-auto bg-primary text-primary-foreground" : "ml-auto bg-muted"}`}>
              <p className="whitespace-pre-wrap break-words leading-6">{item.body}</p>
              <p className={`mt-2 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatDateFa(item.created_at, true)} · {formatTimeFa(item.created_at.slice(11,16))}</p>
            </div>;
          }) : <EmptyState title="هنوز پیامی ارسال نشده است" description="اگر پرسشی دارید، پیام خود را از کادر پایین ارسال کنید." />}
        </div>
        <form className="space-y-2 border-t border-border pt-3" onSubmit={event => { event.preventDefault(); send.mutate(); }}>
          <Textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={4000} placeholder="پیام خود را بنویسید…" />
          <div className="flex justify-end"><Button type="submit" disabled={!message.trim() || send.isPending}><Send className="size-4" /> ارسال پیام</Button></div>
        </form>
      </div>}
    </Section>
  </>;
}
