import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { friendlyError } from "@/lib/backend/queries";

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="در حال بارگذاری">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-center"
    >
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <p className="text-sm text-foreground">{friendlyError(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <div className="mb-1 text-bronze">{icon ?? <Inbox className="size-7" aria-hidden />}</div>
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function SetupNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm leading-7 text-foreground">
      {children}
    </div>
  );
}
