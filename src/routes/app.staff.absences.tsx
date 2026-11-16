import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { sessionShortLabel } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import { allAbsencesQuery, allProfilesQuery, sessionsQuery } from "@/lib/backend/queries";
import { formatDateFa, formatRelativeFa, toPersianDigits } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/staff/absences")({
  head: () => ({ meta: [{ title: "غیبت‌ها | تنالیته" }] }),
  component: StaffAbsencesPage,
});

function StaffAbsencesPage() {
  const absences = useQuery(allAbsencesQuery());
  const profiles = useQuery(allProfilesQuery());
  const sessions = useQuery(sessionsQuery());
  const client = useQueryClient();
  const [selectedSlots, setSelectedSlots] = useState<Record<string, string>>({});
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});
  const makeups = useQuery({
    queryKey: ["makeup-requests", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_makeup_requests").select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const decideMakeup = useMutation({
    mutationFn: async ({ id, status, classId, date }: { id: string; status: "approved" | "rejected"; classId?: string; date?: string }) => {
      const update = status === "approved"
        ? { status, makeup_class_session_id: classId, makeup_date: date }
        : { status };
      const { error } = await supabase.from("student_makeup_requests").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("وضعیت درخواست جبرانی به‌روزرسانی شد.");
      void client.invalidateQueries({ queryKey: ["makeup-requests"] });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const studentsById = useMemo(
    () => new Map((profiles.data ?? []).map((profile) => [String(profile.id), profile])),
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
      <Section title={`گزارش‌ها · ${toPersianDigits(absences.data?.length ?? 0)}`}>
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
              const student = studentsById.get(String(absence.student_id));
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
                    <p className="text-sm text-muted-foreground">{sessionShortLabel(session)}</p>
                  )}
                  {absence.description && (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm leading-7">
                      {absence.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    زمان ثبت گزارش: {formatRelativeFa(absence.created_at)}
                  </p>
                  {makeups.data?.filter((item) => item.absence_id === absence.id).map((request) => (
                    <div key={request.id} className="mt-3 space-y-3 rounded-lg border border-dashed p-3">
                      <p className="text-sm font-medium">درخواست جبرانی · {request.status === "pending" ? "در انتظار تصمیم" :
                        request.status === "approved" ? "تأیید شده" : request.status === "rejected" ? "رد شده" :
                        request.status === "completed" ? "تکمیل شده" : "لغو شده"}</p>
                      {request.requested_note && <p className="text-sm text-muted-foreground">{request.requested_note}</p>}
                      {request.status === "pending" && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label>سانس جبرانی</Label>
                              <Select value={selectedSlots[request.id] ?? ""}
                                onValueChange={(value) => setSelectedSlots((v) => ({ ...v, [request.id]: value }))}>
                                <SelectTrigger><SelectValue placeholder="انتخاب کلاس و سانس" /></SelectTrigger>
                                <SelectContent>
                                  {(sessions.data ?? []).filter((slot) => slot.is_active !== false).map((slot) => (
                                    <SelectItem key={slot.id} value={slot.id}>{sessionShortLabel(slot)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>تاریخ توافق‌شده (میلادی: YYYY-MM-DD)</Label>
                              <input type="date" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedDates[request.id] ?? ""}
                                onChange={(event) => setSelectedDates((v) => ({ ...v, [request.id]: event.target.value }))} />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={decideMakeup.isPending || !selectedSlots[request.id] || !selectedDates[request.id]}
                              onClick={() => decideMakeup.mutate({ id: request.id, status: "approved", classId: selectedSlots[request.id], date: selectedDates[request.id] })}>
                              تأیید و ثبت سانس
                            </Button>
                            <Button size="sm" variant="outline" disabled={decideMakeup.isPending}
                              onClick={() => decideMakeup.mutate({ id: request.id, status: "rejected" })}>رد درخواست</Button>
                          </div>
                        </>
                      )}
                      {request.status === "approved" && (
                        <p className="text-xs text-muted-foreground">تاریخ: {formatDateFa(request.makeup_date, true)} · سانس: {sessionsById.get(String(request.makeup_class_session_id)) ? sessionShortLabel(sessionsById.get(String(request.makeup_class_session_id))!) : "ثبت‌شده"}</p>
                      )}
                    </div>
                  ))}
                  {makeups.isError && <p className="text-xs text-destructive">بارگذاری درخواست‌های جبرانی ناموفق بود: {friendlyError(makeups.error)}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
