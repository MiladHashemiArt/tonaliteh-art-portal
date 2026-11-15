import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { parseLocalDate, toIsoDate, toPersianDigits } from "@/lib/domain/persian";

type JalaliDatePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  onOpenChange?: (open: boolean) => void;
};

const monthNames = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const weekdays = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const jalaliFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function jalaliParts(date: Date) {
  const parts = jalaliFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function firstGregorianDateOfJalaliMonth(year: number, month: number): Date {
  // Search a broad Gregorian window around the Persian year. A narrow window
  // can fail on some Intl implementations and make valid dates appear disabled.
  const start = new Date(year + 620, 0, 1);
  const end = new Date(year + 623, 0, 1);
  for (let candidate = start; candidate < end; candidate.setDate(candidate.getDate() + 1)) {
    const parts = jalaliParts(candidate);
    if (parts.year === year && parts.month === month && parts.day === 1) {
      return new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    }
  }
  throw new Error(`Unable to resolve Persian calendar month ${year}/${month}`);
}

function formatJalali(date: Date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function JalaliDatePicker({
  id,
  value,
  onChange,
  label = "انتخاب تاریخ",
  onOpenChange,
}: JalaliDatePickerProps) {
  const selected = value
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date();
  const selectedParts = jalaliParts(selected);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const [view, setView] = useState({ year: selectedParts.year, month: selectedParts.month });

  function changeOpen(next: boolean) {
    if (next && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const spaceAbove = rect.top - gap - viewportPadding;
      const openBelow = spaceBelow >= Math.min(360, spaceAbove) || spaceBelow >= 360;
      const availableHeight = Math.max(180, openBelow ? spaceBelow : spaceAbove);
      const desiredHeight = Math.min(520, availableHeight);
      const top = openBelow ? rect.bottom + gap : Math.max(viewportPadding, rect.top - gap - desiredHeight);
      setPopupStyle({
        position: "fixed",
        top,
        right: Math.max(viewportPadding, window.innerWidth - rect.right),
        width: Math.min(rect.width, window.innerWidth - viewportPadding * 2),
        maxHeight: availableHeight,
        overflowY: "auto",
        overscrollBehavior: "contain",
        zIndex: 2147483647,
      });
    }
    setOpen(next);
    onOpenChange?.(next);
  }

  useEffect(() => {
    if (!value) return;
    const parts = jalaliParts(parseLocalDate(value));
    setView({ year: parts.year, month: parts.month });
  }, [value]);

  const days = useMemo(() => {
    const first = firstGregorianDateOfJalaliMonth(view.year, view.month);
    const nextMonth = view.month === 12
      ? firstGregorianDateOfJalaliMonth(view.year + 1, 1)
      : firstGregorianDateOfJalaliMonth(view.year, view.month + 1);
    const daysInMonth = Math.round((nextMonth.getTime() - first.getTime()) / 86_400_000);
    const offset = (first.getDay() + 1) % 7;

    // Build only this Persian month. Leading empty cells preserve Saturday-first
    // alignment; every actual date in the month is selectable.
    return Array.from({ length: offset + daysInMonth }, (_, index) => {
      if (index < offset) return null;
      const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index - offset);
      return { date, parts: jalaliParts(date) };
    });
  }, [view]);

  function moveMonth(delta: number) {
    const absolute = view.year * 12 + view.month - 1 + delta;
    setView({ year: Math.floor(absolute / 12), month: (((absolute % 12) + 12) % 12) + 1 });
  }

  return (
    <div className={`relative min-w-0 w-full ${open ? "z-50" : ""}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => changeOpen(!open)}
        className="flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
          {value ? formatJalali(selected) : label}
        </span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          style={popupStyle}
          className="rounded-xl border border-border bg-card p-3 shadow-2xl"
          dir="rtl"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="ماه بعد"
              className="rounded-lg p-2 hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">
              {monthNames[view.month - 1]} {toPersianDigits(view.year)}
            </p>
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="ماه قبل"
              className="rounded-lg p-2 hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => (
              <span key={day} className="py-1 text-[10px] text-muted-foreground">
                {day.slice(0, 1)}
              </span>
            ))}
            {days.map((entry, index) => {
              if (!entry) return <span key={index} aria-hidden="true" />;
              const iso = toIsoDate(entry.date);
              const active = iso === value;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    changeOpen(false);
                  }}
                  className={`aspect-square rounded-lg text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {toPersianDigits(entry.parts.day)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2">
            <button
              type="button"
              className="text-xs text-bronze hover:underline"
              onClick={() => {
                const today = new Date();
                onChange(toIsoDate(today));
                const p = jalaliParts(today);
                setView({ year: p.year, month: p.month });
                changeOpen(false);
              }}
            >
              امروز
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => changeOpen(false)}
            >
              بستن
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
