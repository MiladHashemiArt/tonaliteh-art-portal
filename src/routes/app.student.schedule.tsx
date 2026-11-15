import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Upload, Wallet } from "lucide-react";
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
import { normalizeWeekday, sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";
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
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const settings = useQuery(settingsQuery());
  const current = useMemo(
    () => (enrollments.data ?? []).map((e) => String(e.class_id)),
    [enrollments.data],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paymentAttemptId, setPaymentAttemptId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  useEffect(() => setSelected(new Set(current)), [current]);

  const toAdd = [...selected].filter((id) => !current.includes(id));
  const dirty = toAdd.length > 0;

  const save = useMutation({
    mutationFn: async () => {
      if (![1, 4, 8, 12].includes(toAdd.length)) {
        throw new Error("برای ثبت سفارش، باید ۱، ۴، ۸ یا ۱۲ جلسهٔ جدید انتخاب کنید.");
      }
      const { data: orderId, error: orderError } = await supabase.rpc(
        "create_tuition_order",
        { p_class_session_ids: toAdd },
      );
      if (orderError) throw orderError;
      const { data: attemptId, error: attemptError } = await supabase.rpc(
        "start_manual_tuition_payment",
        { p_order_id: orderId },
      );
      if (attemptError) throw attemptError;
      return attemptId;
    },
    onSuccess: (attemptId) => {
      setPaymentAttemptId(attemptId);
      toast.success("سفارش ساخته شد؛ رسید انتقال وجه را بارگذاری کنید.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const submitReceipt = useMutation({
    mutationFn: async () => {
      if (!paymentAttemptId || !receiptFile) {
        throw new Error("ابتدا تصویر یا فایل رسید را انتخاب کنید.");
      }
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowed.includes(receiptFile.type)) {
        throw new Error("فرمت رسید باید JPG، PNG، WebP یا PDF باشد.");
      }
      if (receiptFile.size > 5 * 1024 * 1024) {
        throw new Error("حجم فایل رسید نباید بیشتر از ۵ مگابایت باشد.");
      }
      const safeName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const objectPath = `${user.id}/${paymentAttemptId}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("tuition-receipts")
        .upload(objectPath, receiptFile, { upsert: false, contentType: receiptFile.type });
      if (uploadError) throw uploadError;
      const { error } = await supabase.rpc("submit_manual_tuition_receipt", {
        p_payment_attempt_id: paymentAttemptId,
        p_receipt_object_path: objectPath,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPaymentAttemptId(null);
      setReceiptFile(null);
      toast.success("رسید ارسال شد و پس از بررسی استاد، ثبت‌نام نهایی می‌شود.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (current.includes(id)) return prev;
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
        description="۱، ۴، ۸ یا ۱۲ جلسهٔ جدید انتخاب کنید. پس از ساخت سفارش، رسید پرداخت را ارسال کنید. کلاس پنجشنبه یک هفته در میان برگزار می‌شود."
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
            {toPersianDigits(toAdd.length)} جلسهٔ جدید برای سفارش انتخاب شده
            {current.length > 0 && ` · ${toPersianDigits(current.length)} جلسه ثبت‌شده`}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setSelected(new Set(current))}>
                انصراف
              </Button>
            )}
            <Button
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending || Boolean(paymentAttemptId)}
            >
              {save.isPending ? "در حال ساخت سفارش…" : "ادامه به پرداخت"}
            </Button>
          </div>
        </div>
      </div>

      {paymentAttemptId && (
        <section className="surface mt-6 space-y-3 p-4" aria-labelledby="receipt-title">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-bronze" aria-hidden />
            <h2 id="receipt-title" className="font-display font-semibold">
              ارسال رسید کارت‌به‌کارت
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            پس از انتقال وجه به شماره‌حساب اعلام‌شده توسط آموزشگاه، تصویر یا PDF رسید را انتخاب و
            ارسال کنید. ثبت‌نام پس از تأیید پرداخت توسط مدیریت یا استاد قطعی خواهد شد.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-2"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => submitReceipt.mutate()}
              disabled={!receiptFile || submitReceipt.isPending}
            >
              {submitReceipt.isPending ? "در حال ارسال رسید…" : "ارسال رسید برای بررسی"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPaymentAttemptId(null);
                setReceiptFile(null);
              }}
            >
              انصراف
            </Button>
          </div>
        </section>
      )}

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
