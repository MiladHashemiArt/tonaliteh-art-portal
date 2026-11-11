import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/states";

// TODO: full page pending — see roadmap.md.
export const Route = createFileRoute("/app/staff/classes")({
  head: () => ({ meta: [{ title: "کلاس‌ها | تنالیته" }] }),
  component: () => (
    <>
      <PageHeader back={{ to: "/app" }} title="کلاس‌ها" />
      <EmptyState title="این بخش به‌زودی تکمیل می‌شود" />
    </>
  ),
});
