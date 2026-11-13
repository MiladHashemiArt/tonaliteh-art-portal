import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Brush, GraduationCap, Landmark } from "lucide-react";

import atelierStudy from "@/assets/atelier-study.jpg";
import { BrandMark, Wordmark } from "@/components/brand/Wordmark";
import { supabase } from "@/lib/backend/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "گروه هنری تنالیته | خوش آمدید" },
      {
        name: "description",
        content:
          "ورود هنرجویان، استاد و مدیریت گروه هنری تنالیته؛ برنامهٔ کلاس‌ها، اطلاعیه‌ها و پرداخت‌ها.",
      },
      { property: "og:title", content: "گروه هنری تنالیته" },
      {
        property: "og:description",
        content: "آتلیهٔ طراحی و رنگ تنالیته — ورود هنرجویان و کادر آموزشی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Welcome,
});

const ROLES = [
  {
    role: "student" as const,
    title: "هنرجو",
    text: "برنامهٔ کلاس‌ها، ثبت‌نام، غیبت و پرداخت‌ها",
    icon: GraduationCap,
  },
  {
    role: "teacher" as const,
    title: "استاد",
    text: "کلاس‌ها، هنرجویان و اطلاعیه‌ها",
    icon: Brush,
  },
  {
    role: "manager" as const,
    title: "مدیریت",
    text: "مدیریت آموزشگاه، پرداخت‌ها و تنظیمات",
    icon: Landmark,
  },
];

function Welcome() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <div className="paper-grain min-h-dvh bg-background">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <main className="flex flex-col px-6 pb-14 pt-10 sm:px-10 lg:py-16">
          <Link
            to="/"
            className="flex w-fit items-center gap-3 animate-fade"
            aria-label="تنالیته — صفحهٔ نخست"
          >
            <BrandMark className="size-9" />
            <span className="text-sm tracking-wide text-muted-foreground">گروه هنری</span>
          </Link>

          <section className="mt-14 sm:mt-20" aria-labelledby="welcome-title">
            <p className="text-sm text-bronze animate-rise">آتلیهٔ طراحی و رنگ</p>
            <h1 id="welcome-title" className="mt-3 animate-rise">
              <Wordmark className="text-7xl sm:text-8xl" />
            </h1>
            <p className="mt-6 max-w-md font-display text-lg leading-9 text-foreground/85 animate-rise [animation-delay:120ms]">
              به خانهٔ هنر خوش آمدید. اینجا هر خط، آغاز دیدنی تازه است؛ جایی برای آموختن، تمرین و
              همراهی در مسیر طراحی و رنگ.
            </p>
          </section>

          <div className="bronze-rule mt-14 w-32 sm:mt-16" aria-hidden />

          <section
            className="mt-12 animate-rise [animation-delay:220ms]"
            aria-labelledby="entry-title"
          >
            <h2 id="entry-title" className="text-base font-semibold text-foreground">
              ورود یا ثبت‌نام
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">نقش خود را برای ورود انتخاب کنید.</p>

            {signedIn && (
              <Link
                to="/app"
                className="mt-5 flex items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-lift transition-transform hover:-translate-y-0.5"
              >
                <span className="font-medium">ادامه در پنل من</span>
                <ArrowLeft className="size-5" aria-hidden />
              </Link>
            )}

            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {ROLES.map(({ role, title, text, icon: Icon }) => (
                <li key={role}>
                  <Link
                    to="/auth"
                    search={{ role }}
                    className="group surface flex h-full items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-bronze/60 hover:shadow-lift sm:flex-col sm:items-start sm:p-5"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-accent-foreground">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="flex-1">
                      <span className="block font-display text-lg font-semibold text-foreground">
                        {title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-6 text-muted-foreground">
                        {text}
                      </span>
                    </span>
                    <ArrowLeft
                      className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-1 sm:hidden"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-auto pt-14 text-xs text-muted-foreground">© گروه هنری تنالیته</p>
        </main>

        <aside className="relative hidden lg:block" aria-hidden>
          <div className="sticky top-0 h-dvh p-6">
            <img
              src={atelierStudy}
              alt=""
              width={1280}
              height={1600}
              className="h-full w-full rounded-[2rem] border border-border object-cover shadow-lift"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
