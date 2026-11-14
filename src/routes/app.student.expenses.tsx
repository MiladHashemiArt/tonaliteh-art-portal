import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import type { StudentExpenseRow } from "@/lib/backend/types";
import {
  STUDENT_EXPENSE_CATEGORIES,
  STUDENT_EXPENSE_CATEGORY_LABEL,
  studentExpenseInsertPayload,
  summarizeStudentExpenses,
  validateStudentExpenseForm,
  type StudentExpenseForm,
  type StudentExpenseFormErrors,
} from "@/lib/domain/expenses";
import { formatAmountFa, formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";
import { friendlyError } from "@/lib/backend/queries";

export const Route = createFileRoute("/app/student/expenses")({
  head: () => ({ meta: [{ title: "هزینه‌های جانبی | تنالیته" }] }),
  component: StudentExpensesPage,
});

const initialForm = (): StudentExpenseForm => ({
  student_id: "",
  category: "materials",
  title: "",
  description: "",
  amount: "",
  expense_date: toIsoDate(new Date()),
});

const STATUS_LABEL = {
  pending: "در انتظار بررسی",
  approved: "تأییدشده",
  rejected: "ردشده",
} as const;

function StudentExpensesPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StudentExpenseForm>(() => ({ ...initialForm(), student_id: user.id }));
  const [errors, setErrors] = useState<StudentExpenseFormErrors>({});
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
  const summary = useMemo(() => summarizeStudentExpenses(expenses.data ?? []), [expenses.data]);

  const submit = useMutation({
    mutationFn: async () => {
      const payload = studentExpenseInsertPayload(form, user.id);
      const { error } = await supabase.from("student_expenses").insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("درخواست هزینه برای بررسی استاد ارسال شد.");
      setForm({ ...initialForm(), student_id: user.id });
      setErrors({});
      await queryClient.invalidateQueries({ queryKey: ["student_expenses", "mine", user.id] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const set = <K extends keyof StudentExpenseForm>(key: K, value: StudentExpenseForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="حساب هنرجویی"
        title="هزینه‌های جانبی"
        description="هزینه‌هایی مثل رنگ، ابزار، عکاسی و چاپ را ثبت کن تا استاد یا مدیریت بررسی کند."
      />
      <Section title="وضعیت درخواست‌ها">
        <div className="grid gap-3 sm:grid-cols-3">
          {(["pending", "approved", "rejected"] as const).map((status) => (
            <div key={status} className="surface border p-4">
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[status]}</p>
              <p className="mt-2 font-display text-xl font-semibold">{toPersianDigits(summary[status].count)}</p>
              <p className="text-sm text-muted-foreground">{formatAmountFa(summary[status].total)} تومان</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="ثبت هزینه جدید">
        <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={(event) => {
          event.preventDefault();
          const found = validateStudentExpenseForm(form);
          setErrors(found);
          if (Object.keys(found).length) return;
          submit.mutate();
        }}>
          <div className="space-y-2">
            <Label htmlFor="expense-category">دسته‌بندی</Label>
            <NativeSelect id="expense-category" value={form.category}
              onChange={(event) => set("category", event.target.value as StudentExpenseForm["category"])}>
              {STUDENT_EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{STUDENT_EXPENSE_CATEGORY_LABEL[category]}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-title">عنوان هزینه</Label>
            <Input id="expense-title" value={form.title} maxLength={120}
              onChange={(event) => set("title", event.target.value)} placeholder="مثلاً خرید رنگ روغن" />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-amount">مبلغ به تومان</Label>
            <Input id="expense-amount" inputMode="numeric" dir="ltr" className="text-start"
              value={form.amount} onChange={(event) => set("amount", event.target.value)} placeholder="مثلاً ۸۵۰۰۰۰" />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="expense-date">تاریخ هزینه</Label>
            <JalaliDatePicker id="expense-date" label="تاریخ هزینه" value={form.expense_date}
              onChange={(value) => set("expense_date", value)} />
            {errors.expense_date && <p className="text-xs text-destructive">{errors.expense_date}</p>}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="expense-description">توضیحات (اختیاری)</Label>
            <Textarea id="expense-description" rows={3} maxLength={1000} value={form.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="جزئیات خرید یا علت هزینه…" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "در حال ارسال…" : "ارسال برای بررسی"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">تا زمان تأیید استاد یا مدیریت، این مبلغ به بدهی حساب اضافه نمی‌شود.</p>
      </Section>

      <Section title="تاریخچه هزینه‌ها">
        {expenses.isPending ? <LoadingRows rows={3} /> : expenses.error ? (
          <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
        ) : !expenses.data?.length ? (
          <EmptyState title="هنوز هزینه‌ای ثبت نکرده‌ای" description="درخواست‌های هزینه پس از ارسال در این بخش دیده می‌شوند." />
        ) : (
          <ul className="space-y-3">
            {expenses.data.map((expense) => (
              <li key={expense.id} className="surface flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold">{expense.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {STUDENT_EXPENSE_CATEGORY_LABEL[expense.category]} · {formatDateFa(expense.expense_date, true)}
                  </p>
                  {expense.description && <p className="mt-2 text-sm text-muted-foreground">{expense.description}</p>}
                  {expense.review_note && <p className="mt-2 text-sm text-muted-foreground">توضیح بررسی: {expense.review_note}</p>}
                </div>
                <div className="text-end">
                  <p className="font-display font-semibold">{formatAmountFa(expense.amount)} تومان</p>
                  <span className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs">{STATUS_LABEL[expense.status]}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
