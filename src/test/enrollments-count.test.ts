import { describe, expect, it } from "vitest";

import { enrolledStudentIds, studentsByClass } from "@/lib/domain/enrollments";

describe("enrolled student count", () => {
  it("counts one manager enrolled in two sessions as one student", () => {
    const rows = [
      { student_id: "94b477ce", class_id: "a" },
      { student_id: "94b477ce", class_id: "b" },
    ];
    expect(enrolledStudentIds(rows)).toHaveLength(1);
  });
  it("is 0 when there are no enrollments", () => {
    expect(enrolledStudentIds([])).toHaveLength(0);
  });
  it("groups students by session", () => {
    const map = studentsByClass([
      { student_id: "x", class_id: "a" },
      { student_id: "y", class_id: "a" },
    ]);
    expect(map.get("a")).toEqual(["x", "y"]);
  });
});
