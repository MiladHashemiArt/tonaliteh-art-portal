import type { EnrollmentRow, ProfileRow } from "@/lib/backend/types";

import { normalizeRole } from "./roles";

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

/**
 * Profiles shown and counted as students: every student-role account (unknown or empty roles
 * count as student, matching normalizeRole) plus any teacher/manager who holds an enrollment.
 */
export function studentRoster<P extends Pick<ProfileRow, "id" | "role">>(
  profiles: P[],
  enrollments: Pick<EnrollmentRow, "student_id">[],
): P[] {
  const enrolled = new Set(enrolledStudentIds(enrollments));
  return profiles.filter(
    (profile) => normalizeRole(profile.role) === "student" || enrolled.has(String(profile.id)),
  );
}
