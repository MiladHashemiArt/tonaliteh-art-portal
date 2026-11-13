import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/lib/backend/announcements";
import { announcementsQuery, friendlyError, qk } from "@/lib/backend/queries";
import type { AnnouncementRow } from "@/lib/backend/types";
import {
  ANNOUNCEMENT_CONTENT_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  canManageAnnouncements,
  validateAnnouncement,
  type AnnouncementErrors,
  type AnnouncementInput,
} from "@/lib/domain/announcements";
import { formatDateFa, formatRelativeFa, toPersianDigits } from "@/lib/domain/persian";
import { homePathForRole } from "@/lib/domain/roles";
import { cn } from "@/lib/utils";

type AnnouncementsSearch = { id?: string };

export const Route = createFileRoute("/app/announcements")({
  validateSearch: (search: Record<string, unknown>): AnnouncementsSearch => {
    const id = search["id"];
    return typeof id === "string" || typeof id === "number" ? { id: String(id) } : {};
  },
  head: () => ({
    meta: [
      { title: "تابلوی اطلاعیه‌ها | تنالیته" },
      {
        name: "description",
        content: "اطلاعیه‌های رسمی گروه هنری تنالیته برای هنرجویان و کادر آموزشی.",
      },
    ],
  }),
  component: AnnouncementsPage,
});

const dayFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long" });

type EditorState = { mode: "create" } | { mode: "edit"; row: AnnouncementRow } | null;

