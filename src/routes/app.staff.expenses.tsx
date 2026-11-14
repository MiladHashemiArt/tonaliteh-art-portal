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
import { supabase } from "@/lib/backend/client";
import { allProfilesQuery, friendlyError } from "@/lib/backend/queries";
import type { StudentExpenseRow } from "@/lib/backend/types";
import {
  STUDENT_EXPENSE_CATEGORIES,
  STUDENT_EXPENSE_CATEGORY_LABEL,
  validateStudentExpenseForm,
  type StudentExpenseForm,
  type StudentExpenseFormErrors,
} from "@/lib/domain/expenses";
import { formatAmountFa, formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/expenses")({
  head: () => ({ meta: [{ title: "مدیریت هزینه‌های جانبی | تنالیته" }] }),
  component: StaffExpensesPage,
});

const blankForm = (): StudentExpenseForm => ({
  student_id: "",
  category: "materials",
  title: "",
  description: "",
  amount: "",
  expense_date: toIsoDate(new Date()),
});

function StaffExpensesPage() {
  const queryClient = useQueryClient();
  const profiles = useQuery(allProfilesQuery());
  const expenses = useQuery({
    queryKey: ["student_expenses", "staff"],
    queryFn: async (): Promise<StudentExpenseRow[]> => {
      const { data, error } = await supabase.from("student_expenses")
        .select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [form, setForm] = useState<StudentExpenseForm>(blankForm);
  const [errors, setErrors] = useState<StudentExpenseFormErrors>({});
  const names = useMemo(() => new Map((profiles.data ?? []).map((p) => [p.id, p.full_name || "هنرجوی بدون نام"])), [profiles.data]);
  const pending = (expenses.data ?? []).filter((item) => item.status === "pending");

  const addExpense = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("student_expenses").insert({
        student_id: form.student_id,
        submitted_by: (await supabase.auth.getUser()).data.user?.id ?? "",
        category: form.category,
        title: form.title.trim(),
        description: form.description.trim() || null,
        amount: Number(form.amount.replace(/[٬،,\s]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))),
        expense_date: form.expense_date,
        status: "approved",
        reviewed_by: (await supabase.auth.getUser()).data.user?.id ?? "",
        reviewed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("هزینه به حساب هنرجو اضافه شد.");
      setForm(blankForm());
      setErrors({});
      await queryClient.invalidateQueries({ queryKey: ["student_expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const review = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: "approved" | "rejected"; note: string }) => {
      const { error } = await supabase.from("student_expenses")
        .update({ status, review_note: note.trim() || null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      toast.success(variables.status === "approved" ? "هزینه تأیید و به حساب اضافه شد." : "درخواست هزینه رد شد.");
      await queryClient.invalidateQueries({ queryKey: ["student_expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const set = <K extends keyof StudentExpenseForm>(key: K, value: StudentExpenseForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow="مدیریت مالی"
        title="هزینه‌های جانبی هنرجویان"
        description="درخواست‌های هنرجویان را بررسی کن یا هزینه‌ای را مستقیم به حساب هنرجو اضافه کن."
      />
      <Section title="ثبت مستقیم هزینه">
        <form className="grid gap-4 md:grid-cols-2" noValidate onSubmit={(event) => {
          event.preventDefault();
          const found = validateStudentExpenseForm(form);
          setErrors(found);
          if (Object.keys(found).length) return;
          addExpense.mutate();
        }}>
          <div className="space-y-2">
            <Label htmlFor="staff-expense-student">هنرجو</Label>
            <NativeSelect id="staff-expense-student" value={form.student_id}
              onChange={(event) => set("student_id", event.target.value)}>
              <option value="">انتخاب هنرجو…</option>
              {(profiles.data ?? []).filter((p) => p.role === "student").map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || "بدون نام"}{p.phone ? " · " + toPersianDigits(p.phone) : ""}</option>
              ))}
            </NativeSelect>
            {errors.student_id && <p className="text-xs text-destructive">{errors.student_id}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-expense-category">دسته‌بندی</Label>
            <NativeSelect id="staff-expense-category" value={form.category}
              onChange={(event) => set("category", event.target.value as StudentExpenseForm["category"])}>
              {STUDENT_EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{STUDENT_EXPENSE_CATEGORY_LABEL[category]}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-expense-title">عنوان</Label>
            <Input id="staff-expense-title" value={form.title} onChange={(event) => set("title", event.target.value)} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-expense-amount">مبلغ (تومان)</Label>
            <Input id="staff-expense-amount" inputMode="numeric" dir="ltr" className="text-start"
              value={form.amount} onChange={(event) => set("amount", event.target.value)} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-expense-date">تاریخ هزینه</Label>
            <JalaliDatePicker id="staff-expense-date" label="تاریخ هزینه" value={form.expense_date}
              onChange={(value) => set("expense_date", value)} />
            {errors.expense_date && <p className="text-xs text-destructive">{errors.expense_date}</p>}
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="staff-expense-description">توضیحات</Label>
            <Textarea id="staff-expense-description" rows={2} value={form.description}
              onChange={(event) => set("description", event.target.value)} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={addExpense.isPending || profiles.isPending}>
              {addExpense.isPending ? "در حال ثبت…" : "ثبت و افزودن به حساب"}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">هزینه مستقیم با تأیید استاد ثبت می‌شود و یک ردیف پرداخت در وضعیت «در انتظار» برای آن ساخته خواهد شد.</p>
      </Section>

      <Section title={`درخواست‌های در انتظار بررسی · ${toPersianDigits(pending.length)}`}>
        {expenses.isPending ? <LoadingRows rows={3} /> : expenses.error ? (
          <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
        ) : pending.length === 0 ? (
          <EmptyState title="درخواست بررسی‌نشده‌ای وجود ندارد" description="درخواست‌های تازه هنرجویان در این بخش ظاهر می‌شوند." />
        ) : (
          <ul className="space-y-3">
            {pending.map((item) => <PendingExpense key={item.id} item={item}
              studentName={names.get(item.student_id) || "هنرجوی نامشخص"}
              busy={review.isPending}
              onReview={(status, note) => review.mutate({ id: item.id, status, note })} />)}
          </ul>
        )}
      </Section>

      <Section title="تاریخچه هزینه‌ها">
        {expenses.isPending ? <LoadingRows rows={2} /> : expenses.error ? (
          <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
        ) : (
          <ul className="space-y-2">
            {(expenses.data ?? []).map((item) => (
              <li key={item.id} className="surface flex flex-wrap justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{item.title} · {names.get(item.student_id) || "هنرجو"}</p>
                  <p className="text-xs text-muted-foreground">{STUDENT_EXPENSE_CATEGORY_LABEL[item.category]} · {formatDateFa(item.expense_date, true)}</p>
                  {item.review_note && <p className="mt-1 text-xs text-muted-foreground">{item.review_note}</p>}
                </div>
                <div className="text-end">
                  <p className="font-semibold">{formatAmountFa(item.amount)} تومان</p>
                  <p className="text-xs text-muted-foreground">{item.status === "pending" ? "در انتظار" : item.status === "approved" ? "تأییدشده" : "ردشده"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function PendingExpense({
  item, studentName, busy, onReview,
}: {
  item: StudentExpenseRow;
  studentName: string;
  busy: boolean;
  onReview: (status: "approved" | "rejected", note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <li className="surface space-y-3 p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="font-semibold">{item.title} · {studentName}</p>
          <p className="text-xs text-muted-foreground">{STUDENT_EXPENSE_CATEGORY_LABEL[item.category]} · {formatDateFa(item.expense_date, true)}</p>
          {item.description && <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>}
        </div>
        <p className="font-display text-lg font-semibold">{formatAmountFa(item.amount)} تومان</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`expense-note-${item.id}`}>یادداشت بررسی (اختیاری)</Label>
        <Textarea id={`expense-note-${item.id}`} rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onReview("rejected", note)}>رد درخواست</Button>
        <Button disabled={busy} onClick={() => onReview("approved", note)}>تأیید و افزودن به حساب</Button>
      </div>
    </li>
  );
}
