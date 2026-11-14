import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Printer, Search, Wallet } from "lucide-react";
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
import { allPaymentsQuery, allProfilesQuery, friendlyError, sessionsQuery } from "@/lib/backend/queries";
import { supabase } from "@/lib/backend/client";
import type { AttendanceAdjustmentRow, PaymentRow, ProfileRow, StudentExpenseRow } from "@/lib/backend/types";
import {
  buildFinanceReport,
  isWithinFinanceDateRange,
  filterPayments,
  parseAmount,
  PAYMENT_DESCRIPTION_MAX,
  PAYMENT_TRACKING_CODE_MAX,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUSES,
  paymentBucket,
  summarizePayments,
  validatePaymentForm,
  type PaymentFilter,
  type PaymentForm,
  type PaymentFormErrors,
  type PaymentStatus,
} from "@/lib/domain/payments";
import { formatAmountFa, formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";
import { normalizeRole, ROLE_LABEL } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";
import { sessionTitle } from "@/lib/domain/schedule";
import { summarizeStudentExpenses } from "@/lib/domain/expenses";

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
  const sessions = useQuery(sessionsQuery());
  const adjustments = useQuery({
    queryKey: ["attendance_adjustments", "finance-report"],
    queryFn: async (): Promise<AttendanceAdjustmentRow[]> => {
      const { data, error } = await supabase.from("attendance_adjustments")
        .select("id,student_id,class_id,amount,adjustment_type,quantity_minutes,unit_rate,description,session_date,attendance_id,payment_id,recorded_by,created_at")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as AttendanceAdjustmentRow[];
    },
  });
  const expenses = useQuery({
    queryKey: ["student_expenses", "finance-report"],
    queryFn: async (): Promise<StudentExpenseRow[]> => {
      const { data, error } = await supabase.from("student_expenses")
        .select("*").order("expense_date", { ascending: false }).limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [filter, setFilter] = useState<PaymentFilter>({ query: "", status: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [reportRange, setReportRange] = useState({ from: "", to: "" });
  const invalidReportRange = Boolean(reportRange.from && reportRange.to && reportRange.from > reportRange.to);

  const profilesById = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.id, p])),
    [profiles.data],
  );
  const studentLabel = (id: string) => {
    const p = profilesById.get(id);
    return `${p?.full_name ?? ""} ${p?.phone ?? ""}`;
  };

  const rows = payments.data ?? [];
  const totals = useMemo(() => summarizePayments(rows), [rows]);
  const reportPayments = useMemo(
    () => invalidReportRange ? [] : rows.filter((item) => isWithinFinanceDateRange(item.payment_date, reportRange)),
    [rows, reportRange, invalidReportRange],
  );
  const reportAdjustments = useMemo(
    () => invalidReportRange ? [] : (adjustments.data ?? []).filter((item) => isWithinFinanceDateRange(item.session_date, reportRange)),
    [adjustments.data, reportRange, invalidReportRange],
  );
  const reportExpenses = useMemo(
    () => invalidReportRange ? [] : (expenses.data ?? []).filter((item) => isWithinFinanceDateRange(item.expense_date, reportRange)),
    [expenses.data, reportRange, invalidReportRange],
  );
  const report = useMemo(() => buildFinanceReport(reportPayments, reportAdjustments), [reportPayments, reportAdjustments]);
  const expenseSummary = useMemo(() => summarizeStudentExpenses(reportExpenses), [reportExpenses]);
  const expensesByStudent = useMemo(() => {
    const grouped = new Map<string, { pending: number; approved: number }>();
    for (const expense of reportExpenses) {
      const current = grouped.get(expense.student_id) ?? { pending: 0, approved: 0 };
      const amount = parseAmount(expense.amount) ?? 0;
      if (expense.status === "pending") current.pending += amount;
      if (expense.status === "approved") current.approved += amount;
      grouped.set(expense.student_id, current);
    }
    return grouped;
  }, [reportExpenses]);
  const financeStudents = useMemo(() => {
    const ids = new Set([
      ...report.students.map((item) => item.studentId),
      ...expensesByStudent.keys(),
      ...(profiles.data ?? []).filter((profile) => normalizeRole(profile.role) === "student").map((profile) => profile.id),
    ]);
    return [...ids].map((studentId) => {
      const payment = report.students.find((item) => item.studentId === studentId);
      const expense = expensesByStudent.get(studentId);
      return {
        studentId,
        paid: payment?.paid ?? 0,
        pending: payment?.pending ?? 0,
        extra: payment?.extra ?? 0,
        approvedExpense: expense?.approved ?? 0,
        pendingExpense: expense?.pending ?? 0,
      };
    }).sort((a, b) => b.pending - a.pending || b.pendingExpense - a.pendingExpense);
  }, [report.students, expensesByStudent, profiles.data]);
  const sessionsById = useMemo(() => new Map((sessions.data ?? []).map((s) => [s.id, sessionTitle(s)])), [sessions.data]);
  const visible = filterPayments(rows, filter, studentLabel);

  const loading = payments.isPending || profiles.isPending || sessions.isPending || adjustments.isPending || expenses.isPending;
  const error = payments.error || profiles.error || sessions.error || adjustments.error || expenses.error;

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

      {loading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void payments.refetch();
            void profiles.refetch();
            void sessions.refetch();
            void adjustments.refetch();
            void expenses.refetch();
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
                  onClick={() =>
                    setFilter((f) => ({ ...f, status: f.status === s ? "all" : s }))
                  }
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

          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #tonaliteh-finance-print, #tonaliteh-finance-print * { visibility: visible !important; }
              #tonaliteh-finance-print { position: absolute; inset: 0; width: 100%; margin: 0; padding: 0; background: white; color: black; }
              #tonaliteh-finance-print button, #tonaliteh-finance-print [data-print-hide="true"] { display: none !important; }
              #tonaliteh-finance-print .surface { box-shadow: none !important; }
              #tonaliteh-finance-print table { break-inside: avoid; }
            }
          `}</style>
          <div id="tonaliteh-finance-print">
          <Section title="گزارش مالی">
            <div className="mb-5 rounded-xl border p-4" data-print-hide="true">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">بازه گزارش</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => window.print()} disabled={invalidReportRange}>
                  <Printer className="size-4" /> چاپ / ذخیره PDF
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>از تاریخ</Label>
                  <JalaliDatePicker id="finance-range-from" label="شروع بازه" value={reportRange.from} onChange={(from) => setReportRange((current) => ({ ...current, from }))} />
                </div>
                <div className="space-y-1">
                  <Label>تا تاریخ</Label>
                  <JalaliDatePicker id="finance-range-to" label="پایان بازه" value={reportRange.to} onChange={(to) => setReportRange((current) => ({ ...current, to }))} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">فیلتر بر اساس تاریخ پرداخت، تاریخ جلسه و تاریخ ثبت هزینه جانبی اعمال می‌شود.</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReportRange({ from: "", to: "" })}>نمایش همه تاریخ‌ها</Button>
              </div>
              {invalidReportRange && <p role="alert" className="mt-2 text-sm text-destructive">تاریخ شروع نباید بعد از تاریخ پایان باشد.</p>}
            </div>
            <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{reportRange.from || reportRange.to ? "گزارش بر اساس بازه انتخاب‌شده" : "گزارش تمام تاریخ‌های موجود"}</span>
              <span>{toPersianDigits(reportPayments.length)} پرداخت · {toPersianDigits(reportAdjustments.length)} هزینه کلاس · {toPersianDigits(reportExpenses.length)} هزینه جانبی</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ReportMetric label="وصول‌شده" amount={report.paidTotal} />
              <ReportMetric label="در انتظار پرداخت" amount={report.pendingTotal} />
              <ReportMetric label="پرداخت‌های ردشده" amount={report.rejectedTotal} />
              <ReportMetric label="هزینه‌های اضافه ثبت‌شده" amount={report.extraTotal} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">هزینه‌های اضافه در ریزحساب جداگانه دیده می‌شوند و برای جلوگیری از دوباره‌شماری، فقط پرداخت مرتبط در جمع بدهی لحاظ می‌شود.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ReportMetric label={`هزینه جانبی تأییدشده · ${toPersianDigits(expenseSummary.approved.count)} مورد`} amount={expenseSummary.approved.total} />
              <ReportMetric label={`هزینه جانبی در انتظار تأیید · ${toPersianDigits(expenseSummary.pending.count)} مورد`} amount={expenseSummary.pending.total} />
              <ReportMetric label={`هزینه جانبی ردشده · ${toPersianDigits(expenseSummary.rejected.count)} مورد`} amount={expenseSummary.rejected.total} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              این سه عدد فقط ریزحساب دفتر هزینه‌ها هستند. هزینه تأییدشده از طریق پرداخت مرتبط در جمع بدهی بالا محاسبه می‌شود؛ هزینه در انتظار تأیید هنوز بدهی قطعی نیست و دوباره‌شماری نمی‌شود.
            </p>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold">گزارش ماهانه</h3>
                {report.monthly.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 text-start">ماه</th><th className="py-2 text-end">وصول‌شده</th><th className="py-2 text-end">در انتظار</th><th className="py-2 text-end">هزینه اضافه</th></tr></thead><tbody>{report.monthly.map((m) => <tr key={m.month} className="border-b last:border-0"><td className="py-2">{toPersianDigits(m.month)}</td><td className="py-2 text-end">{formatAmountFa(m.paid)}</td><td className="py-2 text-end">{formatAmountFa(m.pending)}</td><td className="py-2 text-end">{formatAmountFa(m.extra)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">هنوز داده‌ای برای گزارش ماهانه وجود ندارد.</p>}
              </div>
              <div>
                <h3 className="mb-3 font-semibold">ریز حساب هنرجویان</h3>
                {financeStudents.length ? <div className="space-y-2">{financeStudents.map((s) => <div key={s.studentId} className="rounded-lg border p-3"><p className="font-medium">{profilesById.get(s.studentId)?.full_name || "هنرجوی نامشخص"}</p><div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5"><div><span className="text-muted-foreground">وصولی</span><p className="mt-1 font-semibold">{formatAmountFa(s.paid)}</p></div><div><span className="text-muted-foreground">بدهی قطعی</span><p className="mt-1 font-semibold">{formatAmountFa(s.pending)}</p></div><div><span className="text-muted-foreground">هزینه اضافه کلاس</span><p className="mt-1 font-semibold">{formatAmountFa(s.extra)}</p></div><div><span className="text-muted-foreground">هزینه جانبی تأییدشده</span><p className="mt-1 font-semibold">{formatAmountFa(s.approvedExpense)}</p></div><div><span className="text-muted-foreground">هزینه در انتظار بررسی</span><p className="mt-1 font-semibold">{formatAmountFa(s.pendingExpense)}</p></div></div></div>)}</div> : <p className="text-sm text-muted-foreground">هنوز حسابی برای نمایش وجود ندارد.</p>}
              </div>
            </div>
            <div className="mt-5">
              <h3 className="mb-3 font-semibold">هزینه اضافه به تفکیک کلاس</h3>
              {report.classes.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2 text-start">کلاس</th><th className="py-2 text-end">تعداد</th><th className="py-2 text-end">مبلغ</th></tr></thead><tbody>{report.classes.map((item) => <tr key={item.classId} className="border-b last:border-0"><td className="py-2">{sessionsById.get(item.classId) || "کلاس نامشخص"}</td><td className="py-2 text-end">{toPersianDigits(item.count)}</td><td className="py-2 text-end">{formatAmountFa(item.extra)}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">هزینه اضافه‌ای ثبت نشده است.</p>}
            </div>
          </Section>
          </div>

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
                  <PaymentItem key={String(p.id)} payment={p} student={profilesById.get(p.student_id)} />
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

function ReportMetric({ label, amount }: { label: string; amount: number }) {
  return <div className="surface border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-display text-lg font-semibold">{formatAmountFa(amount)}</p><p className="text-xs text-muted-foreground">تومان</p></div>;
}

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  // ["payments"] covers the staff list and every student's own list.
  return () => queryClient.invalidateQueries({ queryKey: ["payments"] });
}

function PaymentItem({ payment, student }: { payment: PaymentRow; student: ProfileRow | undefined }) {
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
        <p className="text-xs text-muted-foreground">{PAYMENT_TYPE_LABEL[payment.payment_type as keyof typeof PAYMENT_TYPE_LABEL] ?? "سایر"} · {PAYMENT_METHOD_LABEL[payment.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ?? "نامشخص"}{payment.tracking_code ? ` · پیگیری: ${payment.tracking_code}` : ""}</p>
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
  amount: "",
  payment_date: toIsoDate(new Date()),
  description: "",
  status: "pending",
  payment_type: "other",
  payment_method: "unknown",
  tracking_code: "",
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
    () =>
      [...profiles].sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? "", "fa"),
      ),
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
              <p className="text-sm text-muted-foreground">
                هیچ کاربری برای انتخاب در دسترس نیست.
              </p>
            )}
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
          <Field id="pay-type" label="نوع پرداخت" error={errors.payment_type}>
            <NativeSelect id="pay-type" value={form.payment_type} onChange={(e) => set("payment_type", e.target.value as PaymentForm["payment_type"])} aria-invalid={!!errors.payment_type}>
              {PAYMENT_TYPES.map((type) => <option key={type} value={type}>{PAYMENT_TYPE_LABEL[type]}</option>)}
            </NativeSelect>
          </Field>
          <Field id="pay-method" label="روش پرداخت" error={errors.payment_method}>
            <NativeSelect id="pay-method" value={form.payment_method} onChange={(e) => set("payment_method", e.target.value as PaymentForm["payment_method"])} aria-invalid={!!errors.payment_method}>
              {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{PAYMENT_METHOD_LABEL[method]}</option>)}
            </NativeSelect>
          </Field>
          <Field id="pay-tracking" label="کد پیگیری (اختیاری)" error={errors.tracking_code} hint="شماره کامل کارت یا حساب را وارد نکنید.">
            <Input id="pay-tracking" maxLength={PAYMENT_TRACKING_CODE_MAX} value={form.tracking_code} onChange={(e) => set("tracking_code", e.target.value)} aria-invalid={!!errors.tracking_code} placeholder="کد مرجع بانکی یا رسید" />
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
          <Field id="pay-desc" label={form.payment_type === "other" ? "شرح پرداخت (اجباری)" : "توضیحات (اختیاری)"} error={errors.description}>

            <Textarea
              id="pay-desc"
              required={form.payment_type === "other"}
              rows={3}
              maxLength={PAYMENT_DESCRIPTION_MAX}
              placeholder={form.payment_type === "other" ? "علت و شرح این پرداخت را بنویسید" : "مثلاً شهریهٔ آبان"}
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
