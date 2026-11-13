import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut, Menu } from "lucide-react";

import { BrandMark, Wordmark } from "@/components/brand/Wordmark";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAppSession } from "@/hooks/use-app-session";
import { syncPendingSignupDetails } from "@/lib/backend/auth";
import { supabase } from "@/lib/backend/client";
import { notificationsQuery, qk } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { ROLE_LABEL, staffDisplayName } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";

import { isActivePath, mobileTabsFor, navFor } from "./nav";
import { QuoteFooter } from "./QuoteFooter";
import { SetupNotice } from "./states";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, profileError, role } = useAppSession();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const [moreOpen, setMoreOpen] = useState(false);
  const synced = useRef(false);

  const notifications = useQuery(notificationsQuery(user.id));
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    syncPendingSignupDetails(user, profile)
      .then((changed) => {
        if (changed) {
          queryClient.invalidateQueries({ queryKey: qk.profile(user.id) });
        }
      })
      .catch(() => {
        /* Profile form lets the student finish details manually. */
      });
  }, [user, profile, queryClient]);

  useEffect(() => setMoreOpen(false), [pathname]);

  useEffect(() => {
    const channel = supabase
      .channel(`tonaliteh-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: qk.notifications(user.id) });
          const row = payload.new as { title?: string | null; body?: string | null };
          if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
          void navigator.serviceWorker?.ready.then((registration) =>
            registration.showNotification(row.title || "اعلان تازه از تنالیته", {
              body: row.body || "یک اعلان تازه در پنل شما ثبت شده است.",
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
              dir: "rtl",
              lang: "fa",
              data: { url: "/app/notifications" },
            }),
          ).catch(() => undefined);
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, user.id]);

  const nav = navFor(role);
  const tabs = mobileTabsFor(role);
  const displayName =
    role === "student"
      ? profile?.full_name || "هنرجوی عزیز"
      : staffDisplayName(role, profile?.full_name);

  return (
    <div className="paper-grain flex min-h-dvh flex-col bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        رفتن به محتوای اصلی
      </a>

      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="تنالیته — صفحهٔ نخست">
            <BrandMark className="size-9" />
            <Wordmark className="text-xl leading-none" />
          </Link>
          <span className="hidden rounded-full bg-bronze-soft px-2.5 py-0.5 text-xs text-accent-foreground sm:inline">
            {ROLE_LABEL[role]}
          </span>

          <nav aria-label="منوی اصلی" className="ms-6 hidden flex-1 items-center gap-1 lg:flex">
            {nav
              .filter((i) => i.to !== "/app/notifications" && i.to !== "/app/profile")
              .map((item) => {
                const active = isActivePath(pathname, item);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          <div className="ms-auto flex items-center gap-1.5">
            <Link
              to="/app/notifications"
              className="relative inline-flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
              aria-label={unread ? `اعلان‌ها، ${toPersianDigits(unread)} خوانده‌نشده` : "اعلان‌ها"}
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute -top-0.5 -end-0.5 flex min-w-5 items-center justify-center rounded-full bg-bronze px-1 text-[11px] font-semibold text-primary-foreground">
                  {toPersianDigits(unread > 99 ? "99+" : unread)}
                </span>
              )}
            </Link>
            <Link
              to="/app/profile"
              className="hidden items-center gap-2 rounded-full py-1 pe-1 ps-3 text-sm text-foreground transition-colors hover:bg-accent sm:inline-flex"
            >
              <span className="max-w-[10rem] truncate">{displayName}</span>
              <ProfileAvatar path={profile?.avatar_path} name={displayName} className="size-9" fallbackClassName="text-sm" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={signOut}
              aria-label="خروج از حساب"
              title="خروج"
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-8 sm:px-6 lg:pb-16">
        {(profileError || !profile) && (
          <div className="mb-6">
            <SetupNotice>
              {profileError
                ? "پروفایل شما بارگذاری نشد. اتصال را بررسی کنید و صفحه را دوباره باز کنید."
                : "پروفایل شما هنوز ساخته نشده است. اگر به‌تازگی ثبت‌نام کرده‌اید چند لحظه بعد دوباره وارد شوید؛ در غیر این صورت با مدیریت تماس بگیرید."}
            </SetupNotice>
          </div>
        )}
        <div
          key={nav.find((item) => isActivePath(pathname, item))?.to ?? pathname}
          className="page-turn-enter"
        >
          {children}
        </div>
      </main>

      <QuoteFooter />

      {/* Phone bottom navigation */}
      <nav
        aria-label="منوی پایین"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((item) => {
            const active = isActivePath(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("size-5", active && "text-bronze")} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
              aria-haspopup="dialog"
            >
              <Menu className="size-5" aria-hidden />
              بیشتر
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl bg-card pb-8">
          <SheetHeader className="text-start">
            <SheetTitle className="font-display">منو</SheetTitle>
          </SheetHeader>
          <ul className="mt-2 grid grid-cols-3 gap-2 px-4">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = isActivePath(pathname, item);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors",
                      active ? "border-bronze bg-bronze-soft" : "border-border hover:bg-accent",
                    )}
                  >
                    <Icon className="size-5 text-bronze" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 px-4">
            <Button variant="outline" className="w-full" onClick={signOut}>
              <LogOut /> خروج از حساب
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
