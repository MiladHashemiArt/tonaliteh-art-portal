import { createFileRoute, redirect } from "@tanstack/react-router";

import { homePathForRole } from "@/lib/domain/roles";

export const Route = createFileRoute("/app/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: homePathForRole(context.role), replace: true });
  },
});
