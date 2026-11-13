import { describe, expect, it } from "vitest";

import { notificationTarget } from "@/lib/domain/notifications";
import { canEditSetting, normalizeTeacherContact, validateTeacherContact } from "@/lib/domain/settings";

const valid = {
  teacher_display_name: "محمد فرزانه",
  teacher_phone: "09123461816",
  teacher_instagram_url: "https://www.instagram.com/mohammad.farzaneh.art",
};

describe("teacher contact settings", () => {
  it("only teacher and manager may edit settings", () => {
    expect(canEditSetting("teacher", "teacher_phone")).toBe(true);
    expect(canEditSetting("manager", "teacher_phone")).toBe(true);
    expect(canEditSetting("student", "teacher_phone")).toBe(false);
  });
  it("accepts the confirmed teacher contact and keeps it unchanged", () => {
    expect(validateTeacherContact(valid)).toEqual({});
    expect(normalizeTeacherContact(valid)).toEqual(valid);
  });
  it("requires a name", () => {
    expect(validateTeacherContact({ ...valid, teacher_display_name: " " }).teacher_display_name).toBeDefined();
  });
  it("rejects an invalid phone and a non-Instagram link", () => {
    const e = validateTeacherContact({
      ...valid,
      teacher_phone: "123",
      teacher_instagram_url: "https://example.com/x",
    });
    expect(e.teacher_phone).toBeDefined();
    expect(e.teacher_instagram_url).toBeDefined();
  });
  it("stores Persian-digit phones as Latin digits and @handles as full links", () => {
    const out = normalizeTeacherContact({
      ...valid,
      teacher_phone: "۰۹۱۲ ۳۴۶ ۱۸۱۶",
      teacher_instagram_url: "@mohammad.farzaneh.art",
    });
    expect(out.teacher_phone).toBe("09123461816");
    expect(out.teacher_instagram_url).toBe("https://instagram.com/mohammad.farzaneh.art");
  });
});

describe("new-student notifications", () => {
  it("open the students list for staff and lead nowhere for students", () => {
    const n = { notification_type: "new_student", related_id: "abc" };
    expect(notificationTarget(n, "teacher")).toEqual({ to: "/app/staff/students" });
    expect(notificationTarget(n, "manager")).toEqual({ to: "/app/staff/students" });
    expect(notificationTarget(n, "student")).toBeNull();
  });
});
