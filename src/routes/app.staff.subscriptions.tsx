import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import type { ProfileRow, StudentSubscriptionRow } from "@/lib/backend/types";
import { formatAmountFa, formatDateFa } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/subscriptions")({
  head: () => ({ meta: [{ title: "مدیریت اشتراک‌ها | تنالیته" }] }),
  component: StaffSubscriptionsPage,
});

function StaffSubscriptionsPage() {
  const client = useQueryClient();
  const [discounts, setDiscounts] = useState<Record<string, boolean>>({});
  const subscriptions = useQuery({
    queryKey: ["subscriptions", "staff"],
    queryFn: async (): Promise<StudentSubscriptionRow[]> => {
      const { data, error } = await supabase.from("student_subscriptions")
        .select("id,student_id,duration_months,sessions_per_month,total_sessions,consumed_sessions,remaining_sessions,monthly_price,total_price,discount_applied,starts_on,ends_on,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentSubscriptionRow[];
    },
  });
  const profiles = useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select("id,full_name,phone,role,created_at,home_address,avatar_path");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
  const names = useMemo(() => new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || p.phone || "هنرجو"])), [profiles.data]);

  const discount = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("student_subscriptions").update({
        discount_applied: enabled,
        discount_approved_by: enabled ? (await supabase.auth.getUser()).data.user?.id : null,
      }).eq("id", id).eq("status", "pending_payment");
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("وضعیت تخفیف به‌روزرسانی شد.");
      await client.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const approve = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").update({ status: "paid" }).eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("پرداخت تأیید شد و اشتراک فعال شد.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["subscriptions"] }),
        client.invalidateQueries({ queryKey: ["payments"] }),
      ]);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const reject = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("payments").update({ status: "rejected" }).eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("پرداخت رد شد؛ هنرجو می‌تواند دوباره واریز را ثبت کند.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["subscriptions"] }),
        client.invalidateQueries({ queryKey: ["payments"] }),
      ]);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const payments = useQuery({
    queryKey: ["payments", "subscription-linked"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments")
        .select("id,student_id,subscription_id,amount,payment_date,status,tracking_code,description")
        .not("subscription_id", "is", null).order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = subscriptions.isPending || profiles.isPending || payments.isPending;
  const error = subscriptions.error ?? profiles.error ?? payments.error;

  return <>
    <PageHeader back={{ to: "/app", label: "خانه" }} eyebrow="آموزشگاه" title="مدیریت اشتراک‌ها"
      description="تخفیف را تعیین کنید و واریزهای هنرجویان را بررسی و تأیید کنید." />
    {loading ? <LoadingRows rows={4} /> : error ? <ErrorState error={error}
      onRetry={() => { void subscriptions.refetch(); void profiles.refetch(); void payments.refetch(); }} /> :
      <Section title={`درخواست‌ها · ${subscriptions.data?.length ?? 0}`}>
        {!subscriptions.data?.length ? <EmptyState title="درخواستی ثبت نشده است" /> :
          <ul className="space-y-4">{subscriptions.data.map((s) => {
            const payment = payments.data?.find((p) => p.subscription_id === s.id);
            const discountAllowed = s.sessions_per_month === 8 || s.sessions_per_month === 12;
            return <li key={s.id} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{names.get(s.student_id) ?? "هنرجو"}</strong>
                <span className="text-sm">{s.status === "pending_payment" ? "در انتظار پرداخت" : s.status === "active" ? "فعال" : s.status}</span>
              </div>
              <p className="text-sm text-muted-foreground">{s.duration_months} ماه · {s.sessions_per_month} جلسه در ماه · {s.total_sessions} اعتبار</p>
              <p className="font-semibold">{formatAmountFa(s.total_price)} تومان</p>
              <p className="text-xs text-muted-foreground">{formatDateFa(s.starts_on)} تا {formatDateFa(s.ends_on)}</p>
              {s.status === "pending_payment" && discountAllowed && (!payment || payment.status === "rejected") && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={discounts[s.id] ?? s.discount_applied}
                    onChange={(e) => setDiscounts((v) => ({ ...v, [s.id]: e.target.checked }))} />
                  تخفیف مصوب آموزشگاه
                </label>
              )}
              {s.status === "pending_payment" && discountAllowed && (!payment || payment.status === "rejected") && (
                <Button size="sm" variant="outline" disabled={discount.isPending || (discounts[s.id] ?? s.discount_applied) === s.discount_applied}
                  onClick={() => discount.mutate({ id: s.id, enabled: discounts[s.id] ?? false })}>ثبت وضعیت تخفیف</Button>
              )}
              {payment && <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p>شماره پیگیری: {payment.tracking_code || "ثبت نشده"}</p>
                <p>وضعیت: {payment.status}</p>
                <p>مبلغ: {formatAmountFa(payment.amount)}</p>
                {payment.status === "pending" && <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(payment.id)}>تأیید پرداخت</Button>
                  <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => reject.mutate(payment.id)}>رد پرداخت</Button>
                </div>}
              </div>}
            </li>;
          })}</ul>}
      </Section>}
  </>;
}
