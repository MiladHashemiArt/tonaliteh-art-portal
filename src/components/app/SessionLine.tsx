import type { ClassSessionRow } from "@/lib/backend/types";
import { formatDateFa, formatTimeFa } from "@/lib/domain/persian";
import { nextOccurrence, recurrenceLabel, sessionTitle, weekdayLabel } from "@/lib/domain/schedule";

import { Tone } from "./StatusBadge";

export function sessionTimeRange(s: ClassSessionRow) {
  return `${formatTimeFa(s.start_time)} تا ${formatTimeFa(s.end_time)}`;
}

export function sessionShortLabel(s: ClassSessionRow) {
  return `${weekdayLabel(s.class_day)} ${sessionTimeRange(s)} — ${sessionTitle(s)}`;
}

export function NextDate({ session }: { session: ClassSessionRow }) {
  const next = nextOccurrence(session);
  if (next.kind === "date")
    return <span className="text-xs text-muted-foreground">جلسهٔ بعد: {formatDateFa(next.date, true)}</span>;
  if (next.kind === "needs-anchor")
    return <span className="text-xs text-muted-foreground">تاریخ هفتهٔ شروع هنوز تعیین نشده</span>;
  return null;
}

export function SessionMeta({ session }: { session: ClassSessionRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tone tone={(session.recurrence_weeks ?? 1) > 1 ? "bronze" : "muted"}>
        {recurrenceLabel(session.recurrence_weeks)}
      </Tone>
      {session.is_active === false && <Tone tone="danger">غیرفعال</Tone>}
      <NextDate session={session} />
    </div>
  );
}
