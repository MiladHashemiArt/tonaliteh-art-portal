import type { EnrollmentRow } from "@/lib/backend/types";

/** Distinct profiles that hold at least one enrollment — any role, since staff may also take classes. */
export function enrolledStudentIds(enrollments: Pick<EnrollmentRow, "student_id">[]): string[] {
  return [...new Set(enrollments.map((e) => String(e.student_id)))];
}

/** class_id → student ids enrolled in that session. */
export function studentsByClass(
  enrollments: Pick<EnrollmentRow, "student_id" | "class_id">[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of enrollments) {
    const key = String(e.class_id);
    const list = map.get(key) ?? [];
    if (!list.includes(String(e.student_id))) list.push(String(e.student_id));
    map.set(key, list);
  }
  return map;
}
