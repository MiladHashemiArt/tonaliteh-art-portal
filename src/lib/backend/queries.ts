import { queryOptions } from "@tanstack/react-query";

import type { Settings, SettingKey } from "@/lib/domain/settings";

import { supabase } from "./client";
import type {
  AbsenceRow,
  AnnouncementRow,
  ClassSessionRow,
  EnrollmentRow,
  NotificationRow,
  PaymentRow,
  ProfileRow,
} from "./types";

/** Every profiles read lists columns explicitly — national_id is never selectable. */
export const PROFILE_COLUMNS = "id, full_name, phone, role, created_at, home_address";

/** Missing table / function (setup script not run yet). */
export function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /does not exist|could not find/i.test(error.message ?? "")
  );
}

export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return "خطای ناشناخته‌ای رخ داد.";
  if (e.code === "42501" || /permission|row-level security|policy/i.test(e.message ?? ""))
    return "برای این کار دسترسی لازم را ندارید.";
  if (e.code === "23505") return "این مورد قبلاً ثبت شده است.";
  if (e.code === "23503") return "این مورد به اطلاعات دیگری وابسته است و قابل حذف نیست.";
  if (/Failed to fetch|NetworkError|network/i.test(e.message ?? ""))
    return "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.";
  if (/Invalid login credentials/i.test(e.message ?? "")) return "ایمیل یا رمز عبور درست نیست.";
  if (/Email not confirmed/i.test(e.message ?? ""))
    return "ایمیل شما هنوز تأیید نشده است. صندوق ایمیل خود را بررسی کنید.";
  if (/User already registered/i.test(e.message ?? ""))
    return "با این ایمیل قبلاً حساب ساخته شده است. وارد شوید.";
  if (/Password should be/i.test(e.message ?? "")) return "رمز عبور باید حداقل ۶ کاراکتر باشد.";
  if (/rate limit/i.test(e.message ?? "")) return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
  return e.message || "خطایی رخ داد. دوباره تلاش کنید.";
}

export const qk = {
  profile: (id: string) => ["profile", id] as const,
  settings: ["settings"] as const,
  sessions: ["class_sessions"] as const,
  myEnrollments: (id: string) => ["enrollments", "mine", id] as const,
  allEnrollments: ["enrollments", "all"] as const,
  announcements: ["announcements"] as const,
  notifications: (id: string) => ["notifications", id] as const,
  myAbsences: (id: string) => ["absences", "mine", id] as const,
  allAbsences: ["absences", "all"] as const,
  myPayments: (id: string) => ["payments", "mine", id] as const,
  allPayments: ["payments", "all"] as const,
  students: ["students"] as const,
  myNationalId: (id: string) => ["national_id", id] as const,
};

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.profile(userId),
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProfileRow | null) ?? null;
    },
  });

export type SettingsResult = { values: Settings; missing: boolean };

export const settingsQuery = () =>
  queryOptions({
    queryKey: qk.settings,
    queryFn: async (): Promise<SettingsResult> => {
      const { data, error } = await supabase.from("app_settings").select("key, value");
      if (error) {
        if (isMissingRelation(error)) return { values: {}, missing: true };
        throw error;
      }
      const values: Settings = {};
      for (const row of data ?? []) values[row.key as SettingKey] = row.value;
      return { values, missing: false };
    },
    staleTime: 60_000,
  });

export const sessionsQuery = () =>
  queryOptions({
    queryKey: qk.sessions,
    queryFn: async (): Promise<ClassSessionRow[]> => {
      const { data, error } = await supabase.from("class_sessions").select("*");
      if (error) throw error;
      return (data ?? []) as ClassSessionRow[];
    },
  });

export const myEnrollmentsQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.myEnrollments(userId),
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, class_id")
        .eq("student_id", userId);
      if (error) throw error;
      return (data ?? []) as EnrollmentRow[];
    },
  });

export const allEnrollmentsQuery = () =>
  queryOptions({
    queryKey: qk.allEnrollments,
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase.from("enrollments").select("student_id, class_id");
      if (error) throw error;
      return (data ?? []) as EnrollmentRow[];
    },
  });

export const announcementsQuery = () =>
  queryOptions({
    queryKey: qk.announcements,
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

export const notificationsQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.notifications(userId),
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: 60_000,
  });

export const myAbsencesQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.myAbsences(userId),
    queryFn: async (): Promise<AbsenceRow[]> => {
      const { data, error } = await supabase
        .from("absences")
        .select("*")
        .eq("student_id", userId)
        .order("absence_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AbsenceRow[];
    },
  });

export const allAbsencesQuery = () =>
  queryOptions({
    queryKey: qk.allAbsences,
    queryFn: async (): Promise<AbsenceRow[]> => {
      const { data, error } = await supabase
        .from("absences")
        .select("*")
        .order("absence_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AbsenceRow[];
    },
  });

export const myPaymentsQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.myPayments(userId),
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("student_id", userId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

export const allPaymentsQuery = () =>
  queryOptions({
    queryKey: qk.allPayments,
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

/** Students for staff screens — no national_id, ever. */
export const studentsQuery = () =>
  queryOptions({
    queryKey: qk.students,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ProfileRow[]).filter(
        (p) => !p.role || p.role.toLowerCase() === "student",
      );
    },
  });

export type NationalIdResult = { value: string | null; available: boolean };

export const myNationalIdQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.myNationalId(userId),
    queryFn: async (): Promise<NationalIdResult> => {
      const { data, error } = await supabase.rpc("get_my_national_id");
      if (error) {
        if (isMissingRelation(error)) return { value: null, available: false };
        throw error;
      }
      return { value: (data as string | null) ?? null, available: true };
    },
  });
