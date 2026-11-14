import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentInfoCard } from "@/components/app/PaymentInfoCard";
import { PaymentStatusBadge, paymentStatusInfo } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { useAppSession } from "@/hooks/use-app-session";
import { myPaymentsQuery } from "@/lib/backend/queries";
import { supabase } from "@/lib/backend/client";
import type { AttendanceAdjustmentRow, StudentExpenseRow } from "@/lib/backend/types";
import { summarizeStudentExpenses } from "@/lib/domain/expenses";
import { formatAmountFa, formatDateFa, toLatinDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/payments")({
  head: () => ({ meta: [{ title: "پرداخت‌ها | تنالیته" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAppSession();
  const payments = useQuery(myPaymentsQuery(user.id));
  const adjustments = useQuery({
    queryKey: ["attendance_adjustments", "mine", user.id],
    queryFn: async (): Promise<AttendanceAdjustmentRow[]> => {
      const { data, error } = await supabase.from("attendance_adjustments")
        .select("id,attendance_id,student_id,class_id,session_date,adjustment_type,quantity_minutes,unit_rate,amount,description,payment_id,recorded_by,created_at")
        .eq("student_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceAdjustmentRow[];
    },
  });
  const expenses = useQuery({
    queryKey: ["student_expenses", "mine", user.id],
    queryFn: async (): Promise<StudentExpenseRow[]> => {
      const { data, error } = await supabase.from("student_expenses")
        .select("*").eq("student_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const expenseSummary = summarizeStudentExpenses(expenses.data ?? []);
  const paidTotal = (payments.data ?? [])
    .filter((p) => paymentStatusInfo(p.status).tone === "success")
    .reduce((sum, p) => sum + (Number(toLatinDigits(String(p.amount ?? 0))) || 0), 0);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="مالی"
        title="پرداخت‌ها"
        description="سوابق پرداخت، ریز هزینه‌های اضافه و اطلاعات واریز."
      />
      <Section title="هزینه‌های جانبی">
        {expenses.isPending ? <LoadingRows rows={2} /> : expenses.error ? (
          <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                ["در انتظار بررسی", expenseSummary.pending],
                ["تأییدشده", expenseSummary.approved],
                ["ردشده", expenseSummary.rejected],
              ] as const).map(([label, item]) => (
                <div key={label} className="surface border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold">{formatAmountFa(item.total)} تومان</p>
                  <p className="text-xs text-muted-foreground">{item.count} درخواست</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              هزینه‌های تأییدشده در سوابق پرداخت بالا به‌صورت پرداخت مرتبط ثبت می‌شوند؛ این جمع فقط ریزحساب هزینه‌هاست و دوباره به بدهی اضافه نمی‌شود.
            </p>
            <div className="mt-3">
              <a href="/app/student/expenses" className="text-sm font-medium text-bronze underline-offset-4 hover:underline">
                ثبت یا مشاهده جزئیات هزینه‌ها
              </a>
            </div>
          </>
        )}
      </Section>
      <Section title="ریز هزینه‌های اضافه">
        {adjustments.isPending ? <LoadingRows rows={2} /> : adjustments.error ? (
          <ErrorState error={adjustments.error} onRetry={() => adjustments.refetch()} />
        ) : !adjustments.data?.length ? (
          <EmptyState title="هزینهٔ اضافه‌ای ثبت نشده است"
            description="اگر برای حضور شما اضافه‌زمان یا اضافه‌جلسه ثبت شود، جزئیات آن اینجا نمایش داده می‌شود." />
        ) : (
          <ul className="space-y-3">
            {adjustments.data.map(item => (
              <li key={item.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{item.adjustment_type === "extra_time"
                    ? "اضافه‌زمان · " + toLatinDigits(String(item.quantity_minutes ?? 0)) + " دقیقه"
                    : "جلسهٔ اضافه"}</p>
                  <p className="text-xs text-muted-foreground">{formatDateFa(item.session_date, true)}</p>
                  {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    نرخ مبنا: {formatAmountFa(item.unit_rate)}{item.adjustment_type === "extra_time" ? " در ساعت" : " برای هر جلسه"}
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-display font-semibold">{formatAmountFa(item.amount)}</p>
                  <p className="text-xs text-muted-foreground">ثبت‌شده در حساب مالی</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Section title="سوابق پرداخت">
          {payments.isPending ? (
            <LoadingRows />
          ) : payments.error ? (
            <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
          ) : !payments.data?.length ? (
            <EmptyState
              title="پرداختی ثبت نشده است"
              description="پس از ثبت پرداخت توسط آموزشگاه، اینجا نمایش داده می‌شود."
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                جمع پرداخت‌های تأییدشده:{" "}
                <span className="font-semibold text-foreground">{formatAmountFa(paidTotal)}</span>
              </p>
              <ul className="space-y-3">
                {payments.data.map((p) => (
                  <li
                    key={String(p.id)}
                    className="surface flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-display font-semibold">{formatAmountFa(p.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateFa(p.payment_date)}
                      </p>
                      {p.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                      )}
                    </div>
                    <PaymentStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>
        <aside>
          <Section title="واریز شهریه">
            <PaymentInfoCard />
          </Section>
        </aside>
      </div>
    </>
  );
}
