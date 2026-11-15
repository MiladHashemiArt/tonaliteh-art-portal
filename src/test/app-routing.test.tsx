import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const router = () => createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it("matches a page for / instead of falling back to not found", () => {
    expect(router().matchRoutes("/").at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("opens a student's record page, not the students list, at /app/staff/students/<id>", () => {
    const ids = router()
      .matchRoutes("/app/staff/students/94b477ce")
      .map((m) => m.routeId);
    expect(ids.at(-1)).toBe("/app/staff/students_/$studentId");
    expect(ids).not.toContain("/app/staff/students");
    expect(ids).toContain("/app/staff");
  });

  it.each([
    "/app/teacher",
    "/app/manager",
    "/app/staff/students",
    "/app/staff/classes",
    "/app/staff/attendance",
    "/app/staff/absences",
    "/app/staff/payments",
    "/app/staff/settings",
    "/app/staff/portfolio",
    "/app/notifications",
    "/app/announcements",
    "/app/profile",
  ])("has a page at %s", (path) => {
    const last = router().matchRoutes(path).at(-1);
    expect(last?.routeId.replace(/\/$/, "")).toBe(path);
  });
});
