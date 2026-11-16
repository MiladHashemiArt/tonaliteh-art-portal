import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { SessionMeta, sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, myEnrollmentsQuery, qk, sessionsQuery } from "@/lib/backend/queries";
import type { ClassSessionRow } from "@/lib/backend/types";
import { formatAmountFa, toPersianDigits } from "@/lib/domain/persian";
import { quoteSubscription, type MonthlySessionCount, type SubscriptionDuration } from "@/lib/domain/subscriptions";
import {
  diffEnrollments,
  normalizeWeekday,
  sessionTitle,
  sortSessions,
  weekdayLabel,
} from "@/lib/domain/schedule";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/student/schedule")({
  head: () => ({ meta: [{ title: "برنامهٔ کلاس‌ها | تنالیته" }] }),
  component: SchedulePage,
});

function groupByDay(sessions: ClassSessionRow[]) {
  const groups: { key: string; label: string; items: ClassSessionRow[] }[] = [];
  for (const s of sortSessions(sessions)) {
    const key = String(normalizeWeekday(s.class_day) ?? s.class_day);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: weekdayLabel(s.class_day), items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups;
}

function SchedulePage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const current = useMemo(
    () => (enrollments.data ?? []).map((e) => String(e.class_id)),
    [enrollments.data],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<SubscriptionDuration>(1);
  const [sessionsPerMonth, setSessionsPerMonth] = useState<MonthlySessionCount>(4);
  const [startsOn, setStartsOn] = useState(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  });

  useEffect(() => setSelected(new Set(current)), [current]);

  const { toAdd, toRemove } = diffEnrollments(current, [...selected]);
  const dirty = toAdd.length + toRemove.length > 0;
  const quote = quoteSubscription(duration, sessionsPerMonth);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected.size) throw new Error("حداقل یک سانس هفتگی انتخاب کنید.");
      if (!startsOn) throw new Error("تاریخ شروع اشتراک را انتخاب کنید.");
      const { error } = await supabase.rpc("tonaliteh_create_subscription", {
        _duration_months: duration,
        _sessions_per_month: sessionsPerMonth,
        _class_session_ids: [...selected],
        _starts_on: startsOn,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("درخواست اشتراک ثبت شد و پس از تأیید آموزشگاه فعال می‌شود.");
      await queryClient.invalidateQueries({ queryKey: qk.myEnrollments(user.id) });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const loading = sessions.isPending || enrollments.isPending;
  const error = sessions.error ?? enrollments.error;
  const groups = groupByDay(sessions.data ?? []);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="برنامهٔ هفتگی"
        title="انتخاب کلاس‌ها"
        description="مدت اشتراک و تعداد جلسات ماهانه را انتخاب کنید، سپس سانس‌های هفتگی دلخواهتان را مشخص کنید. پنجشنبه یک هفته در میان برگزار می‌شود."
      />

      {loading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            sessions.refetch();
            enrollments.refetch();
          }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="هنوز کلاسی تعریف نشده است"
          description="برنامهٔ کلاس‌ها به‌زودی منتشر می‌شود."
        />
      ) : (
        <div className="min-w-0 max-w-full space-y-8 overflow-hidden">
          {groups.map((g) => (
            <section
              key={g.key}
              aria-labelledby={`day-${g.key}`}
              className="min-w-0 max-w-full overflow-hidden"
            >
              <h2 id={`day-${g.key}`} className="mb-3 text-lg font-semibold">
                {g.label}
              </h2>
              <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
                {g.items.map((s) => {
                  const id = String(s.id);
                  const on = selected.has(id);
                  const inactive = s.is_active === false;
                  const disabled = inactive && !current.includes(id);
                  return (
                    <li key={id} className="min-w-0 max-w-full overflow-hidden">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        disabled={disabled}
                        onClick={() => toggle(id)}
                        className={cn(
                          "surface flex w-full min-w-0 max-w-full items-start gap-3 overflow-hidden p-3 text-start transition-all sm:gap-4 sm:p-4",
                          on ? "border-bronze ring-2 ring-bronze/25" : "hover:border-bronze/50",
                          disabled && "cursor-not-allowed opacity-55",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                            on
                              ? "border-bronze bg-bronze text-primary-foreground"
                              : "border-input bg-card",
                          )}
                          aria-hidden
                        >
                          {on && <Check className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="block break-words font-display font-semibold">
                            {sessionTitle(s)}
                          </span>
                          <span className="block break-words text-sm text-muted-foreground">
                            {sessionTimeRange(s)}
                          </span>
                          <SessionMeta session={s} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="surface mt-8 space-y-5 p-4 sm:p-6" aria-labelledby="subscription-package">
        <div>
          <p className="text-xs text-bronze">اشتراک هنرجو</p>
          <h2 id="subscription-package" className="mt-1 font-display text-lg font-semibold">انتخاب بستهٔ ماهانه</h2>
          <p className="mt-1 text-sm text-muted-foreground">۴، ۸ یا ۱۲ جلسه اعتبار در هر ماه؛ اعتبار کل با مدت اشتراک افزایش می‌یابد.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">مدت اشتراک</p>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map((value) => (
              <button key={value} type="button" aria-pressed={duration === value}
                onClick={() => setDuration(value)}
                className={cn("rounded-xl border px-3 py-3 text-sm transition-colors", duration === value ? "border-bronze bg-bronze/10 text-foreground" : "border-border hover:border-bronze/50")}>
                {toPersianDigits(value)} ماه
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">تعداد جلسات در هر ماه</p>
          <div className="grid grid-cols-3 gap-2">
            {([4, 8, 12] as const).map((value) => (
              <button key={value} type="button" aria-pressed={sessionsPerMonth === value}
                onClick={() => setSessionsPerMonth(value)}
                className={cn("rounded-xl border px-3 py-3 text-sm transition-colors", sessionsPerMonth === value ? "border-bronze bg-bronze/10 text-foreground" : "border-border hover:border-bronze/50")}>
                {toPersianDigits(value)} جلسه
              </button>
            ))}
          </div>
        </div>
        <label className="block space-y-2 text-sm">
          <span className="font-medium">تاریخ شروع اشتراک</span>
          <input type="date" value={startsOn} min={new Date().toLocaleDateString("en-CA")}
            onChange={(event) => setStartsOn(event.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3" />
        </label>
        <div className="rounded-xl bg-muted/60 p-4 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">اعتبار کل دوره</span><strong>{toPersianDigits(quote.totalSessions)} جلسه</strong></div>
          <div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">شهریهٔ ماهانه</span><strong>{formatAmountFa(quote.monthlyPriceToman)}</strong></div>
          <div className="mt-2 flex justify-between gap-3"><span className="text-muted-foreground">مبلغ کل دوره</span><strong className="text-base text-foreground">{formatAmountFa(quote.totalPriceToman)}</strong></div>
          <p className="mt-3 text-xs text-muted-foreground">مبالغ به تومان است. تخفیف‌های احتمالی فقط با تأیید استاد یا مدیریت اعمال می‌شوند. اشتراک پس از تأیید پرداخت فعال خواهد شد.</p>
        </div>
      </section>

      <div className="sticky bottom-20 z-20 mt-8 lg:bottom-6">
        <div className="surface flex flex-wrap items-center justify-between gap-3 p-3 shadow-lift">
          <p className="ps-2 text-sm text-muted-foreground" aria-live="polite">
            {toPersianDigits(selected.size)} سانس هفتگی انتخاب شده
            {dirty && " · تغییرات ذخیره نشده"}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setSelected(new Set(current))}>
                انصراف
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!selected.size || !startsOn || save.isPending}>
              {save.isPending ? "در حال ثبت…" : "ثبت درخواست اشتراک"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
