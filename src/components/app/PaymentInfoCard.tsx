import { useQuery } from "@tanstack/react-query";
import { Copy, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { settingsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";

import { LoadingRows } from "./states";

export function PaymentInfoCard() {
  const settings = useQuery(settingsQuery());
  if (settings.isPending) return <LoadingRows rows={1} />;
  const v = settings.data?.values ?? {};
  const rows = [
    { label: "شمارهٔ کارت", value: v.payment_card_number, copy: true, ltr: true },
    { label: "به نام", value: v.payment_card_holder },
    { label: "بانک", value: v.payment_bank_name },
    { label: "شبا", value: v.payment_iban, copy: true, ltr: true },
  ].filter((r) => r.value?.trim());

  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-bronze" aria-hidden />
        <h3 className="font-display text-base font-semibold">اطلاعات پرداخت</h3>
      </div>
      {rows.length === 0 && !v.payment_notes?.trim() ? (
        <p className="mt-3 text-sm text-muted-foreground">
          اطلاعات پرداخت هنوز توسط آموزشگاه ثبت نشده است.
        </p>
      ) : (
        <dl className="mt-4 space-y-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="flex items-center gap-1">
                <span dir={r.ltr ? "ltr" : undefined} className="font-medium tracking-wide">
                  {r.ltr ? toPersianDigits(r.value ?? "") : r.value}
                </span>
                {r.copy && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`کپی ${r.label}`}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(r.value ?? "")
                        .then(() => toast.success("کپی شد."))
                        .catch(() => toast.error("کپی انجام نشد."))
                    }
                  >
                    <Copy className="size-4" />
                  </Button>
                )}
              </dd>
            </div>
          ))}
          {v.payment_notes?.trim() && (
            <p className="border-t border-border pt-3 leading-7 text-muted-foreground">
              {v.payment_notes}
            </p>
          )}
        </dl>
      )}
    </div>
  );
}
