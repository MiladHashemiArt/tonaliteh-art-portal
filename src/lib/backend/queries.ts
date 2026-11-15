import { queryOptions } from "@tanstack/react-query";

import { studentRoster } from "@/lib/domain/enrollments";
import type { Settings, SettingKey } from "@/lib/domain/settings";

import { supabase } from "./client";
import type {
  AbsenceRow,
  AnnouncementRow,
  ClassSessionRow,
  EnrollmentRow,
  NotificationRow,
  PaymentRow,
  StudentExpenseRow,
  TuitionOrderRow,
  TuitionPaymentAttemptRow,
  ProfileRow,
} from "./types";

/** Profiles reads list columns explicitly. */
export const PROFILE_COLUMNS = "id, full_name, phone, role, created_at, home_address, avatar_path";

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
  if (/rate limit/i.test(e.message ?? ""))
    return "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.";
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
  myExpenses: (id: string) => ["student_expenses", "mine", id] as const,
  allPayments: ["payments", "all"] as const,
  tuitionReviewQueue: ["tuition", "review-queue"] as const,
  students: ["students"] as const,
  allProfiles: ["profiles", "all"] as const,
  nationalId: (id: string) => ["national_id", id] as const,
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
      const { data, error } = await supabase.from("site_settings").select("key, value");
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
        .select("id, student_id, class_id, created_at")
        .eq("student_id", userId);
      if (error) throw error;
      return (data ?? []) as EnrollmentRow[];
    },
  });

export const allEnrollmentsQuery = () =>
  queryOptions({
    queryKey: qk.allEnrollments,
    queryFn: async (): Promise<EnrollmentRow[]> => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, class_id, created_at");
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

/** Unapproved expense requests are shown separately; approved expenses already create a payment row. */
export const myPendingExpensesQuery = (userId: string) =>
  queryOptions({
    queryKey: qk.myExpenses(userId),
    queryFn: async (): Promise<StudentExpenseRow[]> => {
      const { data, error } = await supabase
        .from("student_expenses")
        .select(
          "id, student_id, category, title, description, amount, expense_date, status, review_note, payment_id, created_at",
        )
        .eq("student_id", userId)
        .neq("status", "approved")
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentExpenseRow[];
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

/** Manual-transfer receipts awaiting staff review. */
export const tuitionReviewQueueQuery = () =>
  queryOptions({
    queryKey: qk.tuitionReviewQueue,
    queryFn: async () => {
      const { data: attempts, error: attemptsError } = await supabase
        .from("tuition_payment_attempts")
        .select("id, order_id, method, amount_toman, status, receipt_object_path, submitted_at, created_at")
        .eq("method", "manual_transfer")
        .eq("status", "awaiting_review")
        .order("submitted_at", { ascending: true });
      if (attemptsError) throw attemptsError;
      const orderIds = [...new Set((attempts ?? []).map((attempt) => attempt.order_id))];
      if (!orderIds.length) return [];
      const { data: orders, error: ordersError } = await supabase
        .from("tuition_orders")
        .select("id, student_id, session_count, amount_toman, status, created_at, updated_at, paid_at")
        .in("id", orderIds);
      if (ordersError) throw ordersError;
      const ordersById = new Map(
        ((orders ?? []) as TuitionOrderRow[]).map((order) => [order.id, order]),
      );
      return (attempts ?? [])
        .map((attempt) => ({
          attempt: attempt as TuitionPaymentAttemptRow,
          order: ordersById.get(attempt.order_id),
        }))
        .filter((row): row is { attempt: TuitionPaymentAttemptRow; order: TuitionOrderRow } =>
          Boolean(row.order),
        );
    },
    refetchInterval: 30_000,
  });

/** Student accounts plus staff accounts who are also enrolled as learners. */
export const studentsQuery = () =>
  queryOptions({
    queryKey: qk.students,
    queryFn: async (): Promise<ProfileRow[]> => {
      const [
        { data: profiles, error: profilesError },
        { data: enrollments, error: enrollmentsError },
      ] = await Promise.all([
        supabase.from("profiles").select(PROFILE_COLUMNS).order("full_name", { ascending: true }),
        supabase.from("enrollments").select("student_id"),
      ]);
      if (profilesError) throw profilesError;
      if (enrollmentsError) throw enrollmentsError;

      return studentRoster((profiles ?? []) as ProfileRow[], enrollments ?? []);
    },
  });

/** Every profile the signed-in user may read (RLS decides). Used to show names next to staff rows. */
export const allProfilesQuery = () =>
  queryOptions({
    queryKey: qk.allProfiles,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
