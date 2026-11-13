import { isStaff, type AppRole } from "./roles";

export type NotificationKind = "announcement" | "absence" | "payment" | "new_student" | "other";

export function notificationKind(type: string | null | undefined): NotificationKind {
  const t = (type ?? "").toLowerCase();
  if (t.includes("announce") || t.includes("اطلاعیه")) return "announcement";
  if (t.includes("absence") || t.includes("غیبت")) return "absence";
  if (t.includes("payment") || t.includes("پرداخت")) return "payment";
  if (t === "new_student" || t.includes("ثبت‌نام")) return "new_student";
  return "other";
}

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  announcement: "اطلاعیه",
  absence: "غیبت",
  payment: "پرداخت",
  new_student: "هنرجوی جدید",
  other: "اعلان",
};

export type NotificationTarget =
  | { to: "/app/announcements"; id: string | undefined }
  | {
      to:
        | "/app/staff/absences"
        | "/app/student/absences"
        | "/app/staff/payments"
        | "/app/student/payments"
        | "/app/staff/students";
    };

/** Where tapping a notification leads, by its type and the reader's verified role. */
export function notificationTarget(
  n: { notification_type: string | null; related_id: string | number | null },
  role: AppRole,
): NotificationTarget | null {
  const kind = notificationKind(n.notification_type);
  const staff = isStaff(role);
  if (kind === "announcement")
    return { to: "/app/announcements", id: n.related_id == null ? undefined : String(n.related_id) };
  if (kind === "absence") return { to: staff ? "/app/staff/absences" : "/app/student/absences" };
  if (kind === "payment") return { to: staff ? "/app/staff/payments" : "/app/student/payments" };
  if (kind === "new_student") return staff ? { to: "/app/staff/students" } : null;
  return null;
}
