import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { sessionShortLabel } from "@/components/app/SessionLine";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import {
  friendlyError,
  myAbsencesQuery,
  myEnrollmentsQuery,
  qk,
  sessionsQuery,
} from "@/lib/backend/queries";
import { formatDateFa, formatRelativeFa, toIsoDate } from "@/lib/domain/persian";
import { sortSessions } from "@/lib/domain/schedule";

export const Route = createFileRoute("/app/student/absences")({
  head: () => ({ meta: [{ title: "اعلام غیبت | تنالیته" }] }),
  component: AbsencesPage,
});

function AbsencesPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const absences = useQuery(myAbsencesQuery(user.id));
  const sessions = useQuery(sessionsQuery());
  const enrollments = useQuery(myEnrollmentsQuery(user.id));
  const [date, setDate] = useState(toIsoDate(new Date()));
  const [classId, setClassId] = useState("");
  const [description, setDescription] = useState("");

  const enrolled = new Set((enrollments.data ?? []).map((e) => String(e.class_id)));
  const all = sortSessions(sessions.data ?? []);
  const options = [
    ...all.filter((s) => enrolled.has(String(s.id))),
    ...all.filter((s) => !enrolled.has(String(s.id))),
  ];
  const byId = new Map(all.map((s) => [String(s.id), s]));

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("absences").insert({
        student_id: user.id,
        absence_date: date,
        class_id: classId || null,
        description: description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("غیبت شما ثبت و به استاد و مدیریت اطلاع داده شد.");
      setDescription("");
      setClassId("");
      queryClient.invalidateQueries({ queryKey: qk.myAbsences(user.id) });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="غیبت"
        title="اعلام غیبت"
        description="اگر در جلسه‌ای حضور ندارید، از قبل اطلاع دهید."
      />
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Section title="فرم اعلام غیبت">
          <form
            className="surface min-w-0 space-y-5 overflow-hidden p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!date) {
                toast.error("تاریخ را انتخاب کنید.");
                return;
              }
              submit.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="abs-date">تاریخ غیبت</Label>
              <Input
                id="abs-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {date && <p className="text-xs text-muted-foreground">{formatDateFa(date, true)}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="abs-class">کلاس (اختیاری)</Label>
              <NativeSelect
                id="abs-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">بدون انتخاب کلاس</option>
                {options.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {sessionShortLabel(s)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="abs-desc">توضیح (اختیاری)</Label>
              <Textarea
                id="abs-desc"
                maxLength={800}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submit.isPending}>
              {submit.isPending ? "در حال ثبت…" : "ثبت غیبت"}
            </Button>
          </form>
        </Section>

        <Section title="غیبت‌های ثبت‌شده">
          {absences.isPending ? (
            <LoadingRows />
          ) : absences.error ? (
            <ErrorState error={absences.error} onRetry={() => absences.refetch()} />
          ) : !absences.data?.length ? (
            <EmptyState title="غیبتی ثبت نکرده‌اید" />
          ) : (
            <ul className="space-y-3">
              {absences.data.map((a) => {
                const s = a.class_id ? byId.get(String(a.class_id)) : undefined;
                return (
                  <li key={String(a.id)} className="surface p-4">
                    <p className="font-display font-semibold">
                      {formatDateFa(a.absence_date, true)}
                    </p>
                    {s && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{sessionShortLabel(s)}</p>
                    )}
                    {a.description && <p className="mt-2 text-sm leading-7">{a.description}</p>}
                    <p className="mt-2 text-xs text-muted-foreground">
                      ثبت‌شده {formatRelativeFa(a.created_at)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
