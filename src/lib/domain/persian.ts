const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Parse a "YYYY-MM-DD" date as a local calendar date (no timezone shift). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const dateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const dateWeekdayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export function formatDateFa(value: string | Date | null | undefined, withWeekday = false): string {
  if (!value) return "—";
  const date =
    value instanceof Date ? value : value.length <= 10 ? parseLocalDate(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return (withWeekday ? dateWeekdayFmt : dateFmt).format(date);
}

export function formatTimeFa(value: string | null | undefined): string {
  if (!value) return "—";
  return toPersianDigits(value.slice(0, 5));
}

export function formatAmountFa(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(toLatinDigits(String(value)));
  if (Number.isNaN(n)) return String(value);
  return `${n.toLocaleString("fa-IR")} تومان`;
}

export function formatRelativeFa(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "همین حالا";
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const h = Math.round(min / 60);
  if (h < 24) return `${toPersianDigits(h)} ساعت پیش`;
  const d = Math.round(h / 24);
  if (d < 7) return `${toPersianDigits(d)} روز پیش`;
  return formatDateFa(value);
}
