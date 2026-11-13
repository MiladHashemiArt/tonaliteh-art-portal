import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { EmptyState, ErrorState, LoadingRows } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";
import type { StudentArtworkReviewRow, StudentArtworkRow } from "@/lib/backend/types";
import { formatDateFa } from "@/lib/domain/persian";

export const Route = createFileRoute("/app/student/portfolio")({
  head: () => ({ meta: [{ title: "پرونده هنری من | تنالیته" }] }),
  component: StudentPortfolioPage,
});

const artworkQueryKey = (userId: string) => ["student-artworks", userId] as const;

function StudentPortfolioPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const artworks = useQuery({
    queryKey: artworkQueryKey(user.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_artworks")
        .select("id, student_id, title, description, object_path, teacher_note, reviewed_by, reviewed_at, created_at, updated_at")
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as StudentArtworkRow[];
      return Promise.all(rows.map(async (row) => {
        const { data: signed, error: signedError } = await supabase.storage
          .from("student-artworks")
          .createSignedUrl(row.object_path, 60 * 60);
        if (signedError) throw signedError;
        return { ...row, imageUrl: signed.signedUrl };
      }));
    },
  });

  const reviews = useQuery({
    queryKey: ["student-artwork-reviews", user.id, artworks.data?.map((item) => item.id).join(",")],
    enabled: !!artworks.data,
    queryFn: async () => {
      const artworkIds = (artworks.data ?? []).map((item) => item.id);
      if (!artworkIds.length) return [] as StudentArtworkReviewRow[];
      const { data, error } = await supabase
        .from("student_artwork_reviews")
        .select("id, artwork_id, reviewer_id, reviewer_name, note, created_at")
        .in("artwork_id", artworkIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudentArtworkReviewRow[];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("عنوان اثر را وارد کنید.");
      if (!file) throw new Error("ابتدا تصویر اثر را انتخاب کنید.");
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(file.type)) throw new Error("فقط تصویر JPG، PNG یا WebP مجاز است.");
      if (file.size > 8 * 1024 * 1024) throw new Error("حجم تصویر نباید بیشتر از ۸ مگابایت باشد.");

      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const objectPath = user.id + "/" + crypto.randomUUID() + "." + extension;
      const { error: uploadError } = await supabase.storage
        .from("student-artworks")
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("student_artworks").insert({
        student_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        object_path: objectPath,
      });
      if (insertError) {
        await supabase.storage.from("student-artworks").remove([objectPath]);
        throw insertError;
      }
    },
    onSuccess: async () => {
      toast.success("اثر به پرونده هنری شما اضافه شد.");
      setTitle("");
      setDescription("");
      setFile(null);
      const picker = document.getElementById("artwork-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
      await queryClient.invalidateQueries({ queryKey: artworkQueryKey(user.id) });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const remove = useMutation({
    mutationFn: async (artwork: StudentArtworkRow) => {
      const { error: rowError } = await supabase
        .from("student_artworks")
        .delete()
        .eq("id", artwork.id)
        .eq("student_id", user.id);
      if (rowError) throw rowError;
      const { error: fileError } = await supabase.storage
        .from("student-artworks")
        .remove([artwork.object_path]);
      if (fileError) throw fileError;
    },
    onSuccess: async () => {
      toast.success("اثر از پرونده شما حذف شد.");
      await queryClient.invalidateQueries({ queryKey: artworkQueryKey(user.id) });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const total = useMemo(() => artworks.data?.length ?? 0, [artworks.data]);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="مسیر رشد هنری"
        title="پرونده هنری من"
        description="تمرین‌ها و آثار خودت را ثبت کن تا روند پیشرفتت در طول زمان کنار هم بماند."
      />

      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <Section title="ثبت اثر تازه">
          <form
            className="surface space-y-4 p-5"
            onSubmit={(event) => { event.preventDefault(); upload.mutate(); }}
          >
            <div className="space-y-2">
              <Label htmlFor="artwork-title">عنوان اثر</Label>
              <Input id="artwork-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="مثلاً طراحی پرتره با مداد" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artwork-description">توضیح و تاریخ تمرین (اختیاری)</Label>
              <Textarea id="artwork-description" value={description} maxLength={1200} onChange={(event) => setDescription(event.target.value)} placeholder="موضوع تمرین، تکنیک یا نکته‌ای که دوست داری استاد بداند…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artwork-file">تصویر اثر</Label>
              <Input id="artwork-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="h-auto min-h-11 py-2 file:me-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5" />
              <p className="text-xs leading-6 text-muted-foreground">فرمت JPG، PNG یا WebP؛ حداکثر ۸ مگابایت. آثار فقط برای خودت و استاد/مدیریت قابل مشاهده‌اند.</p>
            </div>
            <Button type="submit" className="w-full" disabled={upload.isPending}>
              <ImagePlus className="size-4" />
              {upload.isPending ? "در حال بارگذاری…" : "افزودن به پرونده هنری"}
            </Button>
          </form>
        </Section>

        <Section title={`آثار ثبت‌شده · ${total}`}>
          {artworks.isPending ? (
            <LoadingRows rows={3} />
          ) : artworks.error ? (
            <ErrorState error={artworks.error} onRetry={() => void artworks.refetch()} />
          ) : !artworks.data?.length ? (
            <EmptyState title="هنوز اثری ثبت نکرده‌ای" description="اولین طراحی یا نقاشی‌ات را بارگذاری کن تا پرونده هنری‌ات شکل بگیرد." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {artworks.data.map((artwork) => (
                <li key={artwork.id} className="surface overflow-hidden">
                  <img src={artwork.imageUrl} alt={artwork.title} className="aspect-[4/3] w-full bg-muted object-contain" loading="lazy" />
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-semibold">{artwork.title}</h3>
                      <Button type="button" variant="ghost" size="icon" aria-label="حذف اثر" disabled={remove.isPending} onClick={() => {
                        if (window.confirm("این اثر از پرونده هنری‌ات حذف شود؟")) remove.mutate(artwork);
                      }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {artwork.description && <p className="text-sm leading-6 text-muted-foreground">{artwork.description}</p>}
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-xs font-semibold text-bronze">تاریخچهٔ بازخورد استاد</p>
                      {reviews.isPending ? <p className="text-xs text-muted-foreground">در حال دریافت بازخوردها…</p>
                        : reviews.error ? <p className="text-xs text-destructive">دریافت تاریخچه با مشکل روبه‌رو شد.</p>
                        : (() => {
                          const history = (reviews.data ?? []).filter((review) => review.artwork_id === artwork.id);
                          if (!history.length && artwork.teacher_note) {
                            return <div className="rounded-md bg-bronze/5 p-3">
                              <p className="mb-1 text-xs text-muted-foreground">{artwork.reviewed_at ? formatDateFa(artwork.reviewed_at, true) : "بازخورد قبلی"}</p>
                              <p className="text-sm leading-6">{artwork.teacher_note}</p>
                            </div>;
                          }
                          if (!history.length) return <p className="text-xs text-muted-foreground">هنوز بازخوردی از استاد ثبت نشده است.</p>;
                          return <ol className="space-y-3">
                            {history.map((review) => <li key={review.id} className="border-r-2 border-bronze/40 pr-3">
                              <p className="mb-1 text-xs text-muted-foreground">{review.reviewer_name || "استاد"} · {formatDateFa(review.created_at, true)}</p>
                              <p className="whitespace-pre-wrap text-sm leading-6">{review.note}</p>
                            </li>)}
                          </ol>;
                        })()}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
