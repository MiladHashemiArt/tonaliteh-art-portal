import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CalendarDays, CalendarX2, CreditCard, Palette, MessageCircle } from "lucide-react";

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
          { to: "/app/student/payments", label: "پرداخت‌ها", icon: CreditCard },
          { to: "/app/student/portfolio", label: "پرونده هنری", icon: Palette },
          { to: "/app/student/messages", label: "پیام به آموزشگاه", icon: MessageCircle },
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

          <Section title="نگاه امروز به هنر">
            <article className="surface overflow-hidden">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/1/15/The_Great_Wave_off_Kanagawa.png"
                alt="موج بزرگ کاناگاوا، اثر هوکوسای"
                className="aspect-[16/10] w-full bg-muted object-cover"
                loading="lazy"
              />
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs font-medium text-bronze">اثر منتخب · اوکی‌یوئه</p>
                  <h3 className="mt-1 font-display text-lg font-semibold">موج بزرگ کاناگاوا</h3>
                  <p className="text-sm text-muted-foreground">کاتسوشیکا هوکوسای · حدود ۱۸۲۹ تا ۱۸۳۳</p>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  در این چاپ چوبی، موج عظیم پیش‌زمینه با قوس بلند خود تقریباً تمام میدان دید را در بر می‌گیرد؛ قایق‌های کوچک در برابر آن مقیاس طبیعت را برجسته می‌کنند و کوه فوجی در دوردست، نقطه‌ای آرام و کوچک در دل حرکت پرتنش تصویر است.
                </p>
                <div className="space-y-2 border-t border-border pt-3">
                  <h4 className="text-sm font-semibold">به ترکیب‌بندی دقت کن</h4>
                  <p className="text-sm leading-7 text-muted-foreground">
                    قوس موج مانند یک قاب درونی عمل می‌کند و نگاه را به سمت فضای مرکزی و کوه فوجی هدایت می‌کند. تکرار منحنی‌ها در کف موج، کف سفید و قایق‌ها ریتم می‌سازد؛ تضاد آبی و سفید نیز حرکت و انرژی را تقویت می‌کند.
                  </p>
                  <h4 className="text-sm font-semibold">تمرین پیشنهادی امروز</h4>
                  <p className="text-sm leading-7 text-muted-foreground">
                    بدون رنگ، فقط با سه ارزش تیرگی، یک موج بزرگ طراحی کن. ابتدا خط حرکت اصلی را پیدا کن، سپس شکل‌های بزرگ را ساده‌سازی کن و در پایان نقاط کانونی را مشخص کن.
                  </p>
                </div>
                <a
                  href="https://commons.wikimedia.org/wiki/File:The_Great_Wave_off_Kanagawa.png"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-xs font-medium text-bronze underline-offset-4 hover:underline"
                >
                  مشاهده منبع اثر و مجوز CC0
                </a>
              </div>
            </article>
          </Section>
        </aside>
      </div>
    </>
  );
}
