import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { canAccessStudentArea, homePathForRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app/student")({
  beforeLoad: ({ context }) => {
    // A manager may also use the student area on the same account.
    // Teacher-only and student-only accounts keep their existing boundaries.
    if (!canAccessStudentArea(context.role)) {
      throw redirect({ to: homePathForRole(context.role) });
    }
  },
  component: Outlet,
});
