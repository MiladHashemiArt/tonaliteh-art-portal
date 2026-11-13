import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, qk, sessionsQuery } from "@/lib/backend/queries";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";
import {
  recurrenceLabel,
  sessionTitle,
  sortSessions,
  weekdayLabel,
} from "@/lib/domain/schedule";

export const Route = createFileRoute("/app/staff/classes")({
  head: () => ({ meta: [{ title: "کلاس‌ها | تنالیته" }] }),
  component: StaffClassesPage,
});

function StaffClassesPage() {
  const { role } = useAppSession();
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const [anchors, setAnchors] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const session of sessions.data ?? []) {
      next[session.id] = session.recurrence_anchor_date ?? "";
    }
    setAnchors(next);
  }, [sessions.data]);

  const saveAnchor = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase
        .from("class_sessions")
        .update({ recurrence_anchor_date: date || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تاریخ شروع دوره ذخیره شد.");
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const rows = sortSessions((sessions.data ?? []).filter((session) => session.is_active !== false));
  const alternating = rows.filter((session) => (session.recurrence_weeks ?? 1) > 1);

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow={role === "manager" ? "مدیریت آموزشگاه" : "مدیریت آموزشی"}
        title="برنامه کلاس‌ها"
        description="برنامه هفتگی کلاس‌ها و تنظیم تاریخ شروع جلسات یک هفته در میان."
      />

      {sessions.isPending ? (
        <LoadingRows rows={4} />
      ) : sessions.error ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="هنوز کلاسی تعریف نشده است" />
      ) : (
        <div className="space-y-8">
          <Section title={`جلسات فعال · ${toPersianDigits(rows.length)}`}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((session) => (
                <li key={session.id} className="surface min-w-0 space-y-2 p-4">
                  <p className="font-display font-semibold">{sessionTitle(session)}</p>
                  <p className="text-sm text-muted-foreground">
                    {weekdayLabel(session.class_day)} · {sessionTimeRange(session)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recurrenceLabel(session.recurrence_weeks)}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="تنظیم تقویم شمسی جلسات یک هفته در میان">
            <p className="mb-4 text-sm leading-7 text-muted-foreground">
              تاریخ شروع، جمعه یا پنجشنبه‌ای را مشخص می‌کند که چرخه برگزاری از آن آغاز می‌شود.
              تاریخ انتخاب‌شده در ادامه به تقویم شمسی نمایش داده می‌شود.
            </p>
            {alternating.length === 0 ? (
              <EmptyState title="جلسه یک هفته در میان تعریف نشده است" />
            ) : (
              <ul className="space-y-4">
                {alternating.map((session) => {
                  const date = anchors[session.id] ?? "";
                  const changed = date !== (session.recurrence_anchor_date ?? "");
                  return (
                    <li key={session.id} className="surface min-w-0 space-y-3 p-4">
                      <div>
                        <p className="font-semibold">{weekdayLabel(session.class_day)} · {sessionTimeRange(session)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{sessionTitle(session)}</p>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <label htmlFor={`anchor-${session.id}`} className="text-sm font-medium">
                          تاریخ شروع دوره
                        </label>
                        <Input
                          id={`anchor-${session.id}`}
                          type="date"
                          className="box-border min-w-0 max-w-full"
                          value={date}
                          onChange={(event) =>
                            setAnchors((previous) => ({ ...previous, [session.id]: event.target.value }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {date ? `تاریخ شمسی: ${formatDateFa(date, true)}` : "هنوز تاریخ شروع تعیین نشده است."}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={!changed || !date || saveAnchor.isPending}
                        onClick={() => saveAnchor.mutate({ id: session.id, date })}
                      >
                        {saveAnchor.isPending ? "در حال ذخیره…" : "ذخیره تاریخ شروع"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
