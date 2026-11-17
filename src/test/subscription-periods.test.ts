import { describe, expect, it } from "vitest";

import {
  addJalaliMonths,
  buildSubscriptionPeriods,
  getJalaliDateParts,
} from "@/lib/domain/subscription-periods";

describe("Jalali subscription periods", () => {
  it("anchors each period to the activation day in the Jalali calendar", () => {
    const activation = "2026-11-17";
    const anchorDay = getJalaliDateParts(activation).day;
    const next = addJalaliMonths(activation, 1);
    expect(getJalaliDateParts(next).day).toBe(anchorDay);
  });

  it("clamps short months without permanently shifting the original anchor", () => {
    const activation = "2026-11-17";
    const anchor = getJalaliDateParts(activation);
    const monthAfterNext = addJalaliMonths(activation, 2);
    const expected = getJalaliDateParts(monthAfterNext);
    expect(expected.day).toBe(anchor.day);
  });

  it("creates 1, 2, and 3 consecutive inclusive periods", () => {
    const periods = buildSubscriptionPeriods("2026-11-17", 3);
    expect(periods).toHaveLength(3);
    expect(periods.map((period) => period.periodNumber)).toEqual([1, 2, 3]);
    expect(periods[0].startsOn).toBe("2026-11-17");
    expect(new Date(`${periods[0].endsOn}T12:00:00Z`).getTime() + 86_400_000).toBe(
      new Date(`${periods[1].startsOn}T12:00:00Z`).getTime(),
    );
    expect(new Date(`${periods[1].endsOn}T12:00:00Z`).getTime() + 86_400_000).toBe(
      new Date(`${periods[2].startsOn}T12:00:00Z`).getTime(),
    );
  });

  it("rejects unsupported subscription durations", () => {
    expect(() => buildSubscriptionPeriods("2026-11-17", 4)).toThrow();
  });
});
