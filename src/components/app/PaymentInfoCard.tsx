import { useQuery } from "@tanstack/react-query";
import { Copy, CreditCard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { settingsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { formatCardNumber, formatIban, ibanCanonical, cardDigits, type Settings } from "@/lib/domain/settings";

import { LoadingRows } from "./states";

export function PaymentInfoCard() {
  const settings = useQuery(settingsQuery());
  if (settings.isPending) return <LoadingRows rows={1} />;
  return <PaymentInfoView values={settings.data?.values ?? {}} />;
}

/** Presentational card; also used as the live preview on the staff settings page. */
export function PaymentInfoView({ values: v }: { values: Settings }) {
  const card = v.payment_card_number?.trim() ?? "";
  const iban = v.payment_iban?.trim() ?? "";
  const rows = [
    { label: "شمارهٔ کارت", value: card && formatCardNumber(card), raw: card && cardDigits(card), ltr: true },
    { label: "به نام", value: v.payment_card_holder?.trim() ?? "" },
    { label: "بانک", value: v.payment_bank_name?.trim() ?? "" },
    { label: "شبا", value: iban && formatIban(iban), raw: iban && ibanCanonical(iban), ltr: true },
  ].filter((r) => r.value);
  const notes = v.payment_notes?.trim();

  return (
    <div className="surface p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-bronze" aria-hidden />
        <h3 className="font-display text-base font-semibold">اطلاعات پرداخت</h3>
      </div>
      {rows.length === 0 && !notes ? (
        <p className="mt-3 text-sm text-muted-foreground">
          اطلاعات پرداخت هنوز توسط آموزشگاه ثبت نشده است.
        </p>
      ) : (
        <dl className="mt-4 space-y-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="flex min-w-0 items-center gap-1">
                <span
                  dir={r.ltr ? "ltr" : undefined}
                  className="break-all font-medium tracking-wide"
                >
                  {r.ltr ? toPersianDigits(r.value) : r.value}
                </span>
                {r.raw && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    aria-label={`کپی ${r.label}`}
                    onClick={() =>
                      navigator.clipboard
                        .writeText(r.raw ?? "")
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
          {notes && (
            <p className="whitespace-pre-line border-t border-border pt-3 leading-7 text-muted-foreground">
              {notes}
            </p>
          )}
        </dl>
      )}
    </div>
  );
}
