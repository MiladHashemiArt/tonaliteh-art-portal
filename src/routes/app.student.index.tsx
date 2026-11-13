import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CalendarDays, CalendarX2, CreditCard, Palette } from "lucide-react";

import { ContactCard } from "@/components/app/ContactCard";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { SessionMeta, sessionTimeRange } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows, SetupNotice } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import {
  announcementsQuery,
  myEnrollmentsQuery,
  notificationsQuery,
  profileQuery,
  sessionsQuery,
} from "@/lib/backend/queries";
import { formatRelativeFa, toPersianDigits } from "@/lib/domain/persian";
import { sessionTitle, sortSessions, weekdayLabel } from "@/lib/domain/schedule";

export const Route = createFileRoute("/app/student/")({
  head: () => ({ meta: [{ title: "پنل هنرجو | تنالیته" }] }),
  component: StudentHome,
});

function StudentHome() {
  const { user } = useAppSession();
  const profile = useQuery(profileQuery(user.id));
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const announcements = useQuery(announcementsQuery());
  const notifications = useQuery(notificationsQuery(user.id));

  const enrolledIds = new Set((enrollments.data ?? []).map((e) => String(e.class_id)));
  const mine = sortSessions((sessions.data ?? []).filter((s) => enrolledIds.has(String(s.id))));
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  const p = profile.data;
  const incomplete = p && (!p.phone || !p.home_address);

  return (
    <>
      <PageHeader
        eyebrow="پنل هنرجو"
        title={`سلام، ${p?.full_name?.split(" ")[0] || "هنرجوی عزیز"}`}
        description="برنامهٔ کلاس‌ها، اطلاعیه‌ها و کارهای شما در یک نگاه."
      />

      {incomplete && (
        <div className="mb-8">
          <SetupNotice>
            اطلاعات تماس یا نشانی شما کامل نیست.{" "}
            <Link
              to="/app/profile"
              className="font-medium text-bronze underline-offset-4 hover:underline"
            >
              تکمیل پروفایل
            </Link>
          </SetupNotice>
        </div>
      )}

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { to: "/app/student/schedule", label: "انتخاب کلاس", icon: CalendarDays },
          { to: "/app/student/absences", label: "اعلام غیبت", icon: CalendarX2 },
          { to: "/app/student/payments", label: "پرداخت‌ها", icon: CreditCard },\n          { to: "/app/student/portfolio", label: "پرونده هنری", icon: Palette },
          {
            to: "/app/notifications",
            label: unread ? `اعلان‌ها (${toPersianDigits(unread)})` : "اعلان‌ها",
            icon: Bell,
          },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="surface flex flex-col items-start gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <Icon className="size-5 text-bronze" aria-hidden />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Section
            title="کلاس‌های من"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/student/schedule">
                  ویرایش <ArrowLeft />
                </Link>
              </Button>
            }
          >
            {sessions.isPending || enrollments.isPending ? (
              <LoadingRows rows={2} />
            ) : sessions.error || enrollments.error ? (
              <ErrorState
                error={sessions.error ?? enrollments.error}
                onRetry={() => {
                  sessions.refetch();
                  enrollments.refetch();
                }}
              />
            ) : mine.length === 0 ? (
              <EmptyState
                title="هنوز در کلاسی ثبت‌نام نکرده‌اید"
                description="از برنامهٔ هفتگی، هر تعداد جلسه که می‌خواهید انتخاب کنید."
                action={
                  <Button asChild>
                    <Link to="/app/student/schedule">دیدن برنامه</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3">
                {mine.map((s) => (
                  <li key={String(s.id)} className="surface flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display font-semibold">{sessionTitle(s)}</span>
                      <span className="text-sm text-muted-foreground">
                        {weekdayLabel(s.class_day)} · {sessionTimeRange(s)}
                      </span>
                    </div>
                    <SessionMeta session={s} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="تازه‌ترین اطلاعیه‌ها"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/app/announcements">
                  همه <ArrowLeft />
                </Link>
              </Button>
            }
          >
            {announcements.isPending ? (
              <LoadingRows rows={2} />
            ) : announcements.error ? (
              <ErrorState error={announcements.error} onRetry={() => announcements.refetch()} />
            ) : !announcements.data?.length ? (
              <EmptyState title="اطلاعیه‌ای منتشر نشده است" />
            ) : (
              <ul className="space-y-3">
                {announcements.data.slice(0, 3).map((a) => (
                  <li key={String(a.id)} className="surface p-4">
                    <p className="font-display font-semibold">{a.title}</p>
                    {a.content && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.content}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatRelativeFa(a.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <aside>
          <Section title="تماس با استاد">
            <ContactCard />
          </Section>
        </aside>
      </div>
    </>
  );
}
