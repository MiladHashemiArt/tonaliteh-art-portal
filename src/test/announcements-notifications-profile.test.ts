import { describe, expect, it } from "vitest";

import { canManageAnnouncements, validateAnnouncement } from "@/lib/domain/announcements";
import { notificationTarget } from "@/lib/domain/notifications";
import { OWN_EDITABLE_PROFILE_FIELDS, validateProfileForm } from "@/lib/domain/profile";

describe("announcements", () => {
  it("only teacher and manager can manage announcements", () => {
    expect(canManageAnnouncements("teacher")).toBe(true);
    expect(canManageAnnouncements("manager")).toBe(true);
    expect(canManageAnnouncements("student")).toBe(false);
  });
  it("requires a title", () => {
    expect(validateAnnouncement({ title: "  ", content: "x" }).title).toBeDefined();
    expect(validateAnnouncement({ title: "کلاس تعطیل است", content: "" })).toEqual({});
  });
});

describe("notifications", () => {
  it("announcement notifications open the board at that announcement", () => {
    expect(
      notificationTarget({ notification_type: "announcement", related_id: 7 }, "student"),
    ).toEqual({
      to: "/app/announcements",
      id: "7",
    });
  });
  it("absence notifications open the staff list for staff", () => {
    expect(
      notificationTarget({ notification_type: "absence", related_id: null }, "teacher"),
    ).toEqual({
      to: "/app/staff/absences",
    });
  });
});

describe("own profile", () => {
  it("never lets a user edit role or national ID", () => {
    expect(OWN_EDITABLE_PROFILE_FIELDS).not.toContain("role");
    expect(OWN_EDITABLE_PROFILE_FIELDS).not.toContain("national_id");
  });
  it("rejects an invalid phone and accepts a valid one", () => {
    const base = { fullName: "سارا محمدی", homeAddress: "" };
    expect(validateProfileForm({ ...base, phone: "12345" }).phone).toBeDefined();
    expect(validateProfileForm({ ...base, phone: "۰۹۱۲۳۴۵۶۷۸۹" })).toEqual({});
  });
});
