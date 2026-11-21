import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { homePathForRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app/student")({
  beforeLoad: ({ context }) => {
    if (!context.canAccessStudent) throw redirect({ to: homePathForRole(context.role) });
  },
  component: Outlet,
});
