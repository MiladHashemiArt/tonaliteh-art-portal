import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/PageHeader";
import { SetupNotice } from "@/components/app/states";
import { useAppSession } from "@/hooks/use-app-session";
import { allAbsencesQuery, sessionsQuery, studentsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { ROLE_LABEL, staffDisplayName } from "@/lib/domain/roles";

export function StaffDashboard() {
  const { role, profile } = useAppSession();
  const [layout, setLayout] = useState<"two" | "list" | "four">("two");
  const students = useQuery(studentsQuery());
  const sessions = useQuery(sessionsQuery());
  const absences = useQuery(allAbsencesQuery());
  const needsAnchor = (sessions.data ?? []).some(
    (s) => (s.recurrence_weeks ?? 1) > 1 && !s.recurrence_anchor_date,
  );
  const stats = [
    {
      to: "/app/staff/students",
      label: "تعداد هنرجویان",
      value: students.data?.length,
    },
    {
      to: "/app/staff/classes",
      label: "جلسات فعال",
      value: sessions.data?.filter((s) => s.is_active !== false).length,
    },
    { to: "/app/staff/absences", label: "غیبت‌های ثبت‌شده", value: absences.data?.length },
    { to: "/app/staff/attendance", label: "ثبت حضور و غیاب" },
  ];
  return (
    <>
      <PageHeader
        eyebrow={`پنل ${ROLE_LABEL[role]}`}
        title={`سلام، ${staffDisplayName(role, profile?.full_name)}`}
        description="نمای کلی آموزشگاه."
      />
      {needsAnchor && (
        <div className="mb-8">
          <SetupNotice>
            برای کلاس‌های یک هفته در میان، تاریخ هفتهٔ شروع هنوز تعیین نشده است.{" "}
            <Link to="/app/staff/classes" className="font-medium text-bronze hover:underline">
              تعیین تاریخ
            </Link>
          </SetupNotice>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">نحوهٔ نمایش بخش‌ها</p>
        <div className="inline-flex rounded-xl border border-border bg-muted/50 p-1" role="group" aria-label="نوع چیدمان">
          <button type="button" onClick={() => setLayout("two")} aria-pressed={layout === "two"}
            className={`rounded-lg px-3 py-2 text-xs transition-colors ${layout === "two" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            ۲ × ۲
          </button>
          <button type="button" onClick={() => setLayout("list")} aria-pressed={layout === "list"}
            className={`rounded-lg px-3 py-2 text-xs transition-colors ${layout === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            فهرستی
          </button>
          <button type="button" onClick={() => setLayout("four")} aria-pressed={layout === "four"}
            className={`rounded-lg px-3 py-2 text-xs transition-colors ${layout === "four" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            ۴ ستونه
          </button>
        </div>
      </div>
      <div className={`grid gap-3 ${layout === "two" ? "grid-cols-2" : layout === "list" ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-4"}`}>
        {stats.map((s) => (
          <Link key={s.to} to={s.to} className="surface min-h-28 p-4 transition-all hover:shadow-lift sm:p-5">
            <p className="text-sm leading-6 text-muted-foreground">{s.label}</p>
            {s.value !== undefined && (
              <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                {toPersianDigits(s.value)}
              </p>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}
