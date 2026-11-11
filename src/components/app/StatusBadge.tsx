import { cn } from "@/lib/utils";

const PAYMENT_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  paid: { label: "پرداخت‌شده", tone: "success" },
  completed: { label: "پرداخت‌شده", tone: "success" },
  "پرداخت شده": { label: "پرداخت‌شده", tone: "success" },
  pending: { label: "در انتظار", tone: "warning" },
  unpaid: { label: "پرداخت‌نشده", tone: "danger" },
  overdue: { label: "معوق", tone: "danger" },
  failed: { label: "ناموفق", tone: "danger" },
  refunded: { label: "بازگشت داده شد", tone: "muted" },
};

export const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "پرداخت‌شده" },
  { value: "pending", label: "در انتظار" },
  { value: "unpaid", label: "پرداخت‌نشده" },
  { value: "overdue", label: "معوق" },
];

export function paymentStatusInfo(status: string | null | undefined) {
  const key = (status ?? "").trim().toLowerCase();
  return PAYMENT_STATUS[key] ?? { label: status || "نامشخص", tone: "muted" as const };
}

export function Tone({
  tone,
  children,
  className,
}: {
  tone: "success" | "warning" | "danger" | "muted" | "bronze";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "success" && "bg-success/12 text-success",
        tone === "warning" && "bg-warning/15 text-warning-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "bronze" && "bg-bronze-soft text-accent-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  const info = paymentStatusInfo(status);
  return <Tone tone={info.tone}>{info.label}</Tone>;
}
