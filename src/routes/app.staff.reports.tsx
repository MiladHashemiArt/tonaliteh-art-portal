import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, ChevronRight, ChevronLeft, CalendarDays, Wallet, ClipboardCheck, Users } from "lucide-react";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { weeklyAttendanceQuery, weeklyAdjustmentsQuery, weeklyPaymentsQuery } from "@/lib/backend/queries";
import { buildWeeklyOperationsReport } from "@/lib/domain/payments";
import { formatAmountFa, formatDateFa, toIsoDate, toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/reports")({
  head: () => ({ meta: [{ title: "گزارش هفتگی آموزشگاه | تنالیته" }] }),
  component: WeeklyReportPage,
});

function tehranToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function shiftIsoDate(iso: string, days: number) {
  const date = new Date(iso + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekRange(anchor: string) {
  const date = new Date(anchor + "T12:00:00Z");
  const weekday = (date.getUTCDay() + 6) % 7;
  const from = shiftIsoDate(anchor, -weekday);
  return { from, to: shiftIsoDate(from, 6) };
}

function csvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function WeeklyReportPage() {
  const [anchor, setAnchor] = useState(tehranToday);
  const range = useMemo(() => weekRange(anchor), [anchor]);
  const attendance = useQuery(weeklyAttendanceQuery(range.from, range.to));
  const payments = useQuery(weeklyPaymentsQuery(range.from, range.to));
  const adjustments = useQuery(weeklyAdjustmentsQuery(range.from, range.to));
  const report = useMemo(
    () => buildWeeklyOperationsReport(attendance.data ?? [], payments.data ?? [], adjustments.data ?? []),
    [attendance.data, payments.data, adjustments.data],
  );
  const loading = attendance.isPending || payments.isPending || adjustments.isPending;
  const error = attendance.error || payments.error || adjustments.error;

  const downloadCsv = () => {
    const rows = [
      ["گزارش هفتگی تنالیته", `${range.from} تا ${range.to}`],
      ["شاخص", "مقدار"],
      ["کل سوابق حضور", report.attendance.total],
      ["حاضر", report.attendance.present],
      ["غیبت با اطلاع", report.attendance.priorNotice],
      ["غیبت بدون اطلاع", report.attendance.noNotice],
      ["ثبت‌نشده", report.attendance.pending],
      ["جلسه لغوشده", report.attendance.cancelled],
      ["تعداد تاریخ‌های دارای سابقه", report.sessions.uniqueDates],
      ["مبلغ وصول‌شده (تومان)", report.finance.paid],
      ["در انتظار پرداخت (تومان)", report.finance.pending],
      ["مبالغ ردشده (تومان)", report.finance.rejected],
      ["مجموع هزینه‌های اضافه (تومان)", report.finance.extra],
      ["تعداد اضافه‌جلسه", report.adjustments.extraSessions],
      ["دقایق اضافه‌زمان", report.adjustments.extraTimeMinutes],
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(value => csvCell(value)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tonaliteh-weekly-${range.from}-${range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow="گزارش‌های آموزشگاه"
        title="گزارش هفتگی"
        description="نمای یکپارچهٔ حضور و غیاب و وضعیت مالی در هفتهٔ انتخاب‌شده."
        actions={<Button onClick={downloadCsv} disabled={loading || !!error}><Download /> خروجی Excel (CSV)</Button>}
      />

      <div className="surface mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <Button variant="outline" size="sm" onClick={() => setAnchor(shiftIsoDate(range.from, -7))}><ChevronRight /> هفتهٔ قبل</Button>
        <div className="text-center">
          <p className="text-sm font-semibold">{formatDateFa(range.from)} تا {formatDateFa(range.to)}</p>
          <p className="mt-1 text-xs text-muted-foreground">مبنای هفته: شنبه تا جمعه به وقت تهران</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setAnchor(shiftIsoDate(range.from, 7))}>هفتهٔ بعد <ChevronLeft /></Button>
      </div>

      {loading ? <LoadingRows rows={5} /> : error ? (
        <ErrorState error={error} onRetry={() => { void attendance.refetch(); void payments.refetch(); void adjustments.refetch(); }} />
      ) : (
        <>
          <Section title="حضور و غیاب">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["کل سوابق", report.attendance.total],
                ["حاضر", report.attendance.present],
                ["غیبت با اطلاع", report.attendance.priorNotice],
                ["غیبت بدون اطلاع", report.attendance.noNotice],
                ["ثبت‌نشده", report.attendance.pending],
                ["جلسه لغوشده", report.attendance.cancelled],
              ].map(([label, value]) => <div key={label} className="surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-semibold">{toPersianDigits(value)}</p></div>)}
            </div>
          </Section>

          <Section title="خلاصهٔ مالی">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ["وصول‌شده", report.finance.paid],
                ["در انتظار پرداخت", report.finance.pending],
                ["ردشده / برگشتی", report.finance.rejected],
              ].map(([label, value]) => <div key={label} className="surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold">{formatAmountFa(value)}</p></div>)}
            </div>
            <div className="surface mt-3 grid grid-cols-2 gap-3 p-4">
              <div><p className="text-xs text-muted-foreground">هزینهٔ اضافه ثبت‌شده</p><p className="mt-1 font-semibold">{formatAmountFa(report.finance.extra)}</p></div>
              <div><p className="text-xs text-muted-foreground">تعداد اضافه‌جلسه</p><p className="mt-1 font-semibold">{toPersianDigits(report.adjustments.extraSessions)}</p></div>
              <div><p className="text-xs text-muted-foreground">دقایق اضافه‌زمان</p><p className="mt-1 font-semibold">{toPersianDigits(report.adjustments.extraTimeMinutes)} دقیقه</p></div>
              <div><p className="text-xs text-muted-foreground">روزهای دارای سابقه</p><p className="mt-1 font-semibold">{toPersianDigits(report.sessions.uniqueDates)}</p></div>
            </div>
          </Section>

          <div className="surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>این گزارش فقط داده‌های ثبت‌شده در بازهٔ انتخابی را نمایش می‌دهد؛ جلسه یا پرداخت فرضی ساخته نمی‌شود.</span>
            <Button variant="outline" size="sm" onClick={downloadCsv}><Download /> دریافت گزارش</Button>
          </div>
        </>
      )}
    </>
  );
}
