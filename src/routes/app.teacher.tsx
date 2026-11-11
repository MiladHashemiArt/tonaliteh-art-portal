import { createFileRoute, redirect } from "@tanstack/react-router";

import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { homePathForRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app/teacher")({
  beforeLoad: ({ context }) => {
    if (context.role !== "teacher") throw redirect({ to: homePathForRole(context.role) });
  },
  component: StaffDashboard,
});