function AnnouncementsPage() {
  const { user, role } = useAppSession();
  const { id: focusId } = Route.useSearch();
  const queryClient = useQueryClient();
  const announcements = useQuery(announcementsQuery());
  const canManage = canManageAnnouncements(role);
  const [editor, setEditor] = useState<EditorState>(null);
  const [toDelete, setToDelete] = useState<AnnouncementRow | null>(null);

  useEffect(() => {
    if (!focusId || !announcements.data) return;
    document
      .getElementById(`ann-${focusId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, announcements.data]);

  const save = useMutation({
    mutationFn: async (input: AnnouncementInput & { id?: string | undefined }) => {
      if (input.id) await updateAnnouncement(input.id, input);
      else await createAnnouncement(user.id, input);
    },
    onSuccess: (_d, input) => {
      toast.success(
        input.id ? "اطلاعیه ویرایش شد." : "اطلاعیه منتشر شد و برای هنرجویان اعلان فرستاده می‌شود.",
      );
      setEditor(null);
      queryClient.invalidateQueries({ queryKey: qk.announcements });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      toast.success("اطلاعیه حذف شد.");
      setToDelete(null);
      queryClient.invalidateQueries({ queryKey: qk.announcements });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const rows = announcements.data ?? [];

  return (
    <>
      <PageHeader
        back={{ to: homePathForRole(role), label: "خانه" }}
        eyebrow="تابلوی اعلانات"
        title="اطلاعیه‌ها"
        description={
          canManage
            ? "اطلاعیهٔ تازه منتشر کنید یا اطلاعیه‌های قبلی را ویرایش و حذف کنید. با انتشار هر اطلاعیه، به همهٔ هنرجویان اعلان می‌رسد."
            : "خبرها و اطلاعیه‌های رسمی آموزشگاه."
        }
        actions={
          canManage && (
            <Button onClick={() => setEditor({ mode: "create" })}>
              <Plus /> اطلاعیهٔ تازه
            </Button>
          )
        }
      />

      {announcements.isPending ? (
        <LoadingRows rows={3} />
      ) : announcements.error ? (
        <ErrorState error={announcements.error} onRetry={() => announcements.refetch()} />
      ) : !rows.length ? (
        <EmptyState
          icon={<Megaphone className="size-7" aria-hidden />}
          title="هنوز اطلاعیه‌ای روی تابلو نیست"
          description={
            canManage
              ? "نخستین اطلاعیه را منتشر کنید."
              : "اطلاعیه‌های تازه همین‌جا و در اعلان‌ها نمایش داده می‌شوند."
          }
          action={
            canManage && (
              <Button onClick={() => setEditor({ mode: "create" })}>
                <Plus /> اطلاعیهٔ تازه
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            {toPersianDigits(rows.length)} اطلاعیه
          </p>
          <ul className="grid gap-5 lg:grid-cols-2">
            {rows.map((a, i) => (
              <AnnouncementCard
                key={String(a.id)}
                row={a}
                featured={i === 0}
                highlighted={focusId === String(a.id)}
                mine={a.created_by === user.id}
                canManage={canManage}
                onEdit={() => setEditor({ mode: "edit", row: a })}
                onDelete={() => setToDelete(a)}
              />
            ))}
          </ul>
        </>
      )}

      {canManage && (
        <AnnouncementEditor
          state={editor}
          pending={save.isPending}
          onClose={() => setEditor(null)}
          onSubmit={(input) =>
            save.mutate({
              ...input,
              id: editor?.mode === "edit" ? String(editor.row.id) : undefined,
            })
          }
        />
      )}

      {canManage && (
        <AlertDialog
          open={!!toDelete}
          onOpenChange={(o) => !o && !remove.isPending && setToDelete(null)}
        >
          <AlertDialogContent className="bg-card">
            <AlertDialogHeader className="text-start">
              <AlertDialogTitle className="font-display">حذف اطلاعیه</AlertDialogTitle>
              <AlertDialogDescription>
                «{toDelete?.title}» از تابلو برداشته می‌شود. این کار بازگشت‌پذیر نیست.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={remove.isPending}>انصراف</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={remove.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (toDelete) remove.mutate(String(toDelete.id));
                }}
              >
                {remove.isPending ? "در حال حذف…" : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function AnnouncementCard({
  row,
  featured,
  highlighted,
  mine,
  canManage,
  onEdit,
  onDelete,
}: {
  row: AnnouncementRow;
  featured: boolean;
  highlighted: boolean;
  mine: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const date = new Date(row.created_at);
  const validDate = !Number.isNaN(date.getTime());
  return (
    <li
      id={`ann-${String(row.id)}`}
      className={cn(
        "surface relative flex scroll-mt-24 flex-col gap-4 p-5 pt-6 animate-rise sm:flex-row sm:p-6 sm:pt-7",
        featured && "lg:col-span-2",
        highlighted && "ring-2 ring-bronze ring-offset-2 ring-offset-background",
      )}
    >
      {/* Brass pin holding the sheet to the board */}
      <span
        aria-hidden
        className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full border border-bronze/60 bg-bronze shadow-paper"
      />

      {validDate && (
        <div
          className="flex w-16 shrink-0 flex-col items-center rounded-lg border border-bronze/40 bg-bronze-soft/40 px-2 py-2 text-center"
          aria-hidden
        >
          <span className="font-display text-2xl font-semibold leading-tight text-foreground">
            {dayFmt.format(date)}
          </span>
          <span className="text-[11px] text-muted-foreground">{monthFmt.format(date)}</span>
        </div>
      )}

      <article className="min-w-0 flex-1">
        <h2
          className={cn(
            "font-display font-semibold text-foreground",
            featured ? "text-xl" : "text-lg",
          )}
        >
          {row.title}
        </h2>
        <div className="bronze-rule my-3 opacity-60" />
        {row.content ? (
          <p className="whitespace-pre-line break-words text-sm leading-8 text-foreground/90">
            {row.content}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">بدون متن تکمیلی</p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          <time dateTime={row.created_at}>{validDate ? formatDateFa(row.created_at) : ""}</time>
          {validDate && " · "}
          {formatRelativeFa(row.created_at)}
          {canManage && mine && " · منتشرشده توسط شما"}
        </p>
      </article>

      {canManage && (
        <div className="flex shrink-0 gap-1 self-end sm:flex-col sm:self-start">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label={`ویرایش «${row.title}»`}
            title="ویرایش"
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            aria-label={`حذف «${row.title}»`}
            title="حذف"
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

function AnnouncementEditor({
  state,
  pending,
  onClose,
  onSubmit,
}: {
  state: EditorState;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: AnnouncementInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<AnnouncementErrors>({});

  useEffect(() => {
    if (!state) return;
    setTitle(state.mode === "edit" ? state.row.title : "");
    setContent(state.mode === "edit" ? (state.row.content ?? "") : "");
    setErrors({});
  }, [state]);

  const editing = state?.mode === "edit";

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-xl">
        <DialogHeader className="text-start">
          <DialogTitle className="font-display">
            {editing ? "ویرایش اطلاعیه" : "اطلاعیهٔ تازه"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "ویرایش، اعلان تازه‌ای برای هنرجویان نمی‌فرستد."
              : "پس از انتشار، برای همهٔ هنرجویان اعلان فرستاده می‌شود."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const input = { title, content };
            const found = validateAnnouncement(input);
            setErrors(found);
            if (Object.keys(found).length) return;
            onSubmit(input);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ann-title">عنوان</Label>
            <Input
              id="ann-title"
              value={title}
              maxLength={ANNOUNCEMENT_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "ann-title-err" : undefined}
              autoFocus
            />
            {errors.title && (
              <p id="ann-title-err" className="text-xs text-destructive">
                {errors.title}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-content">متن اطلاعیه</Label>
            <Textarea
              id="ann-content"
              rows={7}
              value={content}
              maxLength={ANNOUNCEMENT_CONTENT_MAX}
              onChange={(e) => setContent(e.target.value)}
              aria-invalid={!!errors.content}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="text-destructive">{errors.content}</span>
              <span>
                {toPersianDigits(content.length)} / {toPersianDigits(ANNOUNCEMENT_CONTENT_MAX)}
              </span>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              انصراف
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "در حال ذخیره…" : editing ? "ذخیرهٔ تغییرات" : "انتشار اطلاعیه"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
