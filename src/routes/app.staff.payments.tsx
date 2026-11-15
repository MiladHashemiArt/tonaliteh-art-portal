import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Plus, Search, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentStatusBadge } from "@/components/app/StatusBadge";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createPayment, updatePaymentStatus } from "@/lib/backend/payments";
import { supabase } from "@/lib/backend/client";
import {
  allPaymentsQuery,
  allProfilesQuery,
  friendlyError,
  tuitionReviewQueueQuery,
} from "@/lib/backend/queries";
import type { PaymentRow, ProfileRow } from "@/lib/backend/types";
import {
  filterPayments,
  parseAmount,
  PAYMENT_DESCRIPTION_MAX,
  PAYMENT_TYPE_LABEL,
  PAYMENT_TYPES,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  paymentBucket,
  summarizePayments,
  validatePaymentForm,
  type PaymentFilter,
  type PaymentForm,
  type PaymentFormErrors,
  type PaymentStatus,
  type PaymentType,
} from "@/lib/domain/payments";
import { formatAmountFa, formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";
import { normalizeRole, ROLE_LABEL } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/staff/payments")({
  head: () => ({
    meta: [
      { title: "مدیریت پرداخت‌ها | تنالیته" },
      { name: "description", content: "ثبت پرداخت هنرجویان و تغییر وضعیت آن‌ها در تنالیته." },
    ],
  }),
  component: StaffPaymentsPage,
});

const TONE: Record<PaymentStatus, string> = {
  pending: "border-warning/50",
  paid: "border-success/50",
  rejected: "border-destructive/40",
};

