const persianCalendar = new Intl.DateTimeFormat("en-US-u-ca-persian", {
  calendar: "persian",
  numberingSystem: "latn",
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export type JalaliDateParts = { year: number; month: number; day: number };
export type SubscriptionPeriod = {
  periodNumber: number;
  startsOn: string;
  endsOn: string;
};

function parseIsoDate(value: string): Date {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    throw new Error("تاریخ باید به فرمت YYYY-MM-DD باشد.");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("تاریخ واردشده معتبر نیست.");
  }
  return date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getJalaliDateParts(isoDate: string): JalaliDateParts {
  const date = parseIsoDate(isoDate);
  const parts = Object.fromEntries(
    persianCalendar.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function fromJalali(parts: JalaliDateParts): string {
  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.month) ||
    !Number.isInteger(parts.day) ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1
  ) {
    throw new Error("تاریخ شمسی معتبر نیست.");
  }

  // Search the Gregorian year range containing this Jalali year. Using Intl's
  // Persian calendar avoids hand-maintained leap-year tables and stays timezone-neutral.
  const start = Date.UTC(parts.year + 620, 0, 1, 12);
  const end = Date.UTC(parts.year + 623, 0, 1, 12);
  let lastDay: { day: number; iso: string } | undefined;
  for (let time = start; time < end; time += 86_400_000) {
    const iso = new Date(time).toISOString().slice(0, 10);
    const current = getJalaliDateParts(iso);
    if (current.year !== parts.year || current.month !== parts.month) continue;
    if (current.day === parts.day) return iso;
    if (!lastDay || current.day > lastDay.day) lastDay = { day: current.day, iso };
  }
  if (lastDay && parts.day > lastDay.day) return lastDay.iso;
  throw new Error("امکان تبدیل تاریخ شمسی وجود ندارد.");
}

/** Add Jalali calendar months while retaining the original day as the anchor.
 * If the target month is shorter, clamp only that period to its final day.
 */
export function addJalaliMonths(anchorIso: string, months: number): string {
  parseIsoDate(anchorIso);
  if (!Number.isInteger(months) || months < 0) {
    throw new Error("تعداد ماه باید عدد صحیح نامنفی باشد.");
  }
  const anchor = getJalaliDateParts(anchorIso);
  const absoluteMonth = anchor.year * 12 + anchor.month - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  return fromJalali({ year, month, day: anchor.day });
}

/** Build consecutive inclusive periods; every boundary is calculated from the
 * original activation date so a short month never permanently shifts the anchor.
 */
export function buildSubscriptionPeriods(
  startsOn: string,
  durationMonths: number,
): SubscriptionPeriod[] {
  parseIsoDate(startsOn);
  if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 3) {
    throw new Error("مدت اشتراک باید یک، دو یا سه ماه باشد.");
  }
  return Array.from({ length: durationMonths }, (_, index) => {
    const periodStart = addJalaliMonths(startsOn, index);
    const nextStart = addJalaliMonths(startsOn, index + 1);
    const end = new Date(`${nextStart}T12:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    return {
      periodNumber: index + 1,
      startsOn: periodStart,
      endsOn: toIso(end),
    };
  });
}
