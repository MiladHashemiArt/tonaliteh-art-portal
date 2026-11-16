import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentInfoCard } from "@/components/app/PaymentInfoCard";
import { PaymentStatusBadge, paymentStatusInfo } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, myPaymentsQuery, qk } from "@/lib/backend/queries";
import type { StudentSubscriptionRow } from "@/lib/backend/types";
import { formatAmountFa, formatDateFa, toLatinDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/payments")({
  head: () => ({ meta: [{ title: "پرداخت‌ها | تنالیته" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const payments = useQuery(myPaymentsQuery(user.id));
  const subscriptions = useQuery({
    queryKey: ["subscriptions", "mine", user.id],
    queryFn: async (): Promise<StudentSubscriptionRow[]> => {
      const { data, error } = await supabase.from("student_subscriptions")
        .select("id,student_id,duration_months,sessions_per_month,total_sessions,consumed_sessions,remaining_sessions,monthly_price,total_price,discount_applied,starts_on,ends_on,status,created_at")
        .eq("student_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentSubscriptionRow[];
    },
  });
  const [trackingCode, setTrackingCode] = useState("");
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const paymentBySubscription = new Map(
    (payments.data ?? []).filter((p) => p.subscription_id).map((p) => [p.subscription_id!, p]),
  );
  const pendingSubscriptions = useMemo(
    () => (subscriptions.data ?? []).filter((s) => {
      if (s.status !== "pending_payment") return false;
      const existing = paymentBySubscription.get(s.id);
      return !existing || existing.status === "rejected";
    }),
    [subscriptions.data, payments.data],
  );
  const paidTotal = (payments.data ?? [])
    .filter((p) => paymentStatusInfo(p.status).tone === "success")
    .reduce((sum, p) => sum + (Number(toLatinDigits(String(p.amount ?? 0))) || 0), 0);

  const submit = useMutation({
    mutationFn: async () => {
      const subscription = pendingSubscriptions.find((s) => s.id === selectedSubscription);
      if (!subscription) throw new Error("ابتدا یک اشتراک در انتظار پرداخت انتخاب کنید.");
      if (!trackingCode.trim()) throw new Error("شماره پیگیری واریز را وارد کنید.");
      setSubmitting(true);
      const { error } = await supabase.from("payments").insert({
        student_id: user.id,
        subscription_id: subscription.id,
        amount: Number(subscription.total_price),
        payment_date: new Date().toISOString(),
        status: "pending",
        payment_type: "tuition",
        payment_method: "bank_transfer",
        tracking_code: trackingCode.trim(),
        description: "واریز شهریهٔ اشتراک",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("رسید پرداخت برای بررسی آموزشگاه ثبت شد.");
      setTrackingCode("");
      setSelectedSubscription("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.myPayments(user.id) }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions", "mine", user.id] }),
      ]);
    },
    onError: (error) => toast.error(friendlyError(error)),
    onSettled: () => setSubmitting(false),
  });

  return (
    <>
      <PageHeader back={{ to: "/app/student", label: "خانه" }} eyebrow="مالی" title="پرداخت‌ها"
        description="درخواست‌های اشتراک، ثبت واریز و سوابق پرداخت شما." />
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Section title="اشتراک‌های من">
            {subscriptions.isPending ? <LoadingRows /> : subscriptions.error ? (
              <ErrorState error={subscriptions.error} onRetry={() => subscriptions.refetch()} />
            ) : !subscriptions.data?.length ? (
              <EmptyState title="اشتراکی ثبت نشده است" description="پس از انتخاب بسته در بخش کلاس‌ها، درخواست شما اینجا نمایش داده می‌شود." />
            ) : <ul className="space-y-3">{subscriptions.data.map((s) => (
              <li key={s.id} className="surface space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{s.duration_months} ماه · {s.sessions_per_month} جلسه در ماه</strong>
                  <span className="text-sm">{s.status === "pending_payment" ? "در انتظار پرداخت" : s.status === "active" ? "فعال" : s.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">{s.total_sessions} اعتبار کل · {s.remaining_sessions} اعتبار باقی‌مانده</p>
                <p className="font-semibold">{formatAmountFa(s.total_price)}</p>
                <p className="text-xs text-muted-foreground">{formatDateFa(s.starts_on)} تا {formatDateFa(s.ends_on)}</p>
                {paymentBySubscription.has(s.id) && (
                  <p className="text-xs text-muted-foreground">وضعیت واریز: {paymentBySubscription.get(s.id)?.status === "paid" ? "تأیید شده" : paymentBySubscription.get(s.id)?.status === "rejected" ? "رد شده؛ امکان ثبت مجدد وجود دارد" : "در انتظار بررسی"}</p>
                )}
              </li>
            ))}</ul>}
          </Section>
          {pendingSubscriptions.length > 0 && (
            <Section title="ثبت واریز اشتراک">
              <div className="surface space-y-4 p-4">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">اشتراک موردنظر</span>
                  <select className="h-11 w-full rounded-xl border border-input bg-background px-3"
                    value={selectedSubscription} onChange={(e) => setSelectedSubscription(e.target.value)}>
                    <option value="">انتخاب کنید…</option>
                    {pendingSubscriptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.duration_months} ماه · {s.sessions_per_month} جلسه ماهانه · {formatAmountFa(s.total_price)}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">شماره پیگیری واریز</span>
                  <Input value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} placeholder="شماره پیگیری بانکی" maxLength={100} />
                </label>
                <Button className="w-full" disabled={!selectedSubscription || !trackingCode.trim() || submit.isPending || submitting}
                  onClick={() => submit.mutate()}>{submit.isPending ? "در حال ثبت…" : "ارسال رسید برای بررسی"}</Button>
                <p className="text-xs leading-6 text-muted-foreground">پس از ثبت، پرداخت در وضعیت «در انتظار بررسی» می‌ماند و اشتراک فقط بعد از تأیید آموزشگاه فعال می‌شود.</p>
              </div>
            </Section>
          )}
          <Section title="سوابق پرداخت">
            {payments.isPending ? <LoadingRows /> : payments.error ? (
              <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
            ) : !payments.data?.length ? (
              <EmptyState title="پرداختی ثبت نشده است" description="سوابق واریز شما پس از ثبت در این بخش نمایش داده می‌شود." />
            ) : <>
              <p className="mb-4 text-sm text-muted-foreground">جمع پرداخت‌های تأییدشده: <span className="font-semibold text-foreground">{formatAmountFa(paidTotal)}</span></p>
              <ul className="space-y-3">{payments.data.map((p) => (
                <li key={String(p.id)} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><p className="font-display font-semibold">{formatAmountFa(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatDateFa(p.payment_date)}</p>
                    {p.description && <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>}
                    {p.tracking_code && <p className="text-xs text-muted-foreground">پیگیری: {p.tracking_code}</p>}
                  </div><PaymentStatusBadge status={p.status} />
                </li>
              ))}</ul>
            </>}
          </Section>
        </div>
        <aside><Section title="واریز شهریه"><PaymentInfoCard /></Section></aside>
      </div>
    </>
  );
}
