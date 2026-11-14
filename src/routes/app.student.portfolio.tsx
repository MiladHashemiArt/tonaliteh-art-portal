import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ImagePlus, Trash2, Globe, LockKeyhole, Award, BookOpenCheck, Clock3, Sparkles, CalendarDays } from "lucide-react";
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

function feedbackSections(note: string) {
  const labels = ["نقاط قوت هنرجو", "زمینه‌های نیازمند تمرین", "تمرین پیشنهادی بعدی", "یادداشت تکمیلی استاد"];
  const sections: { title: string; body: string }[] = [];
  const lines = note.split("\n");
  let currentTitle = "";
  let currentBody: string[] = [];
  const flush = () => {
    if (currentTitle && currentBody.join("\n").trim()) {
      sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
    }
  };
  for (const line of lines) {
    const label = labels.find((item) => line.trim() === item + ":");
    if (label) {
      flush();
      currentTitle = label;
      currentBody = [];
    } else if (currentTitle) {
      currentBody.push(line);
    }
  }
  flush();
  return sections;
}

function StudentPortfolioPage() {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [technique, setTechnique] = useState("");
  const [materials, setMaterials] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [publicationConsent, setPublicationConsent] = useState<Record<string, boolean>>({});
  const [file, setFile] = useState<File | null>(null);

  const artworks = useQuery({
    queryKey: artworkQueryKey(user.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_artworks")
        .select("id, student_id, title, description, object_path, teacher_note, reviewed_by, reviewed_at, created_at, updated_at, visibility, publication_consent_at, published_at, technique, materials, dimensions, duration_minutes")
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
        technique: technique.trim() || null,
        materials: materials.trim() || null,
        dimensions: dimensions.trim() || null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
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
      setTechnique("");
      setMaterials("");
      setDimensions("");
      setDurationMinutes("");
      setFile(null);
      const picker = document.getElementById("artwork-file") as HTMLInputElement | null;
      if (picker) picker.value = "";
      await queryClient.invalidateQueries({ queryKey: artworkQueryKey(user.id) });
    },
    onError: (error) => toast.error(friendlyError(error)),
  });

  const setPublication = useMutation({
    mutationFn: async ({ artworkId, publish }: { artworkId: string; publish: boolean }) => {
      if (publish && !publicationConsent[artworkId]) {
        throw new Error("برای انتشار، ابتدا رضایت خودت را تأیید کن.");
      }
      const { error } = await supabase.rpc("set_student_artwork_publication", {
        _artwork_id: artworkId,
        _publish: publish,
      });
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      setPublicationConsent((current) => ({ ...current, [variables.artworkId]: false }));
      toast.success(variables.publish ? "اثر با رضایت تو در گالری منتشر شد." : "اثر از گالری خارج شد و خصوصی شد.");
      await queryClient.invalidateQueries({ queryKey: artworkQueryKey(user.id) });
      await queryClient.invalidateQueries({ queryKey: ["student-community-gallery"] });
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
  const progress = useMemo(() => {
    const rows = artworks.data ?? [];
    const reviewedIds = new Set((reviews.data ?? []).map((review) => review.artwork_id));
    const reviewedCount = rows.filter((artwork) => reviewedIds.has(artwork.id) || !!artwork.teacher_note).length;
    const publishedCount = rows.filter((artwork) => artwork.visibility === "published").length;
    const practiceMinutes = rows.reduce((sum, artwork) => sum + (artwork.duration_minutes ?? 0), 0);
    const techniques = new Set(rows.map((artwork) => artwork.technique?.trim()).filter(Boolean)).size;
    const milestones = [
      { label: "اولین اثر ثبت شد", detail: "پرونده هنری‌ات آغاز شده است.", earned: rows.length >= 1, icon: ImagePlus },
      { label: "پنج اثر در پرونده", detail: "پنج تجربه و تمرین ثبت‌شده.", earned: rows.length >= 5, icon: Award },
      { label: "ده اثر در پرونده", detail: "ده گام ثبت‌شده در مسیر هنری.", earned: rows.length >= 10, icon: Sparkles },
      { label: "اولین بازخورد استاد", detail: "گفت‌وگوی آموزشی درباره آثارت آغاز شده.", earned: reviewedCount >= 1, icon: BookOpenCheck },
      { label: "اولین اثر در گالری", detail: "با رضایت خودت اثری را با اعضا به اشتراک گذاشته‌ای.", earned: publishedCount >= 1, icon: Globe },
    ];
    return { reviewedCount, publishedCount, practiceMinutes, techniques, milestones };
  }, [artworks.data, reviews.data]);

  const timeline = useMemo(() => {
    const rows = artworks.data ?? [];
    const history = reviews.data ?? [];
    const groups = new Map<string, { month: string; entries: { artwork: StudentArtworkRow; reviewCount: number; latestReview: StudentArtworkReviewRow | null }[] }>();
    for (const artwork of rows) {
      const date = new Date(artwork.created_at);
      const month = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long" }).format(date);
      const group = groups.get(month) ?? { month, entries: [] };
      const artworkReviews = history.filter((review) => review.artwork_id === artwork.id);
      group.entries.push({ artwork, reviewCount: artworkReviews.length, latestReview: artworkReviews[0] ?? null });
      groups.set(month, group);
    }
    return Array.from(groups.values());
  }, [artworks.data, reviews.data]);

  return (
    <>
      <PageHeader
        back={{ to: "/app/student", label: "خانه" }}
        eyebrow="مسیر رشد هنری"
        title="پرونده هنری من"
        description="تمرین‌ها و آثار خودت را ثبت کن تا روند پیشرفتت در طول زمان کنار هم بماند."
      />

      <Section title="نقشهٔ مسیر هنری تو">
        {artworks.isPending || reviews.isPending ? <LoadingRows rows={2} /> : artworks.error || reviews.error ? (
          <p className="text-sm text-muted-foreground">برای نمایش جمع‌بندی مسیر، ابتدا اطلاعات پرونده و بازخوردها باید بارگذاری شوند.</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="surface p-4"><p className="font-display text-2xl font-semibold">{total.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">اثر ثبت‌شده</p></div>
              <div className="surface p-4"><p className="font-display text-2xl font-semibold">{progress.reviewedCount.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">اثر دارای بازخورد</p></div>
              <div className="surface p-4"><p className="font-display text-2xl font-semibold">{progress.techniques.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">تکنیک ثبت‌شده</p></div>
              <div className="surface p-4"><p className="flex items-center gap-2 font-display text-2xl font-semibold"><Clock3 className="size-5 text-bronze" />{progress.practiceMinutes.toLocaleString("fa-IR")}</p><p className="text-xs text-muted-foreground">دقیقه تمرین ثبت‌شده</p></div>
            </div>
            <div>
              <h3 className="mb-3 font-display font-semibold">نشان‌های مسیر</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {progress.milestones.map(({ label, detail, earned, icon: Icon }) => (
                  <div key={label} className={`rounded-xl border p-4 ${earned ? "border-bronze/40 bg-bronze/5" : "border-border"}`}>
                    <div className="mb-2 flex items-center gap-2">
                      <Icon className={`size-5 ${earned ? "text-bronze" : "text-muted-foreground"}`} />
                      <span className="text-sm font-semibold">{label}</span>
                    </div>
                    <p className="text-xs leading-6 text-muted-foreground">{detail}</p>
                    <p className="mt-2 text-xs font-medium">{earned ? "به دست آمده" : "با ثبت تجربه‌های بعدی فعال می‌شود"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center gap-2"><Sparkles className="size-5 text-bronze" /><h3 className="font-display font-semibold">چالش آرام این هفته</h3></div>
              <p className="text-sm leading-7 text-muted-foreground">یک شیء ساده را در سه ارزش نوری طراحی کن: روشن، نیم‌سایه و تیره. ۲۰ دقیقه زمان بگذار، سپس اثر را در پرونده‌ات ثبت کن و بنویس در کدام بخش تناسب یا حجم‌پردازی برایت دشوارتر بود.</p>
              <p className="mt-2 text-xs text-muted-foreground">این تمرین پیشنهادی است؛ انجام‌ندادن آن هیچ امتیاز یا سابقه‌ای را از تو کم نمی‌کند.</p>
            </div>
          </div>
        )}
      </Section>

      <Section title="دفتر مسیر در گذر زمان">
        {artworks.isPending || reviews.isPending ? <LoadingRows rows={2} />
          : artworks.error || reviews.error ? <p className="text-sm text-muted-foreground">تاریخچه تمرین‌ها در حال حاضر در دسترس نیست.</p>
          : !timeline.length ? <EmptyState title="هنوز نقطه‌ای در مسیر ثبت نشده" description="با افزودن اولین اثر، دفتر مسیر هنری تو شکل می‌گیرد." />
          : <div className="space-y-6">
            {timeline.map((group) => <div key={group.month}>
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="size-4 text-bronze" />
                <h3 className="font-display font-semibold">{group.month}</h3>
                <span className="text-xs text-muted-foreground">· {group.entries.length.toLocaleString("fa-IR")} اثر</span>
              </div>
              <ol className="space-y-3 border-r border-border pr-4">
                {group.entries.map(({ artwork, reviewCount, latestReview }) => <li key={artwork.id} className="relative rounded-xl border border-border p-4">
                  <span className="absolute -right-[21px] top-5 size-2.5 rounded-full border-2 border-background bg-bronze" />
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{artwork.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateFa(artwork.created_at, true)}</p>
                    </div>
                    {reviewCount > 0 && <span className="rounded-full bg-bronze/10 px-2.5 py-1 text-xs text-bronze">{reviewCount.toLocaleString("fa-IR")} بازخورد استاد</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {artwork.technique && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.technique}</span>}
                    {artwork.duration_minutes != null && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.duration_minutes.toLocaleString("fa-IR")} دقیقه تمرین</span>}
                    {artwork.materials && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.materials}</span>}
                  </div>
                  {latestReview && <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="mb-1 text-xs font-semibold text-bronze">آخرین همراهی استاد</p>
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6">{latestReview.note}</p>
                  </div>}
                </li>)}
              </ol>
            </div>)}
          </div>}
      </Section>

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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="artwork-technique">تکنیک (اختیاری)</Label>
                <Input id="artwork-technique" value={technique} maxLength={100} onChange={(event) => setTechnique(event.target.value)} placeholder="مثلاً طراحی با مداد" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artwork-materials">متریال (اختیاری)</Label>
                <Input id="artwork-materials" value={materials} maxLength={160} onChange={(event) => setMaterials(event.target.value)} placeholder="مثلاً مداد گرافیتی، مقوای اشتنباخ" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artwork-dimensions">ابعاد (اختیاری)</Label>
                <Input id="artwork-dimensions" value={dimensions} maxLength={80} onChange={(event) => setDimensions(event.target.value)} placeholder="مثلاً ۳۰ × ۴۰ سانتی‌متر" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artwork-duration">مدت تمرین به دقیقه (اختیاری)</Label>
                <Input id="artwork-duration" type="number" min={1} max={100000} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="مثلاً ۹۰" />
              </div>
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
                    {(artwork.technique || artwork.materials || artwork.dimensions || artwork.duration_minutes) && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {artwork.technique && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.technique}</span>}
                        {artwork.materials && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.materials}</span>}
                        {artwork.dimensions && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.dimensions}</span>}
                        {artwork.duration_minutes && <span className="rounded-full bg-muted px-2.5 py-1">{artwork.duration_minutes.toLocaleString("fa-IR")} دقیقه تمرین</span>}
                      </div>
                    )}
                    <div className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-bronze">وضعیت انتشار در گالری</p>
                        {artwork.visibility === "published" ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Globe className="size-3.5" /> منتشرشده</span> : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" /> خصوصی</span>}
                      </div>
                      {artwork.visibility === "published" ? (
                        <Button type="button" variant="outline" size="sm" className="w-full" disabled={setPublication.isPending} onClick={() => setPublication.mutate({ artworkId: artwork.id, publish: false })}>
                          <LockKeyhole className="size-4" /> خارج‌کردن از گالری و خصوصی‌کردن
                        </Button>
                      ) : (
                        <div className="space-y-3">
                          <label className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
                            <input type="checkbox" className="mt-1 size-4 accent-current" checked={!!publicationConsent[artwork.id]} onChange={(event) => setPublicationConsent((current) => ({ ...current, [artwork.id]: event.target.checked }))} />
                            <span>با انتشار این اثر در گالری اعضای تنالیته موافقم. عنوان، توضیحات، تصویر، تکنیک، متریال و ابعاد اثر برای اعضای واردشده قابل مشاهده خواهد بود. می‌توانم هر زمان انتشار را لغو کنم.</span>
                          </label>
                          <Button type="button" size="sm" className="w-full" disabled={!publicationConsent[artwork.id] || setPublication.isPending} onClick={() => setPublication.mutate({ artworkId: artwork.id, publish: true })}>
                            <Globe className="size-4" /> انتشار در گالری هنرجویان
                          </Button>
                        </div>
                      )}
                    </div>
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
                            {history.map((review) => {
                              const sections = feedbackSections(review.note);
                              return <li key={review.id} className="space-y-3 border-r-2 border-bronze/40 pr-3">
                                <p className="text-xs text-muted-foreground">{review.reviewer_name || "استاد"} · {formatDateFa(review.created_at, true)}</p>
                                {sections.length ? <div className="grid gap-2 sm:grid-cols-2">
                                  {sections.map((section) => <div key={section.title} className="rounded-lg bg-muted/50 p-3">
                                    <p className="mb-1 text-xs font-semibold text-bronze">{section.title}</p>
                                    <p className="whitespace-pre-wrap text-sm leading-6">{section.body}</p>
                                  </div>)}
                                </div> : <p className="whitespace-pre-wrap text-sm leading-6">{review.note}</p>}
                              </li>;
                            })}
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
