import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { sessionShortLabel } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import {
  allAbsencesQuery,
  allProfilesQuery,
  sessionsQuery,
} from "@/lib/backend/queries";
import { formatDateFa, formatRelativeFa } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/absences")({
  head: () => ({ meta: [{ title: "غیبت‌ها | تنالیته" }] }),
  component: StaffAbsencesPage,
});

function StaffAbsencesPage() {
  const absences = useQuery(allAbsencesQuery());
  const profiles = useQuery(allProfilesQuery());
  const sessions = useQuery(sessionsQuery());

  const studentsById = useMemo(
    () => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])),
    [profiles.data],
  );
  const sessionsById = useMemo(
    () => new Map((sessions.data ?? []).map((session) => [String(session.id), session])),
    [sessions.data],
  );

  const loading = absences.isPending || profiles.isPending || sessions.isPending;
  const error = absences.error || profiles.error || sessions.error;

  return (
    <>
      <PageHeader
        back={{ to: "/app", label: "خانه" }}
        eyebrow="مدیریت هنرجویان"
        title="غیبت‌های اعلام‌شده"
        description="گزارش‌های غیبت هنرجویان به ترتیب تاریخ، از جدیدترین مورد."
      />
      <Section title={`گزارش‌ها · ${absences.data?.length ?? 0}`}>
        {loading ? (
          <LoadingRows />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void absences.refetch();
              void profiles.refetch();
              void sessions.refetch();
            }}
          />
        ) : !absences.data?.length ? (
          <EmptyState
            title="هنوز غیبتی ثبت نشده است"
            description="پس از اعلام غیبت توسط هنرجو، گزارش آن در این قسمت نمایش داده می‌شود."
          />
        ) : (
          <ul className="space-y-3">
            {absences.data.map((absence) => {
              const student = studentsById.get(absence.student_id);
              const session = absence.class_id
                ? sessionsById.get(String(absence.class_id))
                : undefined;
              return (
                <li key={absence.id} className="surface space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{student?.full_name || "هنرجوی نامشخص"}</p>
                      <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
                        {student?.phone || "شماره تماس ثبت نشده"}
                      </p>
                    </div>
                    <p className="font-display text-sm font-semibold">
                      {formatDateFa(absence.absence_date, true)}
                    </p>
                  </div>
                  {session && (
                    <p className="text-sm text-muted-foreground">
                      {sessionShortLabel(session)}
                    </p>
                  )}
                  {absence.description && (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm leading-7">
                      {absence.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    زمان ثبت گزارش: {formatRelativeFa(absence.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
