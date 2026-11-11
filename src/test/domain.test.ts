import { describe, expect, it } from "vitest";

import type { ClassSessionRow } from "@/lib/backend/types";
import { homePathForRole, normalizeRole } from "@/lib/domain/roles";
import { diffEnrollments, nextOccurrence, normalizeWeekday } from "@/lib/domain/schedule";
import { canEditSetting, instagramHref, telHref } from "@/lib/domain/settings";
import { isValidNationalId } from "@/lib/domain/validation";
import { toIsoDate } from "@/lib/domain/persian";

const base: ClassSessionRow = {
  id: "1",
  class_day: "Thursday",
  start_time: "09:00:00",
  end_time: "12:00:00",
  class_type: "طراحی از مدل زنده",
  session_date: null,
  is_active: true,
  recurrence_weeks: 2,
  recurrence_anchor_date: null,
};

describe("roles", () => {
  it("never grants staff for unknown or empty roles", () => {
    expect(normalizeRole(null)).toBe("student");
    expect(normalizeRole("superuser")).toBe("student");
    expect(homePathForRole(normalizeRole("student"))).toBe("/app/student");
  });
  it("routes teacher and manager to the staff panel", () => {
    expect(homePathForRole(normalizeRole("teacher"))).toBe("/app/teacher");
    expect(homePathForRole(normalizeRole("manager"))).toBe("/app/manager");
  });
});

describe("schedule", () => {
  it("reads Persian and English weekday names", () => {
    expect(normalizeWeekday("سه‌شنبه")).toBe(2);
    expect(normalizeWeekday("پنجشنبه")).toBe(4);
    expect(normalizeWeekday("Friday")).toBe(5);
  });

  it("every-other-week Thursday needs an anchor date", () => {
    expect(nextOccurrence(base, new Date(2026, 10, 11)).kind).toBe("needs-anchor");
  });

  it("every-other-week Thursday skips the off week", () => {
    // Anchor Thursday 2026-11-12 has class; 2026-11-19 is off; 2026-11-26 has class.
    const s = { ...base, recurrence_anchor_date: "2026-11-12" };
    const fromOffWeek = nextOccurrence(s, new Date(2026, 10, 13));
    expect(fromOffWeek.kind === "date" && toIsoDate(fromOffWeek.date)).toBe("2026-11-26");
    const fromAnchorWeek = nextOccurrence(s, new Date(2026, 10, 11));
    expect(fromAnchorWeek.kind === "date" && toIsoDate(fromAnchorWeek.date)).toBe("2026-11-12");
  });

  it("weekly Tuesday returns the next Tuesday", () => {
    const s = { ...base, class_day: "سه‌شنبه", recurrence_weeks: 1 };
    const r = nextOccurrence(s, new Date(2026, 10, 11)); // Wednesday
    expect(r.kind === "date" && toIsoDate(r.date)).toBe("2026-11-17");
  });

  it("allows selecting any number of sessions", () => {
    expect(diffEnrollments(["1", "2"], ["2", "3", "4", "5"])).toEqual({
      toAdd: ["3", "4", "5"],
      toRemove: ["1"],
    });
  });
});

describe("settings permissions", () => {
  it("teacher and manager both edit contact, quote and payment details", () => {
    expect(canEditSetting("teacher", "teacher_instagram_url")).toBe(true);
    expect(canEditSetting("teacher", "payment_card_number")).toBe(true);
    expect(canEditSetting("manager", "payment_card_number")).toBe(true);
  });
  it("students cannot edit any setting", () => {
    expect(canEditSetting("student", "motivational_quote")).toBe(false);
    expect(canEditSetting("student", "teacher_phone")).toBe(false);
  });
  it("links render only when configured", () => {
    expect(instagramHref("")).toBeNull();
    expect(instagramHref("@tonaliteh")).toBe("https://instagram.com/tonaliteh");
    expect(instagramHref("https://evil.example.com/x")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref("۰۹۱۲ ۱۲۳ ۴۵۶۷")).toBe("tel:09121234567");
  });
});

describe("national id", () => {
  it("accepts a valid code in Persian digits and rejects a bad check digit", () => {
    expect(isValidNationalId("۰۰۸۴۵۷۵۹۴۸")).toBe(true);
    expect(isValidNationalId("0084575949")).toBe(false);
    expect(isValidNationalId("1111111111")).toBe(false);
  });
});
