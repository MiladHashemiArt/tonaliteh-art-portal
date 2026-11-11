import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { isStaff } from "@/lib/domain/roles";

/** Teacher and manager share every page under /app/staff. The database policies still decide each write. */
export const Route = createFileRoute("/app/staff")({
  beforeLoad: ({ context }) => {
    if (!isStaff(context.role)) throw redirect({ to: "/app/student" });
  },
  component: Outlet,
});
