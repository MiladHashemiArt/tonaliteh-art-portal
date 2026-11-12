import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BellOff, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/hooks/use-app-session";
import { markNotificationsRead } from "@/lib/backend/notifications";
import { friendlyError, notificationsQuery, qk } from "@/lib/backend/queries";
import type { NotificationRow } from "@/lib/backend/types";
import {
  NOTIFICATION_KIND_LABEL,
  notificationKind,
  notificationTarget,
  type NotificationTarget,
} from "@/lib/domain/notifications";
import { formatRelativeFa, toPersianDigits } from "@/lib/domain/persian";
import { homePathForRole } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";

type NotificationsSearch = { show?: "unread" };

export const Route = createFileRoute("/app/notifications")({
  validateSearch: (search: Record<string, unknown>): NotificationsSearch =>
    search["show"] === "unread" ? { show: "unread" } : {},
  head: () => ({
    meta: [
      { title: "اعلان‌ها | تنالیته" },
      { name: "description", content: "صندوق اعلان‌های شخصی شما در پنل تنالیته." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, role } = useAppSession();
  const { show } = Route.useSearch();
  const queryClient = useQueryClient();
  const key = qk.notifications(user.id);
  const list = useQuery(notificationsQuery(user.id));

  const markRead = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(user.id, ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationRow[]>(key);
      const now = new Date().toISOString();
      const set = new Set(ids);
      queryClient.setQueryData<NotificationRow[]>(key, (old) =>
        old?.map((n) => (set.has(String(n.id)) && !n.read_at ? { ...n, read_at: now } : n)),
      );
      return { previous };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error(friendlyError(e));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const all = list.data ?? [];
  const unreadIds = all.filter((n) => !n.read_at).map((n) => String(n.id));
  const visible = show === "unread" ? all.filter((n) => !n.read_at) : all;

  return (
    <>
      <PageHeader
        back={{ to: homePathForRole(role), label: "خانه" }}
        eyebrow="صندوق شخصی"
        title="اعلان‌ها"
        description={
          unreadIds.length
            ? `${toPersianDigits(unreadIds.length)} اعلان خوانده‌نشده دارید.`
            : "همهٔ اعلان‌های شما خوانده شده است."
        }
        actions={
          unreadIds.length > 0 && (
            <Button variant="outline" onClick={() => markRead.mutate(unreadIds)} disabled={markRead.isPending}>
              <CheckCheck /> خواندن همه
            </Button>
          )
        }
      />

      <div role="tablist" aria-label="نمایش اعلان‌ها" className="mb-6 inline-flex rounded-full border border-border bg-card p-1">
        <FilterTab active={show !== "unread"} search={{}}>
          همه
        </FilterTab>
        <FilterTab active={show === "unread"} search={{ show: "unread" }}>
          خوانده‌نشده{unreadIds.length ? ` (${toPersianDigits(unreadIds.length)})` : ""}
        </FilterTab>
      </div>

      {list.isPending ? (
        <LoadingRows rows={4} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !visible.length ? (
        <EmptyState
          icon={<BellOff className="size-7" aria-hidden />}
          title={show === "unread" ? "اعلان خوانده‌نشده‌ای ندارید" : "هنوز اعلانی ندارید"}
          description="اطلاعیه‌های تازه و پیام‌های مربوط به شما اینجا نمایش داده می‌شوند."
        />
      ) : (
        <ul className="max-w-3xl space-y-3">
          {visible.map((n) => (
            <NotificationItem
              key={String(n.id)}
              row={n}
              target={notificationTarget(n, role)}
              onRead={() => markRead.mutate([String(n.id)])}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function FilterTab({
  active,
  search,
  children,
}: {
  active: boolean;
  search: NotificationsSearch;
  children: ReactNode;
}) {
  return (
    <Link
      to="/app/notifications"
      search={search}
      role="tab"
      aria-selected={active}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function TargetLink({
  target,
  onClick,
  children,
}: {
  target: NotificationTarget;
  onClick: () => void;
  children: ReactNode;
}) {
  const cls =
    "inline-flex items-center gap-1 text-sm font-medium text-bronze underline-offset-4 hover:underline";
  if (target.to === "/app/announcements")
    return (
      <Link to="/app/announcements" search={target.id ? { id: target.id } : {}} onClick={onClick} className={cls}>
        {children}
      </Link>
    );
  return (
    <Link to={target.to} onClick={onClick} className={cls}>
      {children}
    </Link>
  );
}

function NotificationItem({
  row,
  target,
  onRead,
}: {
  row: NotificationRow;
  target: NotificationTarget | null;
  onRead: () => void;
}) {
  const unread = !row.read_at;
  const kind = notificationKind(row.notification_type);
  return (
    <li
      className={cn(
        "surface relative flex gap-3 p-4 transition-colors sm:p-5",
        unread ? "border-s-2 border-s-bronze" : "bg-card/60 shadow-none",
      )}
    >
      <span
        aria-hidden
        className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-bronze" : "bg-transparent")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-bronze-soft px-2 py-0.5 text-[11px] text-accent-foreground">
            {NOTIFICATION_KIND_LABEL[kind]}
          </span>
          <span className="text-xs text-muted-foreground">{formatRelativeFa(row.created_at)}</span>
          <span className="sr-only">{unread ? "خوانده‌نشده" : "خوانده‌شده"}</span>
        </div>
        <p className={cn("mt-1.5 font-display text-base", unread ? "font-semibold text-foreground" : "text-foreground/80")}>
          {row.title || NOTIFICATION_KIND_LABEL[kind]}
        </p>
        {row.body && (
          <p className={cn("mt-1 whitespace-pre-line break-words text-sm leading-7", unread ? "text-foreground/90" : "text-muted-foreground")}>
            {row.body}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {target && (
            <TargetLink target={target} onClick={() => unread && onRead()}>
              مشاهده <ArrowLeft className="size-4" aria-hidden />
            </TargetLink>
          )}
          {unread && (
            <Button variant="ghost" size="sm" className="-ms-2 h-8 text-muted-foreground" onClick={onRead}>
              <Check /> خواندم
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
