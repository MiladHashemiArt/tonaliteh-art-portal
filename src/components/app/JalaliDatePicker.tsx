import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { toIsoDate, toPersianDigits } from "@/lib/domain/persian";

type JalaliDatePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

const monthNames = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
const weekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const jalaliFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric", month: "numeric", day: "numeric",
});

function jalaliParts(date: Date) {
  const parts = jalaliFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function firstGregorianDateOfJalaliMonth(year: number, month: number): Date {
  const start = new Date(year + 621, 2, 1);
  for (let offset = -100; offset <= 300; offset += 1) {
    const candidate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    const parts = jalaliParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === 1) return candidate;
  }
  return new Date();
}

function formatJalali(date: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

export function JalaliDatePicker({ id, value, onChange, label = "انتخاب تاریخ" }: JalaliDatePickerProps) {
  const selected = value ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) : new Date();
  const selectedParts = jalaliParts(selected);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: selectedParts.year, month: selectedParts.month });

  const days = useMemo(() => {
    const first = firstGregorianDateOfJalaliMonth(view.year, view.month);
    const offset = (first.getDay() + 1) % 7;
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index - offset);
      const parts = jalaliParts(date);
      return { date, parts, inMonth: parts.year === view.year && parts.month === view.month };
    });
  }, [view]);

  function moveMonth(delta: number) {
    const absolute = view.year * 12 + view.month - 1 + delta;
    setView({ year: Math.floor(absolute / 12), month: ((absolute % 12) + 12) % 12 + 1 });
  }

  return (
    <div className="relative min-w-0 w-full">
      <button
        id={id}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {value ? formatJalali(selected) : label}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-full min-w-[280px] max-w-[min(340px,calc(100vw-3rem))] rounded-xl border border-border bg-card p-3 shadow-xl" dir="rtl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => moveMonth(1)} aria-label="ماه بعد" className="rounded-lg p-2 hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">{monthNames[view.month - 1]} {toPersianDigits(view.year)}</p>
            <button type="button" onClick={() => moveMonth(-1)} aria-label="ماه قبل" className="rounded-lg p-2 hover:bg-muted">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => <span key={day} className="py-1 text-[10px] text-muted-foreground">{day.slice(0, 1)}</span>)}
            {days.map(({ date, parts, inMonth }, index) => {
              const iso = toIsoDate(date);
              const active = iso === value;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className={`aspect-square rounded-lg text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : inMonth ? "hover:bg-muted" : "text-muted-foreground/30"}`}
                >
                  {toPersianDigits(parts.day)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2">
            <button type="button" className="text-xs text-bronze hover:underline" onClick={() => { const today = new Date(); onChange(toIsoDate(today)); const p = jalaliParts(today); setView({ year: p.year, month: p.month }); setOpen(false); }}>
              امروز
            </button>
            <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setOpen(false)}>بستن</button>
          </div>
        </div>
      )}
    </div>
  );
}
