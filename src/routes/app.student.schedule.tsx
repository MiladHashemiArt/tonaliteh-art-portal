import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Wallet } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { SessionMeta, sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import {
  friendlyError,
  myEnrollmentsQuery,
  qk,
  sessionsQuery,
  settingsQuery,
} from "@/lib/backend/queries";
import type { ClassSessionRow } from "@/lib/backend/types";
import { toPersianDigits } from "@/lib/domain/persian";
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
  const settings = useQuery(settingsQuery());
  const current = useMemo(
    () => (enrollments.data ?? []).map((e) => String(e.class_id)),
    [enrollments.data],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => setSelected(new Set(current)), [current]);

  const { toAdd, toRemove } = diffEnrollments(current, [...selected]);
  const dirty = toAdd.length + toRemove.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (toAdd.length) {
        // Upsert with ignoreDuplicates relies on the unique (student_id, class_id) constraint.
        const { error } = await supabase.from("enrollments").upsert(
          toAdd.map((class_id) => ({ student_id: user.id, class_id })),
          { onConflict: "student_id,class_id", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("enrollments")
          .delete()
          .eq("student_id", user.id)
          .in("class_id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => toast.success("انتخاب کلاس‌ها ذخیره شد."),
    onError: (e) => toast.error(friendlyError(e)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.myEnrollments(user.id) }),
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
        description="هر تعداد جلسه که می‌خواهید علامت بزنید و سپس ذخیره کنید. کلاس پنجشنبه یک هفته در میان برگزار می‌شود."
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

      <div className="sticky bottom-20 z-20 mt-8 lg:bottom-6">
        <div className="surface flex flex-wrap items-center justify-between gap-3 p-3 shadow-lift">
          <p className="ps-2 text-sm text-muted-foreground" aria-live="polite">
            {toPersianDigits(selected.size)} جلسه انتخاب شده
            {dirty && " · تغییرات ذخیره نشده"}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setSelected(new Set(current))}>
                انصراف
              </Button>
            )}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
              {save.isPending ? "در حال ذخیره…" : "ذخیرهٔ انتخاب"}
            </Button>
          </div>
        </div>
      </div>

      <section aria-labelledby="class-pricing-title" className="mt-12 space-y-4">
        <div className="space-y-1">
          <h2 id="class-pricing-title" className="font-display text-lg font-semibold">
            تعرفهٔ بسته‌های کلاس
          </h2>
          <p className="text-xs text-muted-foreground">
            برای اطلاع از هزینه‌ها؛ جزئیات ثبت‌نام و پرداخت در فرایند ثبت‌نام نمایش داده خواهد شد.
          </p>
        </div>
        {settings.isPending ? (
          <div className="surface p-4 text-sm text-muted-foreground">در حال دریافت تعرفه‌ها…</div>
        ) : settings.error ? (
          <div className="surface p-4 text-sm text-muted-foreground">دریافت تعرفه‌ها ممکن نشد.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { title: "۴ جلسه", price: settings.data.values.package_4_price ?? "3000000" },
              {
                title: "۸ جلسه",
                price:
                  settings.data.values.package_8_discount_price ??
                  settings.data.values.package_8_price ??
                  "6000000",
                oldPrice: settings.data.values.package_8_price,
              },
              {
                title: "۱۲ جلسه",
                price:
                  settings.data.values.package_12_discount_price ??
                  settings.data.values.package_12_price ??
                  "9000000",
                oldPrice: settings.data.values.package_12_price,
              },
              ...(settings.data.values.single_session_enabled === "false"
                ? []
                : [
                    {
                      title: "تک‌جلسه‌ای",
                      price: settings.data.values.single_session_price ?? "750000",
                    },
                  ]),
            ].map((item) => {
              const amount = Number(item.price);
              const oldAmount = Number(item.oldPrice);
              const hasDiscount =
                Boolean(item.oldPrice) &&
                Number.isSafeInteger(oldAmount) &&
                Number.isSafeInteger(amount) &&
                oldAmount > amount &&
                amount > 0;
              const format = (value: number) =>
                Number.isSafeInteger(value) && value > 0
                  ? toPersianDigits(value.toLocaleString("en-US")) + " تومان"
                  : "استعلام از آموزشگاه";
              return (
                <article
                  key={item.title}
                  className="surface flex min-h-24 flex-col justify-between gap-2 p-3 sm:p-4"
                >
                  <div className="flex items-center gap-2 text-xs text-bronze">
                    <Wallet className="size-3.5" aria-hidden />
                    {item.title}
                  </div>
                  <div>
                    {hasDiscount && (
                      <p className="text-[11px] text-muted-foreground line-through">
                        {format(oldAmount)}
                      </p>
                    )}
                    <p className="text-sm font-semibold tabular-nums sm:text-base">
                      {format(amount)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
