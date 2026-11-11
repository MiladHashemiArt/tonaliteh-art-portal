export type AppRole = "student" | "teacher" | "manager";

/** Map the raw profiles.role value to an app role. Unknown or empty values are treated as student. */
export function normalizeRole(raw: string | null | undefined): AppRole {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "teacher" || v === "استاد") return "teacher";
  if (v === "manager" || v === "admin" || v === "management" || v === "مدیر" || v === "مدیریت")
    return "manager";
  return "student";
}

export function isStaff(role: AppRole): boolean {
  return role === "teacher" || role === "manager";
}

export function isManager(role: AppRole): boolean {
  return role === "manager";
}

export function homePathForRole(role: AppRole): "/app/student" | "/app/staff" {
  return isStaff(role) ? "/app/staff" : "/app/student";
}

export const ROLE_LABEL: Record<AppRole, string> = {
  student: "هنرجو",
  teacher: "استاد",
  manager: "مدیریت",
};

/** Display defaults only — never used for authorization. */
export const DEFAULT_TEACHER_NAME = "محمد فرزانه";
export const DEFAULT_MANAGER_NAME = "میلاد هاشمی";

export function staffDisplayName(role: AppRole, fullName: string | null | undefined): string {
  const name = fullName?.trim();
  if (name) return name;
  if (role === "teacher") return DEFAULT_TEACHER_NAME;
  if (role === "manager") return DEFAULT_MANAGER_NAME;
  return "هنرجوی عزیز";
}
