import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentInfoCard } from "@/components/app/PaymentInfoCard";
import { PaymentStatusBadge, paymentStatusInfo } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { useAppSession } from "@/hooks/use-app-session";
import { myPaymentsQuery, myPendingExpensesQuery } from "@/lib/backend/queries";
import { formatAmountFa, formatDateFa, toLatinDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/payments")({
  head: () => ({ meta: [{ title: "امور مالی | تنالیته" }] }),
  component: PaymentsPage,
});

function paymentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    tuition: "شهریه",
    extra_class: "اضافه‌جلسه و اضافه‌زمان",
    materials: "لوازم و مواد",
    other: "سایر هزینه‌ها",
  };
  return labels[type] ?? "پرداخت";
}

function PaymentsPage() {
  const { user } = useAppSession();
  const payments = useQuery(myPaymentsQuery(user.id));
  const expenses = useQuery(myPendingExpensesQuery(user.id));
  const paidTotal = (payments.data ?? [])
    .filter((p) => paymentStatusInfo(p.status).tone === "success")
    .reduce((sum, p) => sum + (Number(toLatinDigits(String(p.amount ?? 0))) || 0), 0);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="مالی"
        title="امور مالی"
        description="سوابق پرداخت، هزینه‌های جانبی و وضعیت بررسی درخواست‌ها."
      />
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Section title="گردش مالی">
            {payments.isPending ? (
              <LoadingRows />
            ) : payments.error ? (
              <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
            ) : !payments.data?.length ? (
              <EmptyState
                title="پرداختی ثبت نشده است"
                description="پس از ثبت پرداخت توسط آموزشگاه، سوابق اینجا نمایش داده می‌شود."
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
                          {formatDateFa(p.payment_date)} · {paymentTypeLabel(p.payment_type)}
                        </p>
                        {p.description && (
                          <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                        )}
                        {p.tracking_code && (
                          <p className="mt-1 text-xs text-muted-foreground">کد پیگیری: {p.tracking_code}</p>
                        )}
                      </div>
                      <PaymentStatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
          <Section title="هزینه‌های جانبی ثبت‌شده توسط شما">
            {expenses.isPending ? (
              <LoadingRows />
            ) : expenses.error ? (
              <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
            ) : !expenses.data?.length ? (
              <p className="text-sm text-muted-foreground">درخواست هزینه جانبیِ در انتظار بررسی یا ردشده‌ای ندارید.</p>
            ) : (
              <ul className="space-y-3">
                {expenses.data.map((expense) => (
                  <li key={expense.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold">{expense.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateFa(expense.expense_date)} · {expense.category}
                      </p>
                      {expense.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{expense.description}</p>
                      )}
                      {expense.review_note && (
                        <p className="mt-1 text-sm text-muted-foreground">توضیح استاد: {expense.review_note}</p>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-display font-semibold">{formatAmountFa(expense.amount)}</p>
                      <span className="text-xs text-muted-foreground">
                        {expense.status === "pending" ? "در انتظار بررسی" : "رد شده"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <aside>
          <Section title="واریز شهریه">
            <PaymentInfoCard />
          </Section>
        </aside>
      </div>
    </>
  );
}