function StaffPaymentsPage() {
  const payments = useQuery(allPaymentsQuery());
  const profiles = useQuery(allProfilesQuery());
  const reviewQueue = useQuery(tuitionReviewQueueQuery());
  const [filter, setFilter] = useState<PaymentFilter>({ query: "", status: "all" });
  const [createOpen, setCreateOpen] = useState(false);

  const profilesById = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.id, p])),
    [profiles.data],
  );
  const studentLabel = (id: string) => {
    const p = profilesById.get(id);
    return `${p?.full_name ?? ""} ${p?.phone ?? ""}`;
  };

  const rows = useMemo(() => payments.data ?? [], [payments.data]);
  const totals = useMemo(() => summarizePayments(rows), [rows]);
  const visible = filterPayments(rows, filter, studentLabel);

  const loading = payments.isPending || profiles.isPending;
  const error = payments.error || profiles.error;

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow="مالی"
        title="مدیریت پرداخت‌ها"
        description="پرداخت هنرجویان را ثبت کنید و وضعیت هر پرداخت را به‌روز نگه دارید."
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={loading || !!error}>
            <Plus /> ثبت پرداخت
          </Button>
        }
      />

      <TuitionReviewQueue
        profiles={profiles.data ?? []}
        rows={reviewQueue.data ?? []}
        isLoading={reviewQueue.isPending}
        error={reviewQueue.error}
        onRefresh={() => reviewQueue.refetch()}
      />

      {loading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void payments.refetch();
            void profiles.refetch();
          }}
        />
      ) : (
        <>
          <Section title="جمع‌بندی">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {PAYMENT_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter((f) => ({ ...f, status: f.status === s ? "all" : s }))}
                  aria-pressed={filter.status === s}
                  className={cn(
                    "surface border-s-4 p-4 text-start transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    TONE[s],
                    filter.status === s && "ring-2 ring-bronze/50",
                  )}
                >
                  <p className="text-xs text-muted-foreground">{PAYMENT_STATUS_LABEL[s]}</p>
                  <p className="mt-1 font-display text-lg font-semibold">
                    {formatAmountFa(totals[s].total)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {toPersianDigits(totals[s].count)} پرداخت
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section title={`پرداخت‌ها · ${toPersianDigits(visible.length)}`}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  aria-label="جست‌وجو در پرداخت‌ها"
                  placeholder="جست‌وجوی نام، تلفن یا توضیحات"
                  className="ps-9"
                  value={filter.query}
                  onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                />
              </div>
              <div className="sm:w-48">
                <NativeSelect
                  aria-label="فیلتر وضعیت"
                  value={filter.status}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, status: e.target.value as PaymentFilter["status"] }))
                  }
                >
                  <option value="all">همهٔ وضعیت‌ها</option>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {!rows.length ? (
              <EmptyState
                icon={<Wallet className="size-7" aria-hidden />}
                title="هنوز پرداختی ثبت نشده است"
                description="با دکمهٔ «ثبت پرداخت» اولین پرداخت هنرجو را ثبت کنید."
                action={
                  <Button variant="outline" onClick={() => setCreateOpen(true)}>
                    <Plus /> ثبت پرداخت
                  </Button>
                }
              />
            ) : !visible.length ? (
              <EmptyState
                icon={<Search className="size-7" aria-hidden />}
                title="موردی با این جست‌وجو پیدا نشد"
                action={
                  <Button variant="ghost" onClick={() => setFilter({ query: "", status: "all" })}>
                    پاک کردن فیلترها
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {visible.map((p) => (
                  <PaymentItem
                    key={String(p.id)}
                    payment={p}
                    student={profilesById.get(p.student_id)}
                  />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <CreatePaymentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles.data ?? []}
      />
    </>
  );
}

function TuitionReviewQueue({
  profiles,
  rows,
  isLoading,
  error,
  onRefresh,
}: {
  profiles: ProfileRow[];
  rows: Awaited<ReturnType<ReturnType<typeof tuitionReviewQueueQuery>["queryFn"]>>;
  isLoading: boolean;
  error: Error | null;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error: rpcError } = await supabase.rpc("review_manual_tuition_payment", {
        p_payment_attempt_id: id,
        p_approve: approve,
      });
      if (rpcError) throw rpcError;
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.approve ? "پرداخت تأیید و ثبت‌نام هنرجو نهایی شد." : "رسید رد شد.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tuition"] }),
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["enrollments"] }),
      ]);
      setBusyId(null);
    },
    onError: (e) => {
      setBusyId(null);
      toast.error(friendlyError(e));
    },
  });

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <Section title={`رسیدهای شهریه در انتظار بررسی · ${toPersianDigits(rows.length)}`}>
      {isLoading ? (
        <LoadingRows rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRefresh} />
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">رسیدِ در انتظار بررسی وجود ندارد.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ attempt, order }) => {
            const student = profileById.get(order.student_id);
            return (
              <li key={attempt.id} className="surface flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{student?.full_name ?? "هنرجوی نامشخص"}</p>
                    <p className="text-xs text-muted-foreground">
                      {student?.phone ?? "بدون شماره تماس"} · {toPersianDigits(order.session_count)} جلسه
                    </p>
                  </div>
                  <p className="font-display text-lg font-semibold">
                    {formatAmountFa(attempt.amount_toman)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  ارسال رسید: {formatDateFa(attempt.submitted_at, true)}
                </p>
                {attempt.receipt_object_path ? (
                  <ReceiptLink objectPath={attempt.receipt_object_path} />
                ) : (
                  <p className="text-xs text-destructive">مسیر رسید ثبت نشده است.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={review.isPending}
                    onClick={() => {
                      setBusyId(attempt.id);
                      review.mutate({ id: attempt.id, approve: true });
                    }}
                  >
                    <Check /> تأیید پرداخت
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() => {
                      setBusyId(attempt.id);
                      review.mutate({ id: attempt.id, approve: false });
                    }}
                  >
                    <X /> رد رسید
                  </Button>
                  {busyId === attempt.id && (
                    <span className="self-center text-xs text-muted-foreground" role="status">
                      در حال ثبت تصمیم…
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ReceiptLink({ objectPath }: { objectPath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openReceipt = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from("tuition-receipts")
        .createSignedUrl(objectPath, 300);
      if (error) throw error;
      setUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" disabled={loading} onClick={openReceipt}>
      <ExternalLink /> {loading ? "در حال آماده‌سازی…" : "مشاهدهٔ رسید"}
    </Button>
  );
}

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  // ["payments"] covers the staff list and every student's own list.
  return () => queryClient.invalidateQueries({ queryKey: ["payments"] });
}

function PaymentItem({
  payment,
  student,
}: {
  payment: PaymentRow;
  student: ProfileRow | undefined;
}) {
  const invalidate = useInvalidatePayments();
  const bucket = paymentBucket(payment.status);
  const current = (payment.status ?? "").trim().toLowerCase();
  const isCanonical = (PAYMENT_STATUSES as readonly string[]).includes(current);

  const change = useMutation({
    mutationFn: (status: PaymentStatus) => updatePaymentStatus(String(payment.id), status),
    onSuccess: (_d, status) => {
      toast.success(`وضعیت به «${PAYMENT_STATUS_LABEL[status]}» تغییر کرد.`);
      return invalidate();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <li
      className={cn(
        "surface flex flex-col gap-3 border-s-4 p-4 sm:flex-row sm:items-center sm:justify-between",
        bucket ? TONE[bucket] : "border-border",
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{student?.full_name || "کاربر نامشخص"}</p>
          <PaymentStatusBadge status={payment.status} />
        </div>
        <p className="font-display text-lg font-semibold">{formatAmountFa(payment.amount)}</p>
        <p className="text-xs text-muted-foreground">{formatDateFa(payment.payment_date, true)}</p>
        <p className="text-xs text-muted-foreground">
          {PAYMENT_TYPE_LABEL[payment.payment_type as PaymentType] ?? "سایر هزینه‌ها"}
        </p>
        {payment.description && (
          <p className="text-sm leading-7 text-muted-foreground">{payment.description}</p>
        )}
      </div>
      <div className="sm:w-44">
        <Label htmlFor={`status-${payment.id}`} className="sr-only">
          تغییر وضعیت پرداخت
        </Label>
        <NativeSelect
          id={`status-${payment.id}`}
          value={isCanonical ? current : ""}
          disabled={change.isPending}
          onChange={(e) => {
            const next = e.target.value as PaymentStatus;
            if (next && next !== current) change.mutate(next);
          }}
        >
          {!isCanonical && (
            <option value="" disabled>
              {payment.status || "بدون وضعیت"}
            </option>
          )}
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        {change.isPending && (
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            در حال ذخیره…
          </p>
        )}
      </div>
    </li>
  );
}

const emptyForm = (): PaymentForm => ({
  student_id: "",
  payment_type: "tuition",
  amount: "",
  payment_date: toIsoDate(new Date()),
  description: "",
  status: "pending",
});

function CreatePaymentDialog({
  open,
  onOpenChange,
  profiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: ProfileRow[];
}) {
  const invalidate = useInvalidatePayments();
  const [form, setForm] = useState<PaymentForm>(emptyForm);
  const [errors, setErrors] = useState<PaymentFormErrors>({});

  const options = useMemo(
    () => [...profiles].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "fa")),
    [profiles],
  );
  const amount = parseAmount(form.amount);

  const create = useMutation({
    mutationFn: () => createPayment(form),
    onSuccess: async () => {
      toast.success("پرداخت ثبت شد.");
      setForm(emptyForm());
      setErrors({});
      onOpenChange(false);
      await invalidate();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const set = <K extends keyof PaymentForm>(k: K, v: PaymentForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!create.isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ثبت پرداخت</DialogTitle>
          <DialogDescription>
            پرداخت در پنل هنرجو با همین وضعیت نمایش داده می‌شود.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const found = validatePaymentForm(form);
            setErrors(found);
            if (Object.keys(found).length) return;
            create.mutate();
          }}
        >
          <Field id="pay-student" label="هنرجو" error={errors.student_id}>
            {options.length ? (
              <NativeSelect
                id="pay-student"
                value={form.student_id}
                onChange={(e) => set("student_id", e.target.value)}
                aria-invalid={!!errors.student_id}
              >
                <option value="">انتخاب کنید…</option>
                {options.map((p) => {
                  const role = normalizeRole(p.role);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.full_name || "بدون نام"}
                      {p.phone ? ` · ${toPersianDigits(p.phone)}` : ""}
                      {role !== "student" ? ` (${ROLE_LABEL[role]})` : ""}
                    </option>
                  );
                })}
              </NativeSelect>
            ) : (
              <p className="text-sm text-muted-foreground">هیچ کاربری برای انتخاب در دسترس نیست.</p>
            )}
          </Field>
          <Field id="pay-type" label="نوع پرداخت" error={errors.payment_type}>
            <NativeSelect
              id="pay-type"
              value={form.payment_type}
              onChange={(e) => set("payment_type", e.target.value as PaymentType)}
            >
              {PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PAYMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="pay-type" label="نوع پرداخت" error={errors.payment_type}>
            <NativeSelect
              id="pay-type"
              value={form.payment_type}
              onChange={(e) => set("payment_type", e.target.value as PaymentType)}
            >
              {PAYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PAYMENT_TYPE_LABEL[type]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="pay-amount"
            label="مبلغ (تومان)"
            error={errors.amount}
            hint={amount && amount > 0 ? formatAmountFa(amount) : undefined}
          >
            <Input
              id="pay-amount"
              inputMode="numeric"
              dir="ltr"
              className="text-start"
              autoComplete="off"
              placeholder="1500000"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              aria-invalid={!!errors.amount}
            />
          </Field>
          <Field id="pay-date" label="تاریخ پرداخت" error={errors.payment_date}>
            <JalaliDatePicker
              id="pay-date"
              label="تاریخ پرداخت"
              value={form.payment_date}
              onChange={(v) => set("payment_date", v)}
            />
          </Field>
          <Field id="pay-status" label="وضعیت" error={errors.status}>
            <NativeSelect
              id="pay-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as PaymentStatus)}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="pay-desc" label="توضیحات (اختیاری)" error={errors.description}>
            <Textarea
              id="pay-desc"
              rows={3}
              maxLength={PAYMENT_DESCRIPTION_MAX}
              placeholder="مثلاً شهریهٔ آبان"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "در حال ثبت…" : "ثبت پرداخت"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-err`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
