import { createFileRoute, redirect } from "@tanstack/react-router";

import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { homePathForRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app/manager")({
  beforeLoad: ({ context }) => {
    if (context.role !== "manager") throw redirect({ to: homePathForRole(context.role) });
  },
  component: StaffDashboard,
});
