import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ClipboardCheck,
  FolderOpen,
  Users,
  CalendarDays,
  CalendarX2,
} from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { SetupNotice } from "@/components/app/states";
import { useAppSession } from "@/hooks/use-app-session";
import { allAbsencesQuery, sessionsQuery, studentsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { ROLE_LABEL, staffDisplayName } from "@/lib/domain/roles";

export function StaffDashboard() {
  const { role, profile } = useAppSession();
  const students = useQuery(studentsQuery());
  const sessions = useQuery(sessionsQuery());
  const absences = useQuery(allAbsencesQuery());
  const needsAnchor = (sessions.data ?? []).some(
    (s) => (s.recurrence_weeks ?? 1) > 1 && !s.recurrence_anchor_date,
  );

  const stats = [
    { to: "/app/staff/students", label: "هنرجویان", value: students.data?.length, icon: Users },
    {
      to: "/app/staff/classes",
      label: "جلسات فعال",
      value: sessions.data?.filter((s) => s.is_active !== false).length,
      icon: CalendarDays,
    },
    {
      to: "/app/staff/absences",
      label: "غیبت‌های ثبت‌شده",
      value: absences.data?.length,
      icon: CalendarX2,
    },
  ];

  const actions = [
    {
      to: "/app/staff/attendance",
      label: "ثبت حضور و غیاب",
      description: "مدیریت وضعیت حضور هنرجویان",
      icon: ClipboardCheck,
    },
    {
      to: "/app/staff/portfolio",
      label: "پروندهٔ هنری هنرجویان",
      description: "آثار، بازخوردها و روند پیشرفت",
      icon: FolderOpen,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={`پنل ${ROLE_LABEL[role]}`}
        title={`سلام، ${staffDisplayName(role, profile?.full_name)}`}
        description="نمای کلی آموزشگاه."
      />
      {needsAnchor && (
        <div className="mb-6">
          <SetupNotice>
            برای کلاس‌های یک هفته در میان، تاریخ هفتهٔ شروع هنوز تعیین نشده است.{" "}
            <Link to="/app/staff/classes" className="font-medium text-bronze hover:underline">
              تعیین تاریخ
            </Link>
          </SetupNotice>
        </div>
      )}

      <section aria-label="آمار آموزشگاه" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ to, label, value, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="surface group relative flex min-h-28 flex-col justify-between gap-3 overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:min-h-32 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-bronze/20 bg-bronze-soft/70 text-bronze">
                <Icon className="size-[18px]" aria-hidden />
              </span>
            </div>
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground sm:text-4xl">
              {value === undefined ? "—" : toPersianDigits(value)}
            </p>
          </Link>
        ))}
      </section>

      <section aria-label="دسترسی‌های سریع" className="mt-10 space-y-4">
        <div className="flex items-center justify-between border-b border-bronze/20 px-1 pb-3">
          <h2 className="font-display text-lg font-semibold">دسترسی سریع</h2>
          <span className="text-xs text-muted-foreground">ابزارهای آموزشگاه</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {actions.map(({ to, label, description, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="surface flex min-h-[92px] items-center gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-bronze/50 hover:shadow-lift"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-bronze/20 bg-bronze-soft/70 text-bronze">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
              </span>
              <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
