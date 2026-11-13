import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/backend/client";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="paper-grain flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <p className="brand-wordmark text-5xl text-foreground">تنالیته</p>
        <h1 className="mt-6 text-2xl font-semibold text-foreground">این صفحه پیدا نشد</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          نشانی واردشده وجود ندارد یا جابه‌جا شده است.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            بازگشت به صفحهٔ نخست
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="paper-grain flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">صفحه بارگذاری نشد</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          مشکلی پیش آمد. دوباره تلاش کنید یا به صفحهٔ نخست بازگردید.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            تلاش دوباره
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-input bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            صفحهٔ نخست
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "تنالیته | آموزشگاه هنری" },
      { name: "description", content: "سامانهٔ هنرجویان و کادر آموزشی گروه هنری تنالیته." },
      { name: "author", content: "تنالیته" },
      { name: "theme-color", content: "#f6f1e7" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "تنالیته" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { property: "og:site_name", content: "تنالیته" },
      { property: "og:locale", content: "fa_IR" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@500;700&family=Vazirmatn:wght@300;400;500;600;700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.navigate({ to: "/reset-password" });
        return;
      }
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") queryClient.clear();
      router.invalidate();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </QueryClientProvider>
  );
}
