import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { JalaliDatePicker } from "@/components/app/JalaliDatePicker";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError, qk, sessionsQuery } from "@/lib/backend/queries";
import type {
  ClassSessionOccurrenceRow,
  ClassSessionReservationRow,
  ProfileRow,
} from "@/lib/backend/types";
import { sessionTimeRange } from "@/components/app/SessionLine";
import { sessionTitle, sortSessions } from "@/lib/domain/schedule";
import { sessionShortLabel } from "@/components/app/SessionLine";
import { formatDateFa, toPersianDigits } from "@/lib/domain/persian";

function localDateIso() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const Route = createFileRoute("/app/staff/occurrences")({
  head: () => ({ meta: [{ title: "جلسات موردی و رزروها | تنالیته" }] }),
  component: StaffOccurrencesPage,
});

function StaffOccurrencesPage() {
  const { user } = useAppSession();
  const qc = useQueryClient();
  const sessions = useQuery(sessionsQuery());
  const occurrences = useQuery({
    queryKey: ["session-occurrences", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_session_occurrences")
        .select("*")
        .order("session_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionOccurrenceRow[];
    },
  });
  const reservations = useQuery({
    queryKey: ["session-reservations", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_session_reservations")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClassSessionReservationRow[];
    },
  });
  const profiles = useQuery({
    queryKey: qk.allProfiles,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,phone,role,created_at,home_address,avatar_path");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState("");
  const [capacity, setCapacity] = useState("۱۰");
  const capacityValue = capacity.replace(/[۰-۹٠-٩]/g, (digit) =>
    String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10),
  );

  const publish = useMutation({
    mutationFn: async () => {
      if (!classId || !date) throw new Error("کلاس و تاریخ جلسه را انتخاب کنید.");
      if (date < localDateIso()) throw new Error("امکان انتشار جلسه برای تاریخ گذشته وجود ندارد.");
      const cap = Number(capacityValue);
      if (!Number.isInteger(cap) || cap < 1 || cap > 200)
        throw new Error("ظرفیت باید بین ۱ تا ۲۰۰ نفر باشد.");
      const { error } = await supabase.from("class_session_occurrences").insert({
        class_session_id: classId,
        session_date: date,
        capacity: cap,
        is_open: true,
        published_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("جلسه منتشر شد و برای رزرو در دسترس قرار گرفت.");
      setDate("");
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const close = useMutation({
    mutationFn: async (item: ClassSessionOccurrenceRow) => {
      const { error } = await supabase
        .from("class_session_occurrences")
        .update({ is_open: false, is_cancelled: true })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("جلسه لغو شد.");
      await qc.invalidateQueries({ queryKey: ["session-occurrences"] });
      await qc.invalidateQueries({ queryKey: ["session-reservations"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const sessionMap = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.id, s])),
    [sessions.data],
  );
  const profileMap = useMemo(
    () => new Map((profiles.data ?? []).map((p) => [p.id, p])),
    [profiles.data],
  );
  const reservationRows = reservations.data ?? [];
  const busy =
    sessions.isPending || occurrences.isPending || reservations.isPending || profiles.isPending;
  const error = sessions.error ?? occurrences.error ?? reservations.error ?? profiles.error;

  return (
    <>
      <PageHeader
        back={{ to: "/app/staff/classes", label: "برنامهٔ کلاس‌ها" }}
        eyebrow="مدیریت آموزشی"
        title="جلسات موردی و رزروها"
        description="برای یک تاریخ مشخص جلسه منتشر کنید؛ ظرفیت و فهرست هنرجویان رزروشده را همین‌جا ببینید."
      />
      <Section title="انتشار جلسهٔ جدید">
        <form
          className="surface grid gap-4 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            publish.mutate();
          }}
        >
          <label className="space-y-2 text-sm font-medium">
            کلاس پایه
            <select
              className="h-11 w-full rounded-lg border border-input bg-background px-3"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">انتخاب کلاس</option>
              {sortSessions((sessions.data ?? []).filter((s) => s.is_active !== false)).map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionShortLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2 text-sm font-medium">
            تاریخ برگزاری
            <JalaliDatePicker
              id="occurrence-date"
              value={date}
              onChange={setDate}
              label="انتخاب تاریخ جلسه"
            />
          </div>
          <label className="space-y-2 text-sm font-medium">
            ظرفیت هنرجویان
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9۰-۹٠-٩]*"
              dir="rtl"
              aria-label="ظرفیت هنرجویان"
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/[^0-9۰-۹٠-٩]/g, ""))}
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={publish.isPending || !classId || !date}>
              {publish.isPending ? "در حال انتشار…" : "انتشار برای رزرو"}
            </Button>
          </div>
        </form>
      </Section>
      <Section title="جلسات منتشرشده">
        {busy ? (
          <LoadingRows rows={3} />
        ) : error ? (
          <ErrorState
            error={error}
            onRetry={() => {
              void occurrences.refetch();
              void reservations.refetch();
            }}
          />
        ) : (occurrences.data ?? []).length === 0 ? (
          <EmptyState
            title="هنوز جلسهٔ موردی منتشر نشده است"
            description="با فرم بالا اولین جلسهٔ رزروی را ایجاد کنید."
          />
        ) : (
          <div className="space-y-3">
            {(occurrences.data ?? []).map((item) => {
              const session = sessionMap.get(item.class_session_id);
              const booked = reservationRows.filter(
                (r) => r.occurrence_id === item.id && r.status === "booked",
              );
              return (
                <article key={item.id} className="surface space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{session ? sessionTitle(session) : "کلاس"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateFa(item.session_date, true)} ·{" "}
                        {session ? sessionTimeRange(session) : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-3 py-1 text-xs">
                      {item.is_cancelled ? "لغوشده" : item.is_open ? "باز برای رزرو" : "بسته"}
                    </span>
                  </div>
                  <p className="text-sm">
                    رزروها: {toPersianDigits(booked.length)} از {toPersianDigits(item.capacity)} نفر
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-bronze"
                      style={{
                        width:
                          Math.min(100, (booked.length / Math.max(1, item.capacity)) * 100) + "%",
                      }}
                    />
                  </div>
                  {booked.length > 0 ? (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {booked.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-lg border border-border/70 px-3 py-2 text-sm"
                        >
                          {profileMap.get(r.student_id)?.full_name ?? "هنرجو"}
                          <span className="block text-xs text-muted-foreground">
                            {profileMap.get(r.student_id)?.phone ?? ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">هنوز رزروی ثبت نشده است.</p>
                  )}
                  {item.is_open && !item.is_cancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={close.isPending}
                      onClick={() => close.mutate(item)}
                    >
                      لغو جلسه و بستن رزرو
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
