import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentInfoCard } from "@/components/app/PaymentInfoCard";
import { PaymentStatusBadge, paymentStatusInfo } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { useAppSession } from "@/hooks/use-app-session";
import { myPaymentsQuery } from "@/lib/backend/queries";
import { formatAmountFa, formatDateFa, toLatinDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/payments")({
  head: () => ({ meta: [{ title: "پرداخت‌ها | تنالیته" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { user } = useAppSession();
  const payments = useQuery(myPaymentsQuery(user.id));
  const paidTotal = (payments.data ?? [])
    .filter((p) => paymentStatusInfo(p.status).tone === "success")
    .reduce((sum, p) => sum + (Number(toLatinDigits(String(p.amount ?? 0))) || 0), 0);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="مالی"
        title="پرداخت‌ها"
        description="سوابق پرداخت شما و اطلاعات واریز."
      />
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
