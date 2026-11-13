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
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.to} to={s.to} className="surface p-5 transition-all hover:shadow-lift">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {s.value === undefined ? "…" : toPersianDigits(s.value)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
