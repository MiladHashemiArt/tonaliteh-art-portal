import { describe, expect, it } from "vitest";

import { enrolledStudentIds, studentRoster, studentsByClass } from "@/lib/domain/enrollments";

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

describe("student roster on the staff dashboard and students page", () => {
  const manager = { id: "94b477ce", role: "manager" };
  const teacher = { id: "t1", role: "teacher" };

  it("counts a manager with two enrollments as one student", () => {
    const enrollments = [{ student_id: "94b477ce" }, { student_id: "94b477ce" }];
    expect(studentRoster([manager, teacher], enrollments).map((p) => p.id)).toEqual(["94b477ce"]);
  });
  it("leaves out staff who are not enrolled", () => {
    expect(studentRoster([manager, teacher], [])).toHaveLength(0);
  });
  it("includes student accounts even before they enroll, whatever the role spelling", () => {
    const profiles = [
      { id: "s1", role: "student" },
      { id: "s2", role: "Student " },
      { id: "s3", role: "هنرجو" },
      { id: "s4", role: null },
    ];
    expect(studentRoster(profiles, [])).toHaveLength(4);
  });
  it("matches numeric enrollment ids against text profile ids", () => {
    const enrollments = [{ student_id: 7 as unknown as string }];
    expect(studentRoster([{ id: "7", role: "teacher" }], enrollments)).toHaveLength(1);
  });
});
