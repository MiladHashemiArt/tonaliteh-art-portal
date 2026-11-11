import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/states";

// TODO: full page pending — see roadmap.md.
export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [{ title: "پروفایل | تنالیته" }] }),
  component: () => (
    <>
      <PageHeader back={{ to: "/app" }} title="پروفایل" />
      <EmptyState title="این بخش به‌زودی تکمیل می‌شود" />
    </>
  ),
});
