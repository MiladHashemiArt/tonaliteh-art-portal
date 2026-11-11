import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app/AppShell";
import { supabase } from "@/lib/backend/client";
import { profileQuery } from "@/lib/backend/queries";
import { normalizeRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app")({
  // The session lives in browser storage, so this area renders client-side only.
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    let profile = null;
    let profileError = false;
    try {
      profile = await context.queryClient.ensureQueryData(profileQuery(data.user.id));
    } catch {
      profileError = true;
    }
    // The role always comes from the database profile, never from what the user picked.
    return { user: data.user, profile, profileError, role: normalizeRole(profile?.role) };
  },
  head: () => ({
    meta: [
      { title: "پنل تنالیته" },
      { name: "description", content: "پنل هنرجویان و کادر آموزشی تنالیته" },
      { property: "og:title", content: "پنل تنالیته" },
      { property: "og:description", content: "پنل هنرجویان و کادر آموزشی تنالیته" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
